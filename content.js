(async function () {
    'use strict';
    const host = location.hostname;
    const url = location.href;

    const isAutoCheck = url.includes('source=auto_check') || url.includes('source%3Dauto_check') || sessionStorage.getItem('uit_auto_check') === 'true';
    if (url.includes('source=auto_check') || url.includes('source%3Dauto_check')) {
        sessionStorage.setItem('uit_auto_check', 'true');
    }

    async function getAccount() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['uit_user', 'uit_pass'], (res) => {
                if (res.uit_user && res.uit_pass) resolve({ username: res.uit_user, password: atob(res.uit_pass) });
                else resolve(null);
            });
        });
    }

    // --- AUTO LOGIN ---
    async function runUITLogin() {
        const userInput = document.querySelector('#edit-name');
        const passInput = document.querySelector('#edit-pass');
        const captchaInput = document.querySelector('#edit-english-captcha-answer');
        const btn = document.querySelector('#edit-submit');
        const btn2 = document.querySelector('#edit-submit--2'); 

        if (!userInput || !passInput) return;
        const acc = await getAccount();
        if (!acc) return; 

        userInput.value = acc.username;
        passInput.value = acc.password;

        const solveCaptchaAndLogin = () => {
            const img = document.querySelector('.english-captcha-image img');
            if (img && captchaInput) {
                const alt = img.getAttribute('alt');
                if (alt && alt.includes(':')) {
                    captchaInput.value = alt.split(':')[1].trim();
                    setTimeout(() => { if (btn) btn.click(); }, 600);
                    setTimeout(() => { if (btn2) btn2.click(); }, 600);
                    return true;
                }
            } else if (!document.querySelector('.english-captcha-image')) {
                setTimeout(() => { if (btn) btn.click(); }, 600);
                setTimeout(() => { if (btn2) btn2.click(); }, 600);
                return true;
            }
            return false;
        };

        if (!solveCaptchaAndLogin()) {
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (solveCaptchaAndLogin() || attempts > 10) clearInterval(interval);
            }, 500);
        }
    }

    async function runCoursesLogin() {
        const userInput = document.querySelector('#username');
        const passInput = document.querySelector('#password');
        const btn = document.querySelector('#loginbtn');
        if (!userInput || !passInput || !btn) return;
        const acc = await getAccount();
        if (!acc) return;
        if (!userInput.value) userInput.value = acc.username;
        passInput.value = acc.password;
        setTimeout(() => btn.click(), 600);
    }

    // --- 1. CÀO ĐIỂM (CÓ NHÓM HỌC KỲ, KHÔNG LẤY DÒNG TỔNG KẾT) ---
    async function checkGrades() {
        if (!url.includes('/sinhvien/kqhoctap')) return;
        const rows = document.querySelectorAll('table[bordercolor="#000000"] tr');
        let currentGrades = [];
        let currentSemester = "Chưa xác định";
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            
            if (cells.length === 1 && cells[0].hasAttribute('colspan')) {
                currentSemester = cells[0].innerText.replace(/[\u00A0\s]+/g, ' ').trim();
            }

            // Loại bỏ dòng "Trung bình học kỳ"
            if (cells.length >= 10 && cells[1].innerText.trim() !== "" && !cells[2].innerText.includes("Trung bình")) {
                currentGrades.push({
                    hocKy: currentSemester,
                    maHP: cells[1].innerText.trim(),
                    tenHP: cells[2].innerText.trim(),
                    tc: cells[3].innerText.trim(),
                    diemQT: cells[4].innerText.trim(),
                    diemGK: cells[5].innerText.trim(),
                    diemTH: cells[6].innerText.trim(),
                    diemCK: cells[7].innerText.trim(),
                    diemHP: cells[8].innerText.trim(),
                    ghiChu: cells[9].innerText.trim()
                });
            }
        });

        chrome.storage.local.get(['saved_grades'], (res) => {
            const oldGrades = res.saved_grades || [];
            if (currentGrades.length > 0 && JSON.stringify(currentGrades) !== JSON.stringify(oldGrades)) {
                chrome.runtime.sendMessage({ action: "notifyUpdates", title: "Cập nhật bảng điểm UIT!", content: "Vừa có thay đổi trong Kết quả học tập của bạn." });
            }
            if (currentGrades.length > 0) chrome.storage.local.set({ saved_grades: currentGrades });
            cleanUpTab();
        });
    }

    // --- 2. CÀO LỊCH THI ---
    async function checkExams() {
        if (!url.includes('/sinhvien/lichhoc/lichthi')) return;
        const rows = document.querySelectorAll('table tr');
        let currentExams = [];
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 8 && cells[1].innerText.trim() !== "" && !cells[0].innerText.includes("Hiện tại bạn")) {
                currentExams.push({
                    stt: cells[0].innerText.trim(),
                    maMH: cells[1].innerText.trim(),
                    maLop: cells[2].innerText.trim(),
                    caThi: cells[3].innerText.trim(),
                    thuThi: cells[4].innerText.trim(),
                    ngayThi: cells[5].innerText.trim(),
                    phongThi: cells[6].innerText.trim(),
                    ghiChu: cells[7].innerText.trim()
                });
            }
        });

        chrome.storage.local.get(['saved_exams'], (res) => {
            const oldExams = res.saved_exams || [];
            if (currentExams.length > 0 && JSON.stringify(currentExams) !== JSON.stringify(oldExams)) {
                chrome.runtime.sendMessage({ action: "notifyUpdates", title: "Có Lịch thi mới!", content: "Phòng đào tạo vừa cập nhật Lịch thi." });
            }
            if (currentExams.length > 0) chrome.storage.local.set({ saved_exams: currentExams });
            cleanUpTab();
        });
    }

    // --- 3. CÀO TKB ICS & ĐA LUỒNG 10 TRANG ---
    async function scrapeTKB_ICS() {
        if (!url.includes('/sinhvien/tkb')) return;
        const icsLinkElem = document.querySelector('a[href^="/ics/tkb/"]');
        if (!icsLinkElem) { cleanUpTab(); return; }

        try {
            const response = await fetch(icsLinkElem.href);
            let icsData = await response.text();
            icsData = icsData.replace(/\r\n /g, ''); 

            const events = [];
            const eventBlocks = icsData.split('BEGIN:VEVENT');

            for (let i = 1; i < eventBlocks.length; i++) {
                const block = eventBlocks[i];
                const dtStartMatch = block.match(/DTSTART.*?:(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
                const summaryMatch = block.match(/SUMMARY:(.*)/);
                const descMatch = block.match(/DESCRIPTION:(.*)/);
                const rruleMatch = block.match(/RRULE:(.*)/);

                if (dtStartMatch && summaryMatch && descMatch) {
                    const startDateStr = `${dtStartMatch[1]}-${dtStartMatch[2]}-${dtStartMatch[3]}`;
                    const summary = summaryMatch[1].trim();
                    const description = descMatch[1].trim();
                    
                    const tietMatch = description.match(/Tiết ([\d]+)/);
                    let startTiet = 1; let spanTiet = 1;
                    if (tietMatch) {
                        const tStr = tietMatch[1];
                        startTiet = parseInt(tStr[0], 10);
                        if (startTiet === 0) startTiet = 10; 
                        spanTiet = tStr.length;
                    } else if (description.toLowerCase().includes("tối")) {
                        startTiet = 11; 
                        spanTiet = 1;
                    }

                    const gvMatch = description.match(/Giảng viên: (.*?),/);
                    const teacher = gvMatch ? gvMatch[1] : "Chưa cập nhật";

                    let interval = 1;
                    let untilDateStr = '2099-12-31'; 
                    if (rruleMatch) {
                        const intMatch = rruleMatch[1].match(/INTERVAL=(\d+)/);
                        if (intMatch) interval = parseInt(intMatch[1], 10);
                        const untilMatch = rruleMatch[1].match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
                        if (untilMatch) untilDateStr = `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}`;
                    }

                    const jsDate = new Date(startDateStr);
                    let dayOfWeek = jsDate.getDay() + 1; 
                    if (dayOfWeek === 1) dayOfWeek = 8; 

                    events.push({
                        title: summary, fullDesc: description, teacher: teacher,
                        dayOfWeek: dayOfWeek, startTiet: startTiet, spanTiet: spanTiet,
                        startDate: startDateStr, untilDate: untilDateStr, interval: interval
                    });
                }
            }

            const htmlCards = document.querySelectorAll('.tkb-card');
            htmlCards.forEach(card => {
                const titles = card.querySelectorAll('.title');
                if (titles.length < 2) return;
                const courseCode = titles[0].innerText.trim();
                const textContent = card.innerText; 
                
                const regexExtra = /Tiết\s+([\d,]+)\s+ngày\s+(\d{4}-\d{2}-\d{2})(?:,\s*(.+))?/g;
                let match;
                while ((match = regexExtra.exec(textContent)) !== null) {
                    const tiets = match[1].split(',').map(Number);
                    const dateStr = match[2];
                    const room = match[3] ? match[3].trim() : "Chưa cập nhật";
                    const jsDate = new Date(dateStr);
                    let dayOfWeek = jsDate.getDay() + 1; 
                    if (dayOfWeek === 1) dayOfWeek = 8; 

                    events.push({
                        title: `${courseCode} (BÙ)`, fullDesc: `Phòng: ${room}`, teacher: "Chi tiết trên DAA",
                        dayOfWeek: dayOfWeek, startTiet: tiets[0], spanTiet: tiets.length,
                        startDate: dateStr, untilDate: dateStr, interval: 1, isMakeup: true
                    });
                }
            });

            // FETCH ĐỒNG THỜI 10 TRANG THÔNG BÁO BÙ / NGHỈ
            const fetchPromises = [];
            for (let page = 0; page <= 10; page++) {
                fetchPromises.push(fetch(`https://daa.uit.edu.vn/thong-bao-nghi-bu?page=${page}`).then(res => res.text()));
            }
            
            const pagesHtml = await Promise.all(fetchPromises);
            const parser = new DOMParser();

            pagesHtml.forEach((htmlNghiBu) => {
                const doc = parser.parseFromString(htmlNghiBu, 'text/html');
                const articles = doc.querySelectorAll('article');

                articles.forEach(article => {
                    const titleElem = article.querySelector('h2 a');
                    if (!titleElem) return;
                    
                    const articleTitle = titleElem.innerText.trim();
                    const rawText = article.innerText; 

                    const classMatchBody = rawText.match(/Lớp\s*:\s*([A-Za-z0-9.\-_]+)/i);
                    const classMatchTitle = articleTitle.match(/\(([A-Za-z0-9.\-_]+)\)/i);
                    const classCode = classMatchBody ? classMatchBody[1].trim() : (classMatchTitle ? classMatchTitle[1].trim() : null);

                    const roomMatch = rawText.match(/Phòng\s*:\s*([A-Za-z0-9.\-_]*)/i);
                    const startTietMatch = rawText.match(/Tiết\s*bắt\s*đầu\s*:\s*(\d+)/i);
                    const endTietMatch = rawText.match(/Tiết\s*kết\s*thúc\s*:\s*(\d+)/i);
                    const teacherMatch = rawText.match(/CBGD\s*:\s*([^\n]+)/i);

                    const dateMatchBody = rawText.match(/ngày\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
                    const dateMatchTitle = articleTitle.match(/ngày\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
                    const finalDateMatch = dateMatchBody || dateMatchTitle;

                    if (classCode && finalDateMatch && startTietMatch && endTietMatch) {
                        const dateStr = `${finalDateMatch[3]}-${finalDateMatch[2].padStart(2, '0')}-${finalDateMatch[1].padStart(2, '0')}`;
                        const isMakeup = articleTitle.toLowerCase().includes("bù");
                        const isCancelled = articleTitle.toLowerCase().includes("nghỉ");

                        const matchedCourse = events.find(c => {
                            const baseCode = c.title.split('(')[0].trim(); 
                            return classCode.includes(baseCode) || baseCode.includes(classCode);
                        });
                        
                        if (matchedCourse) {
                            const startTiet = parseInt(startTietMatch[1], 10);
                            const endTiet = parseInt(endTietMatch[1], 10);
                            const spanTiet = endTiet - startTiet + 1;
                            const room = (roomMatch && roomMatch[1].trim() !== "") ? roomMatch[1].trim() : "Chưa cập nhật";
                            const teacher = teacherMatch ? teacherMatch[1].trim() : matchedCourse.teacher;
                            
                            const jsDate = new Date(dateStr);
                            let dayOfWeek = jsDate.getDay() + 1; 
                            if (dayOfWeek === 1) dayOfWeek = 8;
                            
                            if (isMakeup) {
                                events.push({
                                    title: `${classCode} (BÙ)`, fullDesc: `Phòng: ${room}`, teacher: teacher,
                                    dayOfWeek: dayOfWeek, startTiet: startTiet, spanTiet: spanTiet,
                                    startDate: dateStr, untilDate: dateStr, interval: 1, isMakeup: true
                                });
                            } else if (isCancelled) {
                                events.push({
                                    title: `${classCode} (NGHỈ)`, fullDesc: `Nghỉ học`, teacher: teacher,
                                    dayOfWeek: dayOfWeek, startTiet: startTiet, spanTiet: spanTiet,
                                    startDate: dateStr, untilDate: dateStr, interval: 1, isCancelled: true
                                });
                            }
                        }
                    }
                });
            });

            if (events.length > 0) chrome.storage.local.set({ saved_tkb_ics: events });
        } catch (e) { console.error("Lỗi cào file ICS", e); } 
        finally { cleanUpTab(); }
    }

    function cleanUpTab() {
        if (isAutoCheck) {
            sessionStorage.removeItem('uit_auto_check');
            setTimeout(() => chrome.runtime.sendMessage({ action: "closeAutoTab" }), 2000);
        }
    }

    if (isAutoCheck) setTimeout(() => { chrome.runtime.sendMessage({ action: "closeAutoTab" }); }, 15000);

    // --- MAIN RUNNER ---
    if (host.includes("student.uit.edu.vn") || host.includes("daa.uit.edu.vn")) {
        if (document.querySelector('#edit-name') && document.querySelector('#edit-pass')) {
            runUITLogin(); 
        } else {
            checkGrades();
            checkExams();
            scrapeTKB_ICS();
        }
    } else if (host.includes("courses.uit.edu.vn")) {
        runCoursesLogin();
    }
})();