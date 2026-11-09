/**
 * UIT One For All — Background Service Worker (MV3)
 */
importScripts('../lib/crypto.js');

const ICON_URL = chrome.runtime.getURL('assets/icons/Icon128.png');

chrome.runtime.onInstalled.addListener(() => {
  setupPeriodicAlarms();

  chrome.storage.local.get(['dkhp_schedule'], (res) => {
    if (res.dkhp_schedule && res.dkhp_schedule.active) {
      const targetTime = new Date(res.dkhp_schedule.datetime).getTime();
      if (targetTime > Date.now()) {
        chrome.alarms.create('dkhpAutoReg', { when: targetTime });
      }
    }
  });

  // Tự động tiêm lại Content Script vào các tab portal.uit.edu.vn đang mở sẵn
  // để người dùng không cần F5 sau khi cập nhật/reload tiện ích
  chrome.tabs.query({ url: ['https://portal.uit.edu.vn/*'] }, (tabs) => {
    if (!tabs || tabs.length === 0) return;
    tabs.forEach((tab) => {
      if (!tab.id) return;
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          files: ['src/lib/crypto.js', 'src/content/index.js']
        })
        .catch(() => {});
    });
  });
});

function setupPeriodicAlarms() {
  chrome.storage.local.get(['auto_sync_interval'], (res) => {
    const mins = res.auto_sync_interval !== undefined ? Number(res.auto_sync_interval) : 240;
    chrome.alarms.clear('checkUIT', () => {
      if (mins > 0) {
        chrome.alarms.create('checkUIT', { periodInMinutes: mins });
      }
    });
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkUIT') {
    checkRoomChanges();
    checkTKBExpiration();
    autoCheckPortalInBackground();
  } else if (alarm.name === 'dkhpAutoReg') {
    executeDkhpAutoReg();
  }
});

async function autoCheckPortalInBackground() {
  try {
    const res = await chrome.storage.local.get(['auto_sync_portal']);
    if (res.auto_sync_portal === false) return; // Người dùng tắt đồng bộ portal định kỳ

    await chrome.tabs.create({
      url: 'https://portal.uit.edu.vn/sinh-vien/bang-diem?source=auto_check_grade',
      active: false
    });

    setTimeout(() => {
      chrome.tabs.create({
        url: 'https://portal.uit.edu.vn/sinh-vien/tkb?source=auto_check_tkb',
        active: false
      }).catch(() => {});
    }, 2800);
  } catch (err) {
    console.error('[UIT Background] Lỗi cào Portal ngầm định kỳ:', err);
  }
}

