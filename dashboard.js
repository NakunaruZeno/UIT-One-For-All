let currentViewDate = new Date(); 

function getMonday(d) {
    d = new Date(d);
    var day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
}

document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
            e.currentTarget.classList.add('active');
            const targetId = e.currentTarget.getAttribute('data-tab');
            document.getElementById(targetId).classList.add('active');
        });
    });

    initGridBackground();

    document.getElementById('btn-prev').addEventListener('click', () => changeWeek(-7));
    document.getElementById('btn-next').addEventListener('click', () => changeWeek(7));
    
    document.getElementById('btn-clear-alerts').addEventListener('click', () => {
        chrome.storage.local.set({ tkb_alerts: [] });
        document.getElementById('alert-container').style.display = 'none';
    });

    // --- SỰ KIỆN TẢI LỊCH THI BẰNG TAB ẨN ---
    document.getElementById('btn-fetch-exams').addEventListener('click', () => {
        const btn = document.getElementById('btn-fetch-exams');
        const lanthi = document.getElementById('exam-type').value;
        const hocky = document.getElementById('exam-term').value;
        const namhoc = document.getElementById('exam-year').value;
        
        chrome.storage.local.set({ exam_params: {lanthi, hocky, namhoc} });
        btn.innerText = "Đang cào dữ liệu ngầm...";
        
        const url = `https://student.uit.edu.vn/sinhvien/lichhoc/lichthi?lanthi=${lanthi}&hocky=${hocky}&namhoc=${namhoc}&source=auto_check_exam`;
        chrome.tabs.create({ url: url, active: false });
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "examsUpdated") {
            renderExams();
            const btn = document.getElementById('btn-fetch-exams');
            if (btn) {
                btn.innerText = "Đã cập nhật!";
                setTimeout(() => { btn.innerText = "Cập nhật Lịch Thi"; }, 2000);
            }
        }
    });

    chrome.storage.local.get(['exam_params'], (res) => {
        if(res.exam_params) {
            document.getElementById('exam-type').value = res.exam_params.lanthi;
            document.getElementById('exam-term').value = res.exam_params.hocky;
            document.getElementById('exam-year').value = res.exam_params.namhoc;
        }
    });

    renderAlerts();
    renderTKB();
    renderGrades();
    renderExams();
});

function initGridBackground() {
    const dynamicClasses = document.getElementById('dynamic-classes');
    const times = ["(7:30 - 8:15)", "(8:15 - 9:00)", "(9:00 - 9:45)", "(10:00 - 10:45)", "(10:45 - 11:30)", "(13:00 - 13:45)", "(13:45 - 14:30)", "(14:30 - 15:15)", "(15:30 - 16:15)", "(16:15 - 17:00)", "(17:45 - 20:45)"];
    const tietNames = ["Tiết 1", "Tiết 2", "Tiết 3", "Tiết 4", "Tiết 5", "Tiết 6", "Tiết 7", "Tiết 8", "Tiết 9", "Tiết 10", "Buổi tối"];
    
    let gridHTML = '';
    for(let i=0; i<11; i++) {
        gridHTML += `<div class="time-col" style="grid-column: 1; grid-row: ${i+2}">${tietNames[i]}<br>${times[i]}</div>`;
        for(let j=2; j<=7; j++) {
            gridHTML += `<div class="tkb-cell" style="grid-column: ${j}; grid-row: ${i+2}"></div>`;
        }
    }
    dynamicClasses.insertAdjacentHTML('beforebegin', gridHTML);
}

function changeWeek(days) {
    currentViewDate.setDate(currentViewDate.getDate() + days);
    renderTKB();
}

