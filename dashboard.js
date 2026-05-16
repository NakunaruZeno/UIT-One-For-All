let currentViewDate = new Date(); 

function getMonday(d) {
    let day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(new Date(d).setDate(diff));
}

document.addEventListener('DOMContentLoaded', () => {
    // Xử lý chuyển Tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
            e.currentTarget.classList.add('active');
            document.getElementById(e.currentTarget.getAttribute('data-tab')).classList.add('active');
        });
    });

    initGridBackground();

    // Sự kiện nút bấm
    document.getElementById('btn-prev').addEventListener('click', () => changeWeek(-7));
    document.getElementById('btn-next').addEventListener('click', () => changeWeek(7));
    
    document.getElementById('btn-clear-alerts').addEventListener('click', () => {
        chrome.storage.local.set({ tkb_alerts: [] });
        document.getElementById('alert-container').style.display = 'none';
    });

    document.getElementById('btn-fetch-exams').addEventListener('click', () => {
        const btn = document.getElementById('btn-fetch-exams');
        const lanthi = document.getElementById('exam-type').value;
        const hocky = document.getElementById('exam-term').value;
        const namhoc = document.getElementById('exam-year').value;
        
        chrome.storage.local.set({ exam_params: {lanthi, hocky, namhoc} });
        btn.textContent = "Đang cào dữ liệu ngầm...";
        
        chrome.tabs.create({ url: `https://student.uit.edu.vn/sinhvien/lichhoc/lichthi?lanthi=${lanthi}&hocky=${hocky}&namhoc=${namhoc}&source=auto_check_exam`, active: false });
    });

    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === "examsUpdated") {
            renderExams();
            const btn = document.getElementById('btn-fetch-exams');
            if (btn) {
                btn.textContent = "Đã cập nhật!";
                setTimeout(() => { btn.textContent = "Cập nhật Lịch Thi"; }, 2000);
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

// DOM Builder an toàn thay cho innerHTML
function createEl(tag, className = '', textContent = '') {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (textContent) el.textContent = textContent;
    return el;
}

function initGridBackground() {
    const dynamicClasses = document.getElementById('dynamic-classes');
    const times = ["(7:30 - 8:15)", "(8:15 - 9:00)", "(9:00 - 9:45)", "(10:00 - 10:45)", "(10:45 - 11:30)", "(13:00 - 13:45)", "(13:45 - 14:30)", "(14:30 - 15:15)", "(15:30 - 16:15)", "(16:15 - 17:00)", "(17:45 - 20:45)"];
    const tietNames = ["Tiết 1", "Tiết 2", "Tiết 3", "Tiết 4", "Tiết 5", "Tiết 6", "Tiết 7", "Tiết 8", "Tiết 9", "Tiết 10", "Buổi tối"];
    
    for(let i=0; i<11; i++) {
        const timeCol = createEl('div', 'time-col');
        timeCol.style.gridColumn = '1'; timeCol.style.gridRow = i+2;
        timeCol.innerHTML = `${tietNames[i]}<br>${times[i]}`; // Nội dung tĩnh tĩnh an toàn
        dynamicClasses.parentNode.insertBefore(timeCol, dynamicClasses);
        
        for(let j=2; j<=7; j++) {
            const cell = createEl('div', 'tkb-cell');
            cell.style.gridColumn = j; cell.style.gridRow = i+2;
            dynamicClasses.parentNode.insertBefore(cell, dynamicClasses);
        }
    }
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
            ul.textContent = ''; // Xóa sạch an toàn
            res.tkb_alerts.forEach(alert => {
                const li = createEl('li');
                li.style.marginBottom = '8px';
                
                const b = createEl('b', '', alert.courseName);
                const a = createEl('a', '', '🔗 Xem chi tiết');
                a.href = alert.link; a.target = '_blank';
                
                li.append("Môn ", b, `: ${alert.title} `, a);
                ul.appendChild(li);
            });
        }
    });
}