chrome.notifications.onClicked.addListener((notifId) => {
  chrome.storage.local.get(['notificationLinks'], (res) => {
    const links = res.notificationLinks || {};
    if (links[notifId]) {
      chrome.tabs.create({ url: links[notifId] });
    } else if (notifId.startsWith('tkb_expired_')) {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'triggerCheck') {
    (async () => {
      // Đánh thức các tab portal.uit.edu.vn đang mở sẵn (nếu có)
      chrome.tabs.query({ url: ['https://portal.uit.edu.vn/*'] }, (openTabs) => {
        (openTabs || []).forEach((t) => {
          if (t.id) {
            chrome.tabs.sendMessage(t.id, { action: 'runPortalScraper' }).catch(() => {});
          }
        });
      });

      // Mở tab đồng bộ ngầm (hoạt động cả khi đã lưu MSSV hoặc đã đăng nhập sẵn trên trình duyệt)
      await chrome.tabs.create({
        url: 'https://portal.uit.edu.vn/sinh-vien/bang-diem?source=auto_check_grade',
        active: false
      });

      setTimeout(() => {
        chrome.tabs.create({
          url: 'https://portal.uit.edu.vn/sinh-vien/tkb?source=auto_check_tkb',
          active: false
        });
      }, 2000);

      setTimeout(() => {
        chrome.tabs.create({
          url: 'https://portal.uit.edu.vn/sinh-vien/lich-thi?source=auto_check_exam',
          active: false
        });
      }, 4500);

      await checkRoomChanges();
      sendResponse({ status: 'done' });
    })();
    return true;
  }

  if (request.action === 'showNotification') {
    const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    chrome.notifications.create(notifId, {
      type: 'basic',
      iconUrl: ICON_URL,
      title: request.title || 'UIT One For All',
      message: request.message || ''
    });

    if (request.closeTab && sender.tab && sender.tab.id) {
      setTimeout(() => {
        chrome.tabs.remove(sender.tab.id).catch(() => {});
      }, 3200);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (request.action === 'fetchExternalUrl') {
    fetch(request.url, { credentials: 'omit' })
      .then((res) => res.text())
      .then((html) => sendResponse({ success: true, html }))
      .catch((err) => sendResponse({ success: false, error: err.toString() }));
    return true;
  }

  if (request.action === 'scheduleDkhpAlarm') {
    const targetTime = new Date(request.datetime).getTime();
    chrome.alarms.clear('dkhpAutoReg', () => {
      if (targetTime > Date.now()) {
        chrome.alarms.create('dkhpAutoReg', { when: targetTime });
        sendResponse({ status: 'scheduled', when: targetTime });
      } else {
        sendResponse({ status: 'past_time' });
      }
    });
    return true;
  }

  if (request.action === 'cancelDkhpAlarm') {
    chrome.alarms.clear('dkhpAutoReg', () => {
      sendResponse({ status: 'cancelled' });
    });
    return true;
  }
});

function executeDkhpAutoReg() {
  chrome.storage.local.get(['dkhp_schedule'], (res) => {
    if (!res.dkhp_schedule || !res.dkhp_schedule.active) return;

    chrome.notifications.create('dkhp_firing_' + Date.now(), {
      type: 'basic',
      iconUrl: ICON_URL,
      title: 'Đang thực thi Đăng ký học phần tự động',
      message: `Đang mở cổng ĐKHP cho ${res.dkhp_schedule.courses.length} mã lớp đã hẹn...`,
      priority: 2
    });

    chrome.tabs.create({
      url: 'https://dkhp.uit.edu.vn/app/reg?source=auto_dkhp',
      active: true
    });
  });
}

function checkTKBExpiration() {
  chrome.storage.local.get(['tkb_EndDate', 'tkb_scraped_until'], (res) => {
    const endDate = res.tkb_EndDate || res.tkb_scraped_until;
    if (!endDate) return;
    if (Date.now() > endDate) {
      chrome.notifications.create('tkb_expired_' + Date.now(), {
        type: 'basic',
        iconUrl: ICON_URL,
        title: 'Thời khóa biểu học kỳ đã kết thúc',
        message: 'Dữ liệu TKB hiện tại đã hết hạn. Nhấn để mở bảng điều khiển và đồng bộ kỳ mới.',
        priority: 2
      });
    }
  });
}

async function checkRoomChanges() {
  try {
    const data = await chrome.storage.local.get([
      'saved_tkb_ics',
      'notifiedRooms',
      'notificationLinks'
    ]);

    const myCourses = data.saved_tkb_ics || [];
    if (myCourses.length === 0) return;

    const baseCodes = new Set();
    myCourses.forEach((c) => {
      const raw = (c.maLop || (c.title ? c.title.split(' - ')[0] : '')).trim();
      if (!raw) return;
      const base = raw.split('.').slice(0, 2).join('.').toUpperCase();
      if (base.length >= 4) baseCodes.add(base);
    });

    if (baseCodes.size === 0) return;

    const notifiedRooms = data.notifiedRooms || [];
    const links = data.notificationLinks || {};
    let hasNew = false;

    for (let page = 0; page < 3; page++) {
      const response = await fetch(`https://daa.uit.edu.vn/thong-bao-phong-hoc?page=${page}`);
      const html = await response.text();

      const regex = /<h2[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/gi;
      let match;

      while ((match = regex.exec(html)) !== null) {
        const relativeUrl = match[1].trim();
        const fullUrl = relativeUrl.startsWith('http')
          ? relativeUrl
          : 'https://daa.uit.edu.vn' + relativeUrl;
        const articleTitle = match[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        const upperTitle = articleTitle.toUpperCase();

        for (const baseCode of baseCodes) {
          if (upperTitle.includes(baseCode) && !notifiedRooms.includes(fullUrl)) {
            const notifId = 'room_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
            links[notifId] = fullUrl;

            chrome.notifications.create(notifId, {
              type: 'basic',
              iconUrl: ICON_URL,
              title: `Thông báo phòng học (${baseCode})`,
              message: articleTitle,
              priority: 2
            });

            notifiedRooms.push(fullUrl);
            hasNew = true;
            break;
          }
        }
      }
    }

    if (hasNew) {
      await chrome.storage.local.set({
        notifiedRooms: notifiedRooms.slice(-200),
        notificationLinks: links
      });
    }
  } catch (error) {
    console.error('[UIT Background] Lỗi quét thông báo phòng học:', error);
  }
}