function renderAlerts() {
    chrome.storage.local.get(['tkb_alerts'], (res) => {
        if (res.tkb_alerts && res.tkb_alerts.length > 0) {
            document.getElementById('alert-container').style.display = 'block';
            const ul = document.getElementById('alert-list');
            ul.innerHTML = '';
            res.tkb_alerts.forEach(alert => {
                ul.innerHTML += `<li style="margin-bottom: 8px;">Môn <b>${alert.courseName}</b>: ${alert.title} <a href="${alert.link}" target="_blank">🔗 Xem chi tiết</a></li>`;
            });
        }
    });
}

function renderTKB() {
    const monday = getMonday(currentViewDate);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const formatDate = (date) => `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear()}`;
    document.getElementById('week-display').innerText = `Tuần: ${formatDate(monday)} -> ${formatDate(sunday)}`;

    chrome.storage.local.get(['saved_tkb_ics'], (res) => {
        const events = res.saved_tkb_ics || [];
        const container = document.getElementById('dynamic-classes');
        container.innerHTML = ''; 

        let weekEvents = [];

        events.forEach(ev => {
            const evStart = new Date(ev.startDate);
            const evUntil = new Date(ev.untilDate);
            const evMonday = getMonday(evStart);
            
            const diffTime = monday.getTime() - evMonday.getTime();
            const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));

            if (diffWeeks >= 0 && monday <= evUntil && (diffWeeks % ev.interval === 0)) {
                
                // 1. Nếu đây là sự kiện "NGHỈ" độc lập, CHẶN không cho vẽ ra TKB để tránh trùng lịch 
                if (ev.isCancelled) return; 

                let currentEv = ev;

                // 2. Nếu đây là môn học bình thường, đi tìm xem hôm đó nó có bị thông báo NGHỈ không
                if (!ev.isMakeup) {
                    const eventDate = new Date(monday);
                    eventDate.setDate(monday.getDate() + (ev.dayOfWeek === 8 ? 6 : ev.dayOfWeek - 2));
                    const eventDateStr = `${eventDate.getFullYear()}-${(eventDate.getMonth()+1).toString().padStart(2,'0')}-${eventDate.getDate().toString().padStart(2,'0')}`;

                    const baseCode = ev.title.split(' - ')[0].trim();
                    
                    const isCancelledToday = events.some(c => {
                        if (!c.isCancelled || c.startDate !== eventDateStr) return false;
                        const cancelledCode = c.title.split(' ')[0].trim(); // Tách "IE108.Q21 (NGHỈ)" thành "IE108.Q21"
                        return baseCode === cancelledCode || baseCode.startsWith(cancelledCode + '.');
                    });

                    if (isCancelledToday) {
                        // Nếu có nghỉ, Tích hợp trạng thái NGHỈ thẳng vào sự kiện gốc này!
                        currentEv = Object.assign({}, ev); // Clone ra để không hỏng data gốc
                        currentEv.isCancelled = true;
                        currentEv.title = baseCode + " (NGHỈ)";
                    }
                }

                let startRow = currentEv.startTiet + 1;
                if (currentEv.startTiet === 0) startRow = 11; 
                if (currentEv.startTiet === 11) startRow = 12; 

                weekEvents.push({
                    ev: currentEv,
                    col: currentEv.dayOfWeek,
                    start: startRow,
                    span: currentEv.spanTiet,
                    end: startRow + currentEv.spanTiet - 1
                });
            }
        });

        let columns = {2:[], 3:[], 4:[], 5:[], 6:[], 7:[], 8:[]};
        weekEvents.forEach(e => columns[e.col].push(e));

        function getCardHTML(ev, isItem = false) {
            let cardClass = 'class-card';
            if (ev.isMakeup) cardClass += ' makeup-card';
            else if (ev.isCancelled) cardClass += ' cancelled-card'; // Lớp CSS này sẽ tự động gạch ngang chữ
            else if (ev.title.includes('.1') || ev.fullDesc.includes('HT1') || ev.fullDesc.includes('TH')) cardClass += ' ht1-card';
            if (isItem) cardClass += ' overlap-item';

            const parts = ev.title.split(' - ');
            const courseName = parts[0];
            const room = parts.length > 1 ? parts[1] : (ev.fullDesc.includes('Phòng:') ? ev.fullDesc : "");

            return `
                <div class="${cardClass}">
                    <div class="class-title">${courseName}</div>
                    <div class="class-room">${room}</div>
                    <div style="margin-top: 4px; font-size: 0.8em;">${ev.teacher}</div>
                </div>
            `;
        }

        for (let col in columns) {
            let evs = columns[col];
            evs.sort((a,b) => a.start - b.start);
            
            let i = 0;
            while (i < evs.length) {
                let group = [evs[i]];
                let groupEnd = evs[i].end;
                let groupStart = evs[i].start;
                
                let j = i + 1;
                while (j < evs.length && evs[j].start <= groupEnd) {
                    group.push(evs[j]);
                    groupEnd = Math.max(groupEnd, evs[j].end);
                    j++;
                }
                
                if (group.length === 1) {
                    let g = group[0];
                    container.innerHTML += `<div style="grid-column: ${col}; grid-row: ${g.start} / span ${g.span}; z-index: 10;">
                                    ${getCardHTML(g.ev)}
                                </div>`;
                } else {
                    let listHTML = group.map(g => getCardHTML(g.ev, true)).join('');
                    container.innerHTML += `
                        <div class="overlap-container" style="grid-column: ${col}; grid-row: ${groupStart} / span ${groupEnd - groupStart + 1}; z-index: 20;">
                            <div class="overlap-trigger">⚠️ Trùng ${group.length} lịch<br>(Rê chuột vào)</div>
                            <div class="overlap-list">
                                ${listHTML}
                            </div>
                        </div>
                    `;
                }
                i = j;
            }
        }
    });
}