function renderTKB() {
    const monday = getMonday(currentViewDate);
    const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);

    const pad = (n) => n.toString().padStart(2, '0');
    document.getElementById('week-display').textContent = `Tuần: ${pad(monday.getDate())}/${pad(monday.getMonth()+1)}/${monday.getFullYear()} -> ${pad(sunday.getDate())}/${pad(sunday.getMonth()+1)}/${sunday.getFullYear()}`;

    chrome.storage.local.get(['saved_tkb_ics'], (res) => {
        const events = res.saved_tkb_ics || [];
        const container = document.getElementById('dynamic-classes');
        container.textContent = ''; 

        let weekEvents = [];

        events.forEach(ev => {
            const evStart = new Date(ev.startDate);
            const evUntil = new Date(ev.untilDate);
            const evMonday = getMonday(evStart);
            const diffWeeks = Math.round((monday.getTime() - evMonday.getTime()) / (1000 * 60 * 60 * 24 * 7));

            if (diffWeeks >= 0 && monday <= evUntil && (diffWeeks % ev.interval === 0)) {
                if (ev.isCancelled) return; 

                let currentEv = ev;
                if (!ev.isMakeup) {
                    const eventDate = new Date(monday);
                    eventDate.setDate(monday.getDate() + (ev.dayOfWeek === 8 ? 6 : ev.dayOfWeek - 2));
                    const eventDateStr = `${eventDate.getFullYear()}-${pad(eventDate.getMonth()+1)}-${pad(eventDate.getDate())}`;
                    const baseCode = ev.title.split(' - ')[0].trim();
                    
                    const isCancelledToday = events.some(c => c.isCancelled && c.startDate === eventDateStr && (baseCode === c.title.split(' ')[0].trim() || baseCode.startsWith(c.title.split(' ')[0].trim() + '.')));

                    if (isCancelledToday) {
                        currentEv = Object.assign({}, ev);
                        currentEv.isCancelled = true;
                        currentEv.title = baseCode + " (NGHỈ)";
                    }
                }

                let startRow = currentEv.startTiet + 1;
                if (currentEv.startTiet === 0) startRow = 11; 
                if (currentEv.startTiet === 11) startRow = 12; 

                weekEvents.push({ ev: currentEv, col: currentEv.dayOfWeek, start: startRow, span: currentEv.spanTiet, end: startRow + currentEv.spanTiet - 1 });
            }
        });

        let columns = {2:[], 3:[], 4:[], 5:[], 6:[], 7:[], 8:[]};
        weekEvents.forEach(e => columns[e.col].push(e));

        function createCardNode(ev, isItem = false) {
            let cardClass = 'class-card';
            if (ev.isMakeup) cardClass += ' makeup-card';
            else if (ev.isCancelled) cardClass += ' cancelled-card';
            else if (ev.title.includes('.1') || ev.fullDesc.includes('HT1') || ev.fullDesc.includes('TH')) cardClass += ' ht1-card';
            if (isItem) cardClass += ' overlap-item';

            const div = createEl('div', cardClass);
            const parts = ev.title.split(' - ');
            const room = parts.length > 1 ? parts[1] : (ev.fullDesc.includes('Phòng:') ? ev.fullDesc : "");

            div.appendChild(createEl('div', 'class-title', parts[0]));
            div.appendChild(createEl('div', 'class-room', room));
            
            const teacherDiv = createEl('div', '', ev.teacher);
            teacherDiv.style.marginTop = '4px'; teacherDiv.style.fontSize = '0.8em';
            div.appendChild(teacherDiv);
            
            return div;
        }

        for (let col in columns) {
            let evs = columns[col].sort((a,b) => a.start - b.start);
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
                    let wrapper = createEl('div');
                    wrapper.style.gridColumn = col; wrapper.style.gridRow = `${group[0].start} / span ${group[0].span}`; wrapper.style.zIndex = 10;
                    wrapper.appendChild(createCardNode(group[0].ev));
                    container.appendChild(wrapper);
                } else {
                    let wrapper = createEl('div', 'overlap-container');
                    wrapper.style.gridColumn = col; wrapper.style.gridRow = `${groupStart} / span ${groupEnd - groupStart + 1}`; wrapper.style.zIndex = 20;
                    
                    let trigger = createEl('div', 'overlap-trigger');
                    trigger.innerHTML = `⚠️ Trùng ${group.length} lịch<br>(Rê chuột vào)`; // Nội dung tĩnh an toàn
                    
                    let list = createEl('div', 'overlap-list');
                    group.forEach(g => list.appendChild(createCardNode(g.ev, true)));
                    
                    wrapper.append(trigger, list);
                    container.appendChild(wrapper);
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
        tbody.textContent = ''; 

        if (grades.length === 0) {
            const tr = createEl('tr');
            const td = createEl('td', '', 'Đang chờ quét dữ liệu điểm... Hãy mở trang KQHT trên web trường.');
            td.colSpan = 9; tr.appendChild(td); tbody.appendChild(tr);
            return;
        }

        let currentKy = "";
        grades.forEach(g => {
            if (g.hocKy !== currentKy && g.hocKy !== "Chưa xác định") {
                currentKy = g.hocKy;
                const headerTr = createEl('tr'); headerTr.style.backgroundColor = '#45475a';
                const headerTd = createEl('td', '', `📌 ${currentKy}`);
                headerTd.colSpan = 9; headerTd.style.cssText = 'text-align: left; font-weight: bold; color: #f5c2e7; padding-left: 15px;';
                headerTr.appendChild(headerTd); tbody.appendChild(headerTr);
            }

            const tr = createEl('tr');
            const keys = ['maHP', 'tenHP', 'tc', 'diemQT', 'diemGK', 'diemTH', 'diemCK', 'diemHP', 'ghiChu'];
            keys.forEach(k => {
                const td = createEl('td', '', g[k]);
                if (k === 'tenHP') td.style.cssText = 'text-align:left; font-weight:bold;';
                if (k === 'diemHP') td.style.cssText = 'color:#a6e3a1; font-weight:bold;';
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    });
}

function renderExams() {
    chrome.storage.local.get(['saved_exams'], (res) => {
        const exams = res.saved_exams || [];
        const tbody = document.querySelector('#exams-table tbody');
        tbody.textContent = ''; 

        if (exams.length === 0) {
            const tr = createEl('tr');
            const td = createEl('td', '', 'Hiện tại chưa có lịch thi nào hoặc đang chờ đồng bộ...');
            td.colSpan = 8; tr.appendChild(td); tbody.appendChild(tr);
            return;
        }
        
        exams.forEach(e => {
            const tr = createEl('tr');
            const keys = ['stt', 'maMH', 'maLop', 'caThi', 'thuThi', 'ngayThi', 'phongThi', 'ghiChu'];
            keys.forEach(k => {
                const td = createEl('td', '', e[k]);
                if (k === 'maMH') td.style.cssText = 'color:#f5c2e7; font-weight:bold;';
                if (k === 'ngayThi') td.style.color = '#a6e3a1';
                if (k === 'phongThi') td.style.cssText = 'color:#f38ba8; font-weight:bold;';
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    });
}