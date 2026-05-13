function runSyncIfNeeded(force = false) {
    chrome.storage.local.get(['last_sync_time', 'sync_interval'], (res) => {
        const now = Date.now();
        const lastSync = res.last_sync_time || 0;
        const intervalHours = res.sync_interval || 3;
        const cooldown = intervalHours * 60 * 60 * 1000; 

        if (force || now - lastSync >= cooldown) {
            chrome.storage.local.set({ last_sync_time: now });
            triggerCheck();
            checkRoomChanges(); 
        }
    });
}

chrome.runtime.onStartup.addListener(() => {
    setTimeout(() => { runSyncIfNeeded(false); }, 5000);
});

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['sync_interval'], (res) => {
        const intervalHours = res.sync_interval || 3;
        chrome.alarms.create("uit_auto_check", { periodInMinutes: intervalHours * 60 });
    });
    setTimeout(() => { runSyncIfNeeded(true); }, 3000);
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "uit_auto_check") runSyncIfNeeded(false); 
});

function triggerCheck() {
    chrome.tabs.create({ url: "https://student.uit.edu.vn/sinhvien/kqhoctap?source=auto_check", active: false });
    setTimeout(() => { chrome.tabs.create({ url: "https://daa.uit.edu.vn/sinhvien/tkb?source=auto_check", active: false }); }, 2000);
}

// Cào thông báo đổi phòng
async function checkRoomChanges() {
    const data = await chrome.storage.local.get(['saved_tkb_ics', 'notified_links', 'tkb_alerts']);
    const myCourses = data.saved_tkb_ics || [];
    let notifiedLinks = data.notified_links || []; 
    let activeAlerts = data.tkb_alerts || [];
    
    if (myCourses.length === 0) return;

    let hasNew = false;
    for (let i = 0; i <= 3; i++) {
        try {
            const response = await fetch(`https://daa.uit.edu.vn/thong-bao-phong-hoc?page=${i}`);
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
                            type: "basic", iconUrl: "https://daa.uit.edu.vn/favicon.ico",
                            title: "⚠️ Có đổi phòng học!", message: `Môn ${course.title} có thông báo: ${articleTitle}`, priority: 2
                        });
                        break; 
                    }
                }
            }
        } catch (error) { console.error("Lỗi fetch thông báo", error); }
    }

    if (hasNew) chrome.storage.local.set({ notified_links: notifiedLinks, tkb_alerts: activeAlerts });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "forceSync") runSyncIfNeeded(true); 
    if (message.action === "updateAlarm") {
        chrome.alarms.create("uit_auto_check", { periodInMinutes: message.interval * 60 });
    }
    if (message.action === "notifyUpdates") {
        chrome.notifications.create({
            type: "basic", iconUrl: "https://student.uit.edu.vn/favicon.ico",
            title: message.title, message: message.content, priority: 2
        });
    }
    if (message.action === "closeAutoTab" && sender.tab) chrome.tabs.remove(sender.tab.id);
});