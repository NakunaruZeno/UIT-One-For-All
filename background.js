/**
 * ============================================================
 * UIT One For All — Background Service Worker (Manifest V3)
 * ============================================================
 * File này chạy nền, quản lý:
 *  - Đồng bộ dữ liệu định kỳ (điểm, TKB, thông báo)
 *  - Hệ thống alarm tự động kiểm tra
 *  - Hẹn giờ đăng ký học phần (ĐKHP)
 *  - Cào thông báo đổi phòng học từ DAA
 *  - Xử lý message từ popup / content script
 * ============================================================
 */

// Kiểm tra và chạy đồng bộ dữ liệu nếu đã đến thời điểm (hoặc force = true thì bỏ qua cooldown)
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

// ============================================================
// SỰ KIỆN KHỞI ĐỘNG & CÀI ĐẶT EXTENSION
// ============================================================

// Khi Chrome khởi động — delay 5s rồi kiểm tra đồng bộ
chrome.runtime.onStartup.addListener(() => {
  setTimeout(() => {
    runSyncIfNeeded(false);
  }, 5000);
});

// Khi extension được cài đặt/cập nhật — tạo alarm định kỳ và ép đồng bộ lần đầu
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['sync_interval'], (res) => {
    const intervalHours = res.sync_interval || 3;
    chrome.alarms.create("uit_auto_check", {
      periodInMinutes: intervalHours * 60
    });
  });

  setTimeout(() => {
    runSyncIfNeeded(true);
  }, 3000);
});

// ============================================================
// XỬ LÝ ALARM
// ============================================================

// Lắng nghe alarm: "uit_auto_check" = đồng bộ định kỳ, "dkhp_register_alarm" = mở ĐKHP
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "uit_auto_check") {
    runSyncIfNeeded(false);
  }

  if (alarm.name === "dkhp_register_alarm") {
    chrome.tabs.create({
      url: "https://dkhp.uit.edu.vn/app/reg",
      active: true
    });

    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon/Icon128.png"),
      title: "🚀 ĐKHP bắt đầu!",
      message: "Đang mở trang ĐKHP để chuẩn bị đăng ký tự động theo lịch hẹn.",
      priority: 2
    });
  }
});

// ============================================================
// KIỂM TRA DỮ LIỆU TỰ ĐỘNG
// ============================================================

// Mở các tab ẩn để content script cào dữ liệu từ OEP, Student, DAA
function triggerCheck() {
  chrome.tabs.create({
    url: "https://oep.uit.edu.vn/vi/node?source=auto_check",
    active: false
  });

  setTimeout(() => {
    chrome.tabs.create({
      url: "https://student.uit.edu.vn/sinhvien/kqhoctap?source=auto_check",
      active: false
    });
  }, 2000);

  setTimeout(() => {
    chrome.tabs.create({
      url: "https://daa.uit.edu.vn/sinhvien/tkb?source=auto_check",
      active: false
    });
  }, 4000);
}

// ============================================================
// CÀO THÔNG BÁO ĐỔI PHÒNG HỌC
// ============================================================

// Quét 4 trang thông báo phòng học từ DAA, so khớp với TKB đã lưu, gửi notification nếu có
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

      // Regex trích xuất link và tiêu đề bài viết từ thẻ <h2><a>
      const regex = /<h2[^>]*><a href="([^"]+)"[^>]*>(.*?)<\/a><\/h2>/gi;
      let match;

      while ((match = regex.exec(htmlText)) !== null) {
        const articleLink = "https://daa.uit.edu.vn" + match[1];
        const articleTitle = match[2];

        if (notifiedLinks.includes(articleLink)) continue;

        for (const course of myCourses) {
          const baseCode = course.title.split('.').slice(0, 2).join('.');

          if (articleTitle.includes(baseCode)) {
            activeAlerts.push({
              title: articleTitle,
              link: articleLink,
              courseName: course.title
            });
            notifiedLinks.push(articleLink);
            hasNew = true;

            chrome.notifications.create(`alert_${Date.now()}`, {
              type: "basic",
              iconUrl: "https://daa.uit.edu.vn/favicon.ico",
              title: "⚠️ Có đổi phòng học!",
              message: `Môn ${course.title} có thông báo: ${articleTitle}`,
              priority: 2
            });

            break;
          }
        }
      }
    } catch (error) {
      console.error("Lỗi fetch thông báo", error);
    }
  }

  if (hasNew) {
    chrome.storage.local.set({
      notified_links: notifiedLinks,
      tkb_alerts: activeAlerts
    });
  }
}

// ============================================================
// XỬ LÝ MESSAGE TỪ POPUP / CONTENT SCRIPT
// ============================================================

// Lắng nghe message: forceSync, updateAlarm, scheduleDkhp, cancelDkhp, notifyUpdates, closeAutoTab, fetchHtml
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === "forceSync") {
    runSyncIfNeeded(true);
  }

  if (message.action === "updateAlarm") {
    chrome.alarms.create("uit_auto_check", {
      periodInMinutes: message.interval * 60
    });
  }

  if (message.action === "scheduleDkhp") {
    chrome.alarms.create("dkhp_register_alarm", {
      when: message.timestamp
    });
  }

  if (message.action === "cancelDkhp") {
    chrome.alarms.clear("dkhp_register_alarm");
  }

  if (message.action === "notifyUpdates") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icon/Icon128.png"),
      title: message.title,
      message: message.content,
      priority: 2
    });
  }

  if (message.action === "closeAutoTab" && sender.tab) {
    chrome.tabs.remove(sender.tab.id);
  }

  // Proxy fetch HTML cho content script (bypass CORS). Trả về true để giữ kênh sendResponse mở.
  if (message.action === "fetchHtml") {
    fetch(message.url)
      .then((res) => res.text())
      .then((html) => sendResponse({ html: html }))
      .catch((err) => sendResponse({ html: "" }));
    return true;
  }
});