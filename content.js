(async function () {
    'use strict';
    const host = location.hostname;
    const path = window.location.pathname; 

    const isAutoCheck = location.href.includes('source=auto_check') || sessionStorage.getItem('uit_auto_check') === 'true';
    if (location.href.includes('source=auto_check')) {
        sessionStorage.setItem('uit_auto_check', 'true');
    }

    const isAutoCheckExam = location.href.includes('source=auto_check_exam');

    // ==========================================
    // MODULE BẢO MẬT
    // ==========================================
    function base64ToBuffer(base64) {
        const binary_string = window.atob(base64);
        const bytes = new Uint8Array(binary_string.length);
        for (let i = 0; i < binary_string.length; i++) bytes[i] = binary_string.charCodeAt(i);
        return bytes.buffer;
    }

    async function getAesKey() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['aes_key'], async (res) => {
                if (res.aes_key) {
                    const key = await crypto.subtle.importKey("jwk", res.aes_key, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
                    resolve(key);
                } else resolve(null);
            });
        });
    }

    async function decryptPassword(cipherBase64, ivBase64) {
        const key = await getAesKey();
        if (!key) return null;
        try {
            const encryptedBytes = base64ToBuffer(cipherBase64);
            const ivBytes = base64ToBuffer(ivBase64);
            const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBytes }, key, encryptedBytes);
            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error("Lỗi giải mã mật khẩu", e);
            return null;
        }
    }

    // Lấy tài khoản
    async function getAccount() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['uit_user', 'uit_pass_cipher', 'uit_pass_iv', 'uit_pass'], async (res) => {
                if (res.uit_user && res.uit_pass_cipher && res.uit_pass_iv) {
                    const pass = await decryptPassword(res.uit_pass_cipher, res.uit_pass_iv);
                    resolve({ username: res.uit_user, password: pass });
                } else if (res.uit_user && res.uit_pass) {
                    // Tương thích ngược: Nếu người dùng chưa cập nhật mk thì vẫn dùng btoa cũ
                    resolve({ username: res.uit_user, password: atob(res.uit_pass) });
                } else {
                    resolve(null);
                }
            });
        });
    }

    // ==========================================
    // MODULE ĐĂNG NHẬP (TRUYỀN THỐNG)
    // ==========================================
    async function runDrupalLogin(loginForm) {
        const userInput = loginForm.querySelector('input[name="name"], #edit-name');
        const passInput = loginForm.querySelector('input[name="pass"], #edit-pass');
        const captchaInput = loginForm.querySelector('input[name="captcha_response"], #edit-english-captcha-answer');
        const submitBtn = loginForm.querySelector('input[type="submit"], button[type="submit"]'); 

        if (!userInput || !passInput || !submitBtn) return;
        
        // Gọi hàm giải mã
        const acc = await getAccount();
        if (!acc) return; 

        userInput.value = acc.username;
        passInput.value = acc.password;

        const solveCaptchaAndLogin = () => {
            if (!captchaInput) {
                setTimeout(() => { submitBtn.click(); }, 600);
                return true;
            }

            const img = loginForm.querySelector('.english-captcha-image img');
            if (img) {
                const alt = img.getAttribute('alt');
                if (alt && alt.includes(':')) {
                    captchaInput.value = alt.split(':')[1].trim();
                    setTimeout(() => { submitBtn.click(); }, 600);
                    return true;
                }
            }
            return false;
        };

        if (!solveCaptchaAndLogin()) {
            let attempts = 0;
            const interval = setInterval(() => {
                attempts++;
                if (solveCaptchaAndLogin() || attempts > 20) clearInterval(interval); 
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

    async function checkGrades() {
        if (!path.includes('/sinhvien/kqhoctap')) return;
        const rows = document.querySelectorAll('table[bordercolor="#000000"] tr');
        let currentGrades = [];
        let currentSemester = "Chưa xác định";
        
        const cleanText = (text) => text ? text.replace(/&nbsp;/g, '').replace(/[\u00A0\s]+/g, ' ').trim() : "";
        
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length === 1 && cells[0].hasAttribute('colspan')) {
                currentSemester = cleanText(cells[0].innerText);
            }
            if (cells.length >= 10 && cells[1].innerText.trim() !== "" && !cells[2].innerText.includes("Trung bình")) {
                currentGrades.push({
                    hocKy: currentSemester, maHP: cleanText(cells[1].innerText), tenHP: cleanText(cells[2].innerText),
                    tc: cleanText(cells[3].innerText), diemQT: cleanText(cells[4].innerText), diemGK: cleanText(cells[5].innerText),
                    diemTH: cleanText(cells[6].innerText), diemCK: cleanText(cells[7].innerText), diemHP: cleanText(cells[8].innerText),
                    ghiChu: cleanText(cells[9].innerText)
                });
            }
        });

        chrome.storage.local.get(['saved_grades'], (res) => {
            const oldGrades = res.saved_grades || [];
            let hasRealChanges = false;
            
            if (oldGrades.length > 0 && currentGrades.length > 0) {
                const oldMap = {};
                oldGrades.forEach(g => { oldMap[g.hocKy + "_" + g.maHP] = g; });
                
                for (const curr of currentGrades) {
                    const uniqueKey = curr.hocKy + "_" + curr.maHP;
                    const old = oldMap[uniqueKey];
                    if (!old || old.diemQT !== curr.diemQT || old.diemGK !== curr.diemGK || old.diemTH !== curr.diemTH || old.diemCK !== curr.diemCK || old.diemHP !== curr.diemHP) {
                        hasRealChanges = true; break;
                    }
                }
            }

            if (hasRealChanges) {
                chrome.runtime.sendMessage({ action: "notifyUpdates", title: "Cập nhật bảng điểm UIT!", content: "Vừa có điểm mới được cập nhật trên trường." });
            }

            if (currentGrades.length > 0) {
                chrome.storage.local.set({ saved_grades: currentGrades }, () => { cleanUpTab(); });
            } else { cleanUpTab(); }
        });
    }

    async function checkExamsTab() {
        if (!path.includes('/sinhvien/lichhoc/lichthi')) return;
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
            let hasNew = false;
            
            if (oldExams.length > 0 && currentExams.length > 0) {
                const oldExamsSet = new Set(oldExams.map(e => e.maLop + "_" + e.ngayThi));
                for (const ex of currentExams) {
                    if (!oldExamsSet.has(ex.maLop + "_" + ex.ngayThi)) {
                        hasNew = true; break;
                    }
                }
            }

            if (hasNew) {
                chrome.runtime.sendMessage({ action: "notifyUpdates", title: "Có Lịch thi mới!", content: "Phòng đào tạo vừa cập nhật Lịch thi của bạn." });
            }
            
            chrome.storage.local.set({ saved_exams: currentExams }, () => {
                chrome.runtime.sendMessage({ action: "examsUpdated" });
                setTimeout(() => { chrome.runtime.sendMessage({ action: "closeAutoTab" }); }, 1000);
            });
        });
    }

    async function scrapeTKB_ICS() {
        if (!path.includes('/sinhvien/tkb')) return;
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
                        const countMatch = rruleMatch[1].match(/COUNT=(\d+)/);
                        
                        if (untilMatch) {
                            untilDateStr = `${untilMatch[1]}-${untilMatch[2]}-${untilMatch[3]}`;
                        } else if (countMatch) {
                            const count = parseInt(countMatch[1], 10);
                            const startObj = new Date(startDateStr);
                            startObj.setDate(startObj.getDate() + (count - 1) * interval * 7);
                            const yyyy = startObj.getFullYear();
                            const mm = String(startObj.getMonth() + 1).padStart(2, '0');
                            const dd = String(startObj.getDate()).padStart(2, '0');
                            untilDateStr = `${yyyy}-${mm}-${dd}`;
                        }
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
                        title: `${titles[0].innerText.trim()} (BÙ)`, fullDesc: `Phòng: ${match[3] ? match[3].trim() : "Chưa cập nhật"}`, teacher: "Chi tiết trên web",
                        dayOfWeek: dayOfWeek, startTiet: tiets[0], spanTiet: tiets.length,
                        startDate: match[2], untilDate: match[2], interval: 1, isMakeup: true
                    });
                }
            });

            const storageRes = await chrome.storage.local.get(['saved_custom_events', 'tkb_alerts', 'has_scraped_30_pages']);
            let customEvents = storageRes.saved_custom_events || [];
            let activeAlerts = storageRes.tkb_alerts || [];
            const maxPage = storageRes.has_scraped_30_pages ? 10 : 30; 
            let hasNewAlerts = false;

            const fetchPromises = [];
            for (let page = 0; page <= maxPage; page++) {
                fetchPromises.push(
                    fetch(`https://daa.uit.edu.vn/thong-bao-nghi-bu?page=${page}`)
                    .then(res => res.text())
                    .then(html => ({ html: html, source: 'daa' }))
                    .catch(()=> ({ html: "", source: 'daa' }))
                );
                fetchPromises.push(
                    new Promise(resolve => {
                        chrome.runtime.sendMessage({action: 'fetchHtml', url: `https://oep.uit.edu.vn/vi/category/thong-bao-nghi-hoc-hoc-bu?page=${page}`}, (res) => {
                            resolve({ html: res ? res.html : "", source: "oep" });
                        });
                    })
                );
            }
            
            const pagesHtml = await Promise.all(fetchPromises);
            const parser = new DOMParser();
            let matchedArticles = []; 

            pagesHtml.forEach((pageData) => {
                if(!pageData || !pageData.html) return;
                const htmlString = pageData.html;
                const baseDomain = pageData.source === 'oep' ? 'https://oep.uit.edu.vn' : 'https://daa.uit.edu.vn';
                const doc = parser.parseFromString(htmlString, 'text/html');
                
                doc.querySelectorAll('article, .views-row').forEach(item => {
                    const titleElem = item.querySelector('h2 a') || item.querySelector('a');
                    if (!titleElem) return;
                    
                    const articleTitle = titleElem.innerText.trim();
                    if (!articleTitle.toLowerCase().includes('bù') && !articleTitle.toLowerCase().includes('nghỉ')) return;

                    const hrefStr = titleElem.getAttribute('href');
                    const articleLink = hrefStr.startsWith('http') ? hrefStr : baseDomain + hrefStr;
                    
                    const classMatchTitle = articleTitle.match(/\(([A-Za-z0-9.\-_]+)\)/i);
                    if (!classMatchTitle) return;
                    const classCode = classMatchTitle[1].trim();

                    const dateMatchTitle = articleTitle.match(/ngày\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
                    if (!dateMatchTitle) return;

                    // --- ĐÃ FIX: CHỈ SO SÁNH TRÙNG KHỚP TUYỆT ĐỐI (100% EXACT MATCH) ---
                    const matchedCourse = baseEvents.find(c => {
                        const baseCode = c.title.split(' - ')[0].trim(); 
                        return baseCode === classCode;
                    });
                    
                    if (matchedCourse) {
                        const dateStr = `${dateMatchTitle[3]}-${dateMatchTitle[2].padStart(2, '0')}-${dateMatchTitle[1].padStart(2, '0')}`;
                        matchedArticles.push({
                            articleLink: articleLink, articleTitle: articleTitle, classCode: classCode, dateStr: dateStr,
                            isMakeup: articleTitle.toLowerCase().includes("bù"),
                            isCancelled: articleTitle.toLowerCase().includes("nghỉ"),
                            rawText: item.innerText 
                        });
                    }
                });
            });

            const detailPromises = matchedArticles.map(async (art) => {
                let roomMatch = art.rawText.match(/Phòng\s*:\s*([A-Za-z0-9.\-_]*)/i);
                let startTietMatch = art.rawText.match(/Tiết\s*bắt\s*đầu\s*:\s*(\d+)/i);
                let endTietMatch = art.rawText.match(/Tiết\s*kết\s*thúc\s*:\s*(\d+)/i);

                if (!startTietMatch || !endTietMatch) {
                    try {
                        let detailHtml = "";
                        if (art.articleLink.includes("oep.uit.edu.vn")) {
                            detailHtml = await new Promise(resolve => {
                                chrome.runtime.sendMessage({action: 'fetchHtml', url: art.articleLink}, res => resolve(res ? res.html : ""));
                            });
                        } else {
                            const detailRes = await fetch(art.articleLink);
                            detailHtml = await detailRes.text();
                        }

                        const docDetail = parser.parseFromString(detailHtml, 'text/html');
                        const contentText = docDetail.body.innerText;

                        roomMatch = roomMatch || contentText.match(/Phòng\s*:\s*([A-Za-z0-9.\-_]*)/i);
                        startTietMatch = contentText.match(/Tiết\s*bắt\s*đầu\s*:\s*(\d+)/i);
                        endTietMatch = contentText.match(/Tiết\s*kết\s*thúc\s*:\s*(\d+)/i);
                    } catch (e) { console.error("Không lấy được chi tiết bài: ", art.articleLink); }
                }

                if (startTietMatch && endTietMatch) {
                    const uid = `${art.isMakeup ? 'BU' : 'NGHI'}_${art.classCode}_${art.dateStr}_${startTietMatch[1]}`;
                    let dayOfWeek = new Date(art.dateStr).getDay() + 1; 
                    if (dayOfWeek === 1) dayOfWeek = 8;

                    return {
                        uid: uid,
                        title: `${art.classCode} ${art.isMakeup ? '(BÙ)' : '(NGHỈ)'}`, 
                        fullDesc: art.isMakeup ? `Phòng: ${(roomMatch && roomMatch[1].trim() !== "") ? roomMatch[1].trim() : "Chưa cập nhật"}` : `Nghỉ học`, 
                        teacher: "Chi tiết trên web",
                        dayOfWeek: dayOfWeek, 
                        startTiet: parseInt(startTietMatch[1], 10), 
                        spanTiet: parseInt(endTietMatch[1], 10) - parseInt(startTietMatch[1], 10) + 1,
                        startDate: art.dateStr, untilDate: art.dateStr, interval: 1, 
                        isMakeup: art.isMakeup, isCancelled: art.isCancelled,
                        articleLink: art.articleLink, articleTitle: art.articleTitle, classCode: art.classCode
                    };
                }
                return null;
            });

            const processedEvents = (await Promise.all(detailPromises)).filter(e => e !== null);

            processedEvents.forEach(ev => {
                if (!customEvents.some(e => e.uid === ev.uid)) {
                    customEvents.push(ev);
                    if (!activeAlerts.some(a => a.link === ev.articleLink)) {
                        activeAlerts.push({ title: ev.articleTitle, link: ev.articleLink, courseName: ev.classCode });
                    }
                    hasNewAlerts = true;

                    if (storageRes.has_scraped_30_pages) {
                        chrome.runtime.sendMessage({
                            action: "notifyUpdates", 
                            title: "⚠️ Lịch học thay đổi!", 
                            content: `Môn ${ev.classCode} vừa có thông báo ${ev.isMakeup ? 'BÙ' : 'NGHỈ'} vào ngày ${ev.startDate}.`
                        });
                    }
                }
            });

            chrome.storage.local.set({ 
                saved_custom_events: customEvents,
                tkb_alerts: activeAlerts,
                saved_tkb_ics: [...baseEvents, ...customEvents],
                has_scraped_30_pages: true 
            });

        } catch (e) { console.error("Lỗi cào file TKB", e); } 
        finally { cleanUpTab(); }
    }

    function cleanUpTab() {
        if (isAutoCheck || isAutoCheckExam) {
            sessionStorage.removeItem('uit_auto_check');
            setTimeout(() => chrome.runtime.sendMessage({ action: "closeAutoTab" }), 2000);
        }
    }

    if (isAutoCheck || isAutoCheckExam) setTimeout(() => { chrome.runtime.sendMessage({ action: "closeAutoTab" }); }, 15000);

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

    if (host.includes("survey.uit.edu.vn")) {
        runAutoSurvey();
    } else if (host.includes("courses.uit.edu.vn")) {
        if (document.querySelector('#username') && document.querySelector('#password')) {
            runCoursesLogin();
        }
    } else if (host.includes("oep.uit.edu.vn") || host.includes("student.uit.edu.vn") || host.includes("daa.uit.edu.vn")) {
        const loginForm = document.querySelector('#user-login, #user-login-form, form[action*="user/login"]');
        const isLoggedIn = document.querySelector('a[href*="/user/logout"]'); 

        if (loginForm && !isLoggedIn) {
            runDrupalLogin(loginForm); 
        } else {
            if (host.includes("oep.uit.edu.vn")) {
                cleanUpTab(); 
            } else {
                if (isAutoCheckExam && path.includes('/lichhoc/lichthi')) {
                    checkExamsTab();
                } else if (path.includes('/sinhvien/kqhoctap')) {
                    checkGrades();
                } else if (path.includes('/sinhvien/tkb')) {
                    scrapeTKB_ICS();
                }
            }
        }
    }
})();