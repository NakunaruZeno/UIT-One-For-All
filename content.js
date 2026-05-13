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

    // --- 1. CÀO ĐIỂM   (ĐÃ FIX LỖI SPAM THÔNG BÁO) ---
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
            let hasChanges = false;
            
            // CHỈ BÁO KHI ĐÃ TỪNG CÓ DỮ LIỆU ĐIỂM Ở LẦN TRƯỚC VÀ CÓ SỰ THAY ĐỔI
            if (oldGrades.length > 0 && currentGrades.length > 0) {
                const oldMap = {};
                oldGrades.forEach(g => { oldMap[g.maHP] = g; });
                
                for (const curr of currentGrades) {
                    const old = oldMap[curr.maHP];
                    // Nếu là môn học mới
                    if (!old) {
                        hasChanges = true;
                        break;
                    }
                }
            }

            if (hasChanges) {
                chrome.runtime.sendMessage({ action: "notifyUpdates", title: "Cập nhật bảng điểm UIT!", content: "Vừa có điểm mới được cập nhật trên DAA." });
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
                    stt: cells[0].innerText.trim(), maMH: cells[1].innerText.trim(), maLop: cells[2].innerText.trim(),
                    caThi: cells[3].innerText.trim(), thuThi: cells[4].innerText.trim(), ngayThi: cells[5].innerText.trim(),
                    phongThi: cells[6].innerText.trim(), ghiChu: cells[7].innerText.trim()
                });
            }
        });

        chrome.storage.local.get(['saved_exams'], (res) => {
            const oldExams = res.saved_exams || [];
            if (oldExams.length > 0 && currentExams.length > 0 && JSON.stringify(currentExams) !== JSON.stringify(oldExams)) {
                chrome.runtime.sendMessage({ action: "notifyUpdates", title: "Có Lịch thi mới!", content: "Phòng đào tạo vừa cập nhật Lịch thi." });
            }
            if (currentExams.length > 0) chrome.storage.local.set({ saved_exams: currentExams });
            cleanUpTab();
        });
    }