function renderGrades() {
    chrome.storage.local.get(['saved_grades'], (res) => {
        const grades = res.saved_grades || [];
        const tbody = document.querySelector('#grades-table tbody');
        if (grades.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9">Đang chờ quét dữ liệu điểm... Hãy mở trang KQHT trên web trường.</td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        let currentKy = "";

        grades.forEach(g => {
            if (g.hocKy !== currentKy && g.hocKy !== "Chưa xác định") {
                currentKy = g.hocKy;
                tbody.innerHTML += `
                    <tr style="background-color: #45475a;">
                        <td colspan="9" style="text-align: left; font-weight: bold; color: #f5c2e7; padding-left: 15px;">
                            📌 ${currentKy}
                        </td>
                    </tr>
                `;
            }

            tbody.innerHTML += `<tr>
                <td>${g.maHP}</td><td style="text-align:left; font-weight:bold;">${g.tenHP}</td><td>${g.tc}</td>
                <td>${g.diemQT}</td><td>${g.diemGK}</td><td>${g.diemTH}</td>
                <td>${g.diemCK}</td><td style="color:#a6e3a1; font-weight:bold;">${g.diemHP}</td><td>${g.ghiChu}</td>
            </tr>`;
        });
    });
}

function renderExams() {
    chrome.storage.local.get(['saved_exams'], (res) => {
        const exams = res.saved_exams || [];
        const tbody = document.querySelector('#exams-table tbody');
        if (exams.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8">Hiện tại chưa có lịch thi nào hoặc đang chờ đồng bộ...</td></tr>`;
            return;
        }
        tbody.innerHTML = '';
        exams.forEach(e => {
            tbody.innerHTML += `<tr>
                <td>${e.stt}</td><td style="color:#f5c2e7; font-weight:bold;">${e.maMH}</td><td>${e.maLop}</td>
                <td>${e.caThi}</td><td>${e.thuThi}</td><td style="color:#a6e3a1;">${e.ngayThi}</td>
                <td style="color:#f38ba8; font-weight:bold;">${e.phongThi}</td><td>${e.ghiChu}</td>
            </tr>`;
        });
    });
}