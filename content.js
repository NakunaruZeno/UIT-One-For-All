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

    // --- AUTO LOGIN CHO DAA VÀ STUDENT ---
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
                    setTimeout(() => {
                        if (btn) btn.click();
                        else if (btn2) btn2.click();
                    }, 500);
                    return true;
                }
            } else if (!document.querySelector('.english-captcha-image')) {
                // Không có vùng Captcha -> Bấm Login luôn
                setTimeout(() => {
                    if (btn) btn.click();
                    else if (btn2) btn2.click();
                }, 500);
                return true;
            }
            return false;
        };

        if (!solveCaptchaAndLogin()) {
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (solveCaptchaAndLogin() || attempts > 10) {
                    clearInterval(interval);
                }
            }, 500);
        }
    }

    // --- AUTO LOGIN CHO COURSES ---
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

    // --- CÀO ĐIỂM ---
    async function checkGrades() {
        if (!url.includes('/sinhvien/kqhoctap')) return;
        const rows = document.querySelectorAll('table[bordercolor="#000000"] tr');
        let currentGrades = {};
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 10) {
                const id = cells[1].innerText.trim();
                const name = cells[2].innerText.trim();
                const grade = cells[8].innerText.trim(); 
                if (id && name) currentGrades[id] = { name, grade };
            }
        });

        chrome.storage.local.get(['saved_grades'], (res) => {
            const oldGrades = res.saved_grades || {};
            let hasChanges = false;
            let changeMessage = "";

            for (const [id, data] of Object.entries(currentGrades)) {
                if (!oldGrades[id] || oldGrades[id].grade !== data.grade) {
                    hasChanges = true;
                    if (data.grade !== "") changeMessage += `Môn ${data.name}: ${data.grade} điểm\n`;
                }
            }
            chrome.storage.local.set({ saved_grades: currentGrades });
            
            if (hasChanges && changeMessage !== "") {
                chrome.runtime.sendMessage({ action: "notifyGrades", content: "Đã có điểm mới!\n" + changeMessage });
            }
            cleanUpTab();
        });
    }

    // --- CÀO TKB (ICS + HTML Hybrid) ---
// --- CÀO TKB (ICS + HTML Hybrid + Deep Scan Nghỉ Bù) ---
    async function scrapeTKB_ICS() {
        if (!url.includes('/sinhvien/tkb')) return;
        const icsLinkElem = document.querySelector('a[href^="/ics/tkb/"]');
        
        if (!icsLinkElem) {
            cleanUpTab();
            return;
        }

        try {
            const response = await fetch(icsLinkElem.href);
            let icsData = await response.text();
            icsData = icsData.replace(/\r\n /g, ''); 

            const events = [];
            const eventBlocks = icsData.split('BEGIN:VEVENT');

            // 1. Quét lịch ICS
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
                    const tietList = tietMatch ? tietMatch[1] : "";
                    const startTiet = tietList.length > 0 ? parseInt(tietList[0]) : 0;
                    const spanTiet = tietList.length;

                    const gvMatch = description.match(/Giảng viên: (.*?),/);
                    const teacher = gvMatch ? gvMatch[1] : "Chưa cập nhật";

                    let interval = 1;
                    let untilDateStr = '2099-12-31'; 
                    if (rruleMatch) {
                        const rrule = rruleMatch[1];
                        const intMatch = rrule.match(/INTERVAL=(\d+)/);
                        if (intMatch) interval = parseInt(intMatch[1]);
                        const untilMatch = rrule.match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
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

            // 2. Bóc tách lịch bù gõ tay trên HTML
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
                    const startTiet = tiets[0];
                    const spanTiet = tiets.length;
                    
                    const jsDate = new Date(dateStr);
                    let dayOfWeek = jsDate.getDay() + 1; 
                    if (dayOfWeek === 1) dayOfWeek = 8; 

                    events.push({
                        title: `${courseCode} (BÙ)`, fullDesc: `Phòng: ${room}`, teacher: "Chi tiết trên DAA",
                        dayOfWeek: dayOfWeek, startTiet: startTiet, spanTiet: spanTiet,
                        startDate: dateStr, untilDate: dateStr, interval: 1, isMakeup: true
                    });
                }
            });

            // 3. Cào trang Thông báo bù/nghỉ bằng DOMParser (Deep Scan 5 Trang)
            for (let page = 0; page <= 10; page++) { 
                try {
                    const resNghiBu = await fetch(`https://daa.uit.edu.vn/thong-bao-nghi-bu?page=${page}`);
                    const htmlNghiBu = await resNghiBu.text();
                    
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(htmlNghiBu, 'text/html');
                    const articles = doc.querySelectorAll('article');

                    articles.forEach(article => {
                        const titleElem = article.querySelector('h2 a');
                        if (!titleElem) return;
                        
                        const articleTitle = titleElem.innerText.trim();
                        const rawText = article.innerText; 

                        // Regex linh hoạt hơn, cho phép thiếu khoảng trắng
                        const classMatchBody = rawText.match(/Lớp\s*:\s*([A-Za-z0-9.\-_]+)/i);
                        const classMatchTitle = articleTitle.match(/\(([A-Za-z0-9.\-_]+)\)/i);
                        const classCode = classMatchBody ? classMatchBody[1].trim() : (classMatchTitle ? classMatchTitle[1].trim() : null);

                        const roomMatch = rawText.match(/Phòng\s*:\s*([A-Za-z0-9.\-_]+)/i);
                        const startTietMatch = rawText.match(/Tiết\s*bắt\s*đầu\s*:\s*(\d+)/i);
                        const endTietMatch = rawText.match(/Tiết\s*kết\s*thúc\s*:\s*(\d+)/i);
                        const teacherMatch = rawText.match(/CBGD\s*:\s*([^\n]+)/i);

                        // Tìm ngày trong nội dung HOẶC trên tiêu đề
                        const dateMatchBody = rawText.match(/ngày\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
                        const dateMatchTitle = articleTitle.match(/ngày\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
                        const finalDateMatch = dateMatchBody || dateMatchTitle;

                        if (classCode && finalDateMatch && startTietMatch && endTietMatch) {
                            // Format ngày chuẩn (YYYY-MM-DD)
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
                                const room = roomMatch ? roomMatch[1].trim() : "Chưa cập nhật";
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
                } catch (e) { console.error("Lỗi cào thông báo bù page", page, e); }
            }

            if (events.length > 0) {
                chrome.storage.local.set({ saved_tkb_ics: events });
            }
        } catch (e) { 
            console.error("Lỗi parse TKB tổng hợp", e); 
        } finally {
            cleanUpTab();
        }
    }
    function cleanUpTab() {
        if (isAutoCheck) {
            sessionStorage.removeItem('uit_auto_check');
            setTimeout(() => chrome.runtime.sendMessage({ action: "closeAutoTab" }), 2000);
        }
    }

    if (isAutoCheck) {
        setTimeout(() => { chrome.runtime.sendMessage({ action: "closeAutoTab" }); }, 15000);
    }

    // --- MAIN RUNNER ---
    if (host.includes("student.uit.edu.vn") || host.includes("daa.uit.edu.vn")) {
        if (document.querySelector('#edit-name') && document.querySelector('#edit-pass')) {
            runUITLogin(); 
        } else {
            checkGrades();
            scrapeTKB_ICS();
        }
    } else if (host.includes("courses.uit.edu.vn")) {
        runCoursesLogin();
    }
})();