// --- 3. CÀO TKB (ICS + HTML + BÙ 30 TRANG) ---
    async function scrapeTKB_ICS() {
        if (!url.includes('/sinhvien/tkb')) return;
        const icsLinkElem = document.querySelector('a[href^="/ics/tkb/"]');
        if (!icsLinkElem) { cleanUpTab(); return; }

        try {
            const baseEvents = [];
            const response = await fetch(icsLinkElem.href);
            let icsData = await response.text();
            icsData = icsData.replace(/\r\n /g, ''); 
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
                        startTiet = 11; spanTiet = 1;
                    }

                    const gvMatch = description.match(/Giảng viên: (.*?),/);
                    let interval = 1; let untilDateStr = '2099-12-31'; 
                    if (rruleMatch) {
                        const intMatch = rruleMatch[1].match(/INTERVAL=(\d+)/);
                        if (intMatch) interval = parseInt(intMatch[1], 10);
                        const untilMatch = rruleMatch[1].match(/UNTIL=(\d{4})(\d{2})(\d{2})/);
                        if (untilMatch) untilDateStr = `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}`;
                    }

                    const jsDate = new Date(startDateStr);
                    let dayOfWeek = jsDate.getDay() + 1; 
                    if (dayOfWeek === 1) dayOfWeek = 8; 

                    baseEvents.push({
                        title: summary, fullDesc: description, teacher: gvMatch ? gvMatch[1] : "Chưa cập nhật",
                        dayOfWeek: dayOfWeek, startTiet: startTiet, spanTiet: spanTiet,
                        startDate: startDateStr, untilDate: untilDateStr, interval: interval
                    });
                }
            }

            document.querySelectorAll('.tkb-card').forEach(card => {
                const titles = card.querySelectorAll('.title');
                if (titles.length < 2) return;
                let match;
                const regexExtra = /Tiết\s+([\d,]+)\s+ngày\s+(\d{4}-\d{2}-\d{2})(?:,\s*(.+))?/g;
                while ((match = regexExtra.exec(card.innerText)) !== null) {
                    const tiets = match[1].split(',').map(Number);
                    const jsDate = new Date(match[2]);
                    let dayOfWeek = jsDate.getDay() + 1; 
                    if (dayOfWeek === 1) dayOfWeek = 8; 

                    baseEvents.push({
                        title: `${titles[0].innerText.trim()} (BÙ)`, fullDesc: `Phòng: ${match[3] ? match[3].trim() : "Chưa cập nhật"}`, teacher: "Chi tiết trên DAA",
                        dayOfWeek: dayOfWeek, startTiet: tiets[0], spanTiet: tiets.length,
                        startDate: match[2], untilDate: match[2], interval: 1, isMakeup: true
                    });
                }
            });

            // TỐI ƯU QUÉT SÂU 30 TRANG NẾU LÀ LẦN ĐẦU TIÊN
            const storageRes = await chrome.storage.local.get(['saved_custom_events', 'tkb_alerts', 'has_scraped_30_pages']);
            let customEvents = storageRes.saved_custom_events || [];
            let activeAlerts = storageRes.tkb_alerts || [];
            const maxPage = storageRes.has_scraped_30_pages ? 10 : 30; // 30 trang lần đầu, 10 trang lần sau
            let hasNewAlerts = false;

            const fetchPromises = [];
            for (let page = 0; page <= maxPage; page++) {
                fetchPromises.push(fetch(`https://daa.uit.edu.vn/thong-bao-nghi-bu?page=${page}`).then(res => res.text()).catch(()=>""));
            }
            
            const pagesHtml = await Promise.all(fetchPromises);
            const parser = new DOMParser();

            pagesHtml.forEach((htmlNghiBu) => {
                if(!htmlNghiBu) return;
                const doc = parser.parseFromString(htmlNghiBu, 'text/html');
                
                doc.querySelectorAll('article').forEach(article => {
                    const titleElem = article.querySelector('h2 a');
                    if (!titleElem) return;
                    
                    const articleTitle = titleElem.innerText.trim();
                    const hrefStr = titleElem.getAttribute('href');
                    const articleLink = hrefStr.startsWith('http') ? hrefStr : "https://daa.uit.edu.vn" + hrefStr;
                    const rawText = article.innerText; 

                    const classMatchBody = rawText.match(/Lớp\s*:\s*([A-Za-z0-9.\-_]+)/i);
                    const classMatchTitle = articleTitle.match(/\(([A-Za-z0-9.\-_]+)\)/i);
                    const classCode = classMatchBody ? classMatchBody[1].trim() : (classMatchTitle ? classMatchTitle[1].trim() : null);

                    const roomMatch = rawText.match(/Phòng\s*:\s*([A-Za-z0-9.\-_]*)/i);
                    const startTietMatch = rawText.match(/Tiết\s*bắt\s*đầu\s*:\s*(\d+)/i);
                    const endTietMatch = rawText.match(/Tiết\s*kết\s*thúc\s*:\s*(\d+)/i);
                    
                    const dateMatchBody = rawText.match(/ngày\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
                    const dateMatchTitle = articleTitle.match(/ngày\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
                    const finalDateMatch = dateMatchBody || dateMatchTitle;

                    if (classCode && finalDateMatch && startTietMatch && endTietMatch) {
                        const dateStr = `${finalDateMatch[3]}-${finalDateMatch[2].padStart(2, '0')}-${finalDateMatch[1].padStart(2, '0')}`;
                        const isMakeup = articleTitle.toLowerCase().includes("bù");
                        const isCancelled = articleTitle.toLowerCase().includes("nghỉ");

                        const matchedCourse = baseEvents.find(c => {
                            const baseCode = c.title.split('(')[0].trim(); 
                            return classCode.includes(baseCode) || baseCode.includes(classCode);
                        });
                        
                        if (matchedCourse) {
                            const uid = `${isMakeup ? 'BU' : 'NGHI'}_${classCode}_${dateStr}_${startTietMatch[1]}`;

                            if (!customEvents.some(e => e.uid === uid)) {
                                const jsDate = new Date(dateStr);
                                let dayOfWeek = jsDate.getDay() + 1; 
                                if (dayOfWeek === 1) dayOfWeek = 8;
                                
                                customEvents.push({
                                    uid: uid,
                                    title: `${classCode} ${isMakeup ? '(BÙ)' : '(NGHỈ)'}`, 
                                    fullDesc: isMakeup ? `Phòng: ${(roomMatch && roomMatch[1].trim() !== "") ? roomMatch[1].trim() : "Chưa cập nhật"}` : `Nghỉ học`, 
                                    teacher: "Chi tiết trên DAA",
                                    dayOfWeek: dayOfWeek, 
                                    startTiet: parseInt(startTietMatch[1], 10), 
                                    spanTiet: parseInt(endTietMatch[1], 10) - parseInt(startTietMatch[1], 10) + 1,
                                    startDate: dateStr, untilDate: dateStr, interval: 1, 
                                    isMakeup: isMakeup, isCancelled: isCancelled
                                });

                                if (!activeAlerts.some(a => a.link === articleLink)) {
                                    activeAlerts.push({ title: articleTitle, link: articleLink, courseName: classCode });
                                }
                                hasNewAlerts = true;

                                // Chỉ báo notification nếu không phải lần cào đầu tiên (để tránh spam 30 trang quá khứ)
                                if (storageRes.has_scraped_30_pages) {
                                    chrome.runtime.sendMessage({
                                        action: "notifyUpdates", 
                                        title: "⚠️ Lịch học thay đổi!", 
                                        content: `Môn ${classCode} vừa có thông báo ${isMakeup ? 'BÙ' : 'NGHỈ'} vào ngày ${dateStr}.`
                                    });
                                }
                            }
                        }
                    }
                });
            });

            chrome.storage.local.set({ 
                saved_custom_events: customEvents,
                tkb_alerts: activeAlerts,
                saved_tkb_ics: [...baseEvents, ...customEvents],
                has_scraped_30_pages: true // Đánh dấu đã cào sâu 30 trang
            });

        } catch (e) { console.error("Lỗi cào file TKB", e); } 
        finally { cleanUpTab(); }
    }

    function cleanUpTab() {
        if (isAutoCheck) {
            sessionStorage.removeItem('uit_auto_check');
            setTimeout(() => chrome.runtime.sendMessage({ action: "closeAutoTab" }), 2000);
        }
    }

    if (isAutoCheck) setTimeout(() => { chrome.runtime.sendMessage({ action: "closeAutoTab" }); }, 15000);

    // --- 4. AUTO SURVEY UIT ---
    async function runAutoSurvey() {
        setTimeout(function() {
            let nextBtn = document.getElementById('movenextbtn');
            let submitBtn = document.getElementById('movesubmitbtn');
            let groupNameEl = document.querySelector('.group-name');
            
            if (!nextBtn && !submitBtn && !groupNameEl) {
                setTimeout(() => { chrome.runtime.sendMessage({ action: "closeAutoTab" }); }, 1000);
                return;
            }
            if (!groupNameEl) {
                if (nextBtn) nextBtn.click();
                return;
            }

            let groupName = groupNameEl.innerText.trim();
            if (groupName === 'THÔNG TIN CHUNG') {
                document.querySelectorAll('label.answertext').forEach(label => {
                    if (label.innerText.includes('>80%') || label.innerText.includes('Trên 90%')) {
                        let input = document.getElementById(label.getAttribute('for'));
                        if (input && !input.checked) input.click(); 
                    }
                });
                if (nextBtn) setTimeout(() => nextBtn.click(), 500);
            }
            else if (groupName === 'ĐÁNH GIÁ VỀ HOẠT ĐỘNG GIẢNG DẠY') {
                document.querySelectorAll('tr.answers-list').forEach(row => {
                    let options = row.querySelectorAll('input[type="radio"][title="3"], input[type="radio"][title="4"]');
                    if (options.length > 0) {
                        let opt = options[Math.floor(Math.random() * options.length)];
                        if (!opt.checked) opt.click();
                    }
                });
                if (nextBtn) setTimeout(() => nextBtn.click(), 500);
            }
            else if (groupName === 'Ý KIẾN KHÁC') {
                if (submitBtn) setTimeout(() => submitBtn.click(), 500);
            }
        }, 1000);
    }

    // --- MAIN RUNNER ---
    if (host.includes("survey.uit.edu.vn")) {
        runAutoSurvey();
    } else if (host.includes("student.uit.edu.vn") || host.includes("daa.uit.edu.vn")) {
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