chrome.runtime.onStartup.addListener(triggerCheck);
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create("uit_auto_check", { periodInMinutes: 60 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "uit_auto_check") {
        triggerCheck();
        checkAnnouncements(); 
    }
});

function triggerCheck() {
    chrome.tabs.create({ url: "https://student.uit.edu.vn/sinhvien/kqhoctap?source=auto_check", active: false });
    chrome.tabs.create({ url: "https://daa.uit.edu.vn/sinhvien/tkb?source=auto_check", active: false });
}

async function checkAnnouncements() {
    const data = await chrome.storage.local.get(['saved_tkb_ics', 'notified_links', 'tkb_alerts']);
    const myCourses = data.saved_tkb_ics || [];
    let notifiedLinks = data.notified_links || []; 
    let activeAlerts = data.tkb_alerts || [];
    
    if (myCourses.length === 0) return;

    // Quét 3 trang đầu tiên của cả 2 chuyên mục
    const urlsToCheck = [];
    for (let i = 0; i <= 2; i++) {
        urlsToCheck.push(`https://daa.uit.edu.vn/thong-bao-phong-hoc?page=${i}`);
        urlsToCheck.push(`https://daa.uit.edu.vn/thong-bao-nghi-bu?page=${i}`);
    }

    let hasNew = false;

    for (const url of urlsToCheck) {
        try {
            const response = await fetch(url);
            const htmlText = await response.text();
            
            const regex = /<h2[^>]*><a href="([^"]+)"[^>]*>(.*?)<\/a><\/h2>/gi;
            let match;

            while ((match = regex.exec(htmlText)) !== null) {
                const articleLink = "https://daa.uit.edu.vn" + match[1];
                const articleTitle = match[2];

                if (notifiedLinks.includes(articleLink)) continue;

                for (const course of myCourses) {
                    const baseCode = course.title.split('.').slice(0, 2).join('.'); 
                    if (articleTitle.includes(baseCode)) {
                        activeAlerts.push({ title: articleTitle, link: articleLink, courseName: course.title });
                        notifiedLinks.push(articleLink);
                        hasNew = true;
                        
                        chrome.notifications.create(`alert_${Date.now()}`, {
                            type: "basic",
                            iconUrl: "https://daa.uit.edu.vn/favicon.ico",
                            title: "⚠️ Có thay đổi về TKB!",
                            message: `Môn ${course.title} có thông báo: ${articleTitle}`,
                            priority: 2
                        });
                        break; 
                    }
                }
            }
        } catch (error) { console.error("Lỗi fetch thông báo", error); }
    }

    if (hasNew) {
        chrome.storage.local.set({ notified_links: notifiedLinks, tkb_alerts: activeAlerts });
    }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "notifyGrades") {
        chrome.notifications.create({
            type: "basic", 
            iconUrl: "https://student.uit.edu.vn/favicon.ico",
            title: "Cập nhật bảng điểm UIT!", 
            message: message.content, 
            priority: 2
        });
    }
    if (message.action === "closeAutoTab" && sender.tab) {
        chrome.tabs.remove(sender.tab.id);
    }
});