/**
 * ============================================================
 * UIT One For All — Dashboard Script
 * ============================================================
 * Xử lý giao diện trang Dashboard:
 *  - Chuyển đổi Theme sáng/tối
 *  - Hiển thị TKB dạng lưới tuần
 *  - Bảng điểm & Lịch thi
 *  - Cảnh báo đổi phòng / nghỉ / bù
 *  - Hẹn giờ ĐKHP với countdown realtime
 *  - Xếp lớp TKB từ file XLSX
 * ============================================================
 */

// Khởi tạo theme sáng/tối (chạy ngay để tránh flash)
(function () {
  const saved = localStorage.getItem('uit_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
})();

let currentViewDate = new Date();

// Tính ngày Thứ Hai của tuần chứa ngày d
function getMonday(d) {
  let day = d.getDay();
  let diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(new Date(d).setDate(diff));
}

// ============================================================
// DOM CONTENT LOADED — KHỞI TẠO GIAO DIỆN
// ============================================================
document.addEventListener('DOMContentLoaded', () => {

  // --- Theme toggle ---
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  const themeLabel = document.getElementById('theme-label');

  // Áp dụng theme và lưu vào localStorage
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('uit_theme', theme);
    if (theme === 'dark') {
      themeIcon.textContent = '☀️';
      themeLabel.textContent = 'Sáng';
    } else {
      themeIcon.textContent = '🌙';
      themeLabel.textContent = 'Tối';
    }
  }

  applyTheme(localStorage.getItem('uit_theme') || 'dark');

  themeToggle.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  });

  // --- Tab switching ---
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn, .tab-content').forEach((el) => el.classList.remove('active'));
      e.currentTarget.classList.add('active');
      document.getElementById(e.currentTarget.getAttribute('data-tab')).classList.add('active');
    });
  });

  initGridBackground();

  // --- Nút chuyển tuần TKB ---
  document.getElementById('btn-prev').addEventListener('click', () => changeWeek(-7));
  document.getElementById('btn-next').addEventListener('click', () => changeWeek(7));

  // --- Nút xóa cảnh báo ---
  document.getElementById('btn-clear-alerts').addEventListener('click', () => {
    chrome.storage.local.set({ tkb_alerts: [] });
    document.getElementById('alert-container').style.display = 'none';
  });

  // --- Modal Thêm Môn ---
  document.getElementById('btn-add-course').addEventListener('click', () => {
    document.getElementById('modal-add-course').classList.add('active');
    document.getElementById('add-ma-mon').focus();
  });
  document.getElementById('btn-close-add-modal').addEventListener('click', closeAddModal);
  document.getElementById('modal-add-course').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeAddModal();
  });
  document.getElementById('btn-submit-add-course').addEventListener('click', addManualEvent);

  // --- Modal Xóa Môn ---
  document.getElementById('btn-cancel-delete').addEventListener('click', closeDeleteModal);
  document.getElementById('modal-delete-confirm').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeDeleteModal();
  });
  document.getElementById('btn-confirm-delete').addEventListener('click', executeDeleteEvent);

  // --- Nút Undo xóa môn ---
  document.getElementById('btn-undo-delete').addEventListener('click', () => {
    if (!document.getElementById('btn-undo-delete').disabled) {
      undoDelete();
    }
  });

  // Load undo state từ storage (persist qua reload)
  chrome.storage.local.get(['undo_last_event', 'undo_last_type'], (res) => {
    if (res.undo_last_event && res.undo_last_type) {
      _lastDeletedEvent = res.undo_last_event;
      _lastDeletedType = res.undo_last_type;
      updateUndoButton();
    }
  });

  // --- Nút cập nhật lịch thi (mở tab ẩn để content script cào) ---
  document.getElementById('btn-fetch-exams').addEventListener('click', () => {
    const btn = document.getElementById('btn-fetch-exams');
    const lanthi = document.getElementById('exam-type').value;
    const hocky = document.getElementById('exam-term').value;
    const namhoc = document.getElementById('exam-year').value;

    chrome.storage.local.set({ exam_params: { lanthi, hocky, namhoc } });
    btn.textContent = '⏳ Đang cào dữ liệu...';
    btn.disabled = true;

    chrome.tabs.create({
      url: `https://student.uit.edu.vn/sinhvien/lichhoc/lichthi?lanthi=${lanthi}&hocky=${hocky}&namhoc=${namhoc}&source=auto_check_exam`,
      active: false
    });

    setTimeout(() => {
      btn.textContent = '↻ Cập nhật Lịch Thi';
      btn.disabled = false;
    }, 8000);
  });

  // Lắng nghe message "examsUpdated" từ content script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'examsUpdated') {
      renderExams();
      const btn = document.getElementById('btn-fetch-exams');
      if (btn) {
        btn.textContent = '✓ Đã cập nhật!';
        btn.disabled = false;
        setTimeout(() => {
          btn.textContent = '↻ Cập nhật Lịch Thi';
        }, 2500);
      }
    }
  });

  // Khôi phục tham số lịch thi đã lưu
  chrome.storage.local.get(['exam_params'], (res) => {
    if (res.exam_params) {
      document.getElementById('exam-type').value = res.exam_params.lanthi;
      document.getElementById('exam-term').value = res.exam_params.hocky;
      document.getElementById('exam-year').value = res.exam_params.namhoc;
    }
  });

  // ============================================================
  // HẸN GIỜ ĐKHP (SCHEDULER)
  // ============================================================
  const dkhpTimeInput = document.getElementById('dkhp-time');
  const dkhpCoursesArea = document.getElementById('dkhp-courses');
  const btnSaveDkhp = document.getElementById('btn-save-dkhp');
  const btnCancelDkhp = document.getElementById('btn-cancel-dkhp');
  const dkhpStatusMsg = document.getElementById('dkhp-status-msg');

  chrome.storage.local.get(['dkhp_time', 'dkhp_courses', 'dkhp_enabled'], (res) => {
    if (res.dkhp_time) dkhpTimeInput.value = res.dkhp_time;
    if (res.dkhp_courses) dkhpCoursesArea.value = res.dkhp_courses;
    refreshCountdown(res.dkhp_time, res.dkhp_courses, res.dkhp_enabled);
  });

  // Nút LƯU hẹn giờ ĐKHP
  btnSaveDkhp.addEventListener('click', () => {
    const datetimeValue = dkhpTimeInput.value;
    const coursesValue = dkhpCoursesArea.value.trim();

    if (!datetimeValue) {
      showStatus(dkhpStatusMsg, '⚠ Vui lòng chọn thời gian hợp lệ!', 'var(--orange)');
      return;
    }
    const targetTimestamp = new Date(datetimeValue).getTime();
    if (targetTimestamp <= Date.now()) {
      showStatus(dkhpStatusMsg, '⚠ Thời gian hẹn giờ phải ở tương lai!', 'var(--red)');
      return;
    }
    if (!coursesValue) {
      showStatus(dkhpStatusMsg, '⚠ Vui lòng nhập danh sách môn học!', 'var(--orange)');
      return;
    }

    chrome.storage.local.set({
      dkhp_time: datetimeValue,
      dkhp_courses: coursesValue,
      dkhp_enabled: true
    }, () => {
      chrome.runtime.sendMessage({ action: 'scheduleDkhp', timestamp: targetTimestamp });
      showStatus(dkhpStatusMsg, '✓ Đã lưu & bật hẹn giờ thành công!', 'var(--green)');
      refreshCountdown(datetimeValue, coursesValue, true);
    });
  });

  // Nút HỦY hẹn giờ ĐKHP
  btnCancelDkhp.addEventListener('click', () => {
    chrome.storage.local.set({ dkhp_enabled: false }, () => {
      chrome.runtime.sendMessage({ action: 'cancelDkhp' });
      showStatus(dkhpStatusMsg, '✕ Đã tắt hẹn giờ.', 'var(--red)');
      refreshCountdown(null, null, false);
    });
  });

  // Render ban đầu
  renderAlerts();
  renderTKB();
  renderGrades();
  renderExams();
});

// ============================================================
// HELPER
// ============================================================

// Hiển thị thông báo trạng thái lên element
function showStatus(el, text, color) {
  el.textContent = text;
  el.style.color = color;
}

// Hiển thị toast thông báo
function showToast(text, borderColor = 'var(--green)') {
  const toast = createEl('div', 'toast-notification', text);
  toast.style.borderColor = borderColor;
  toast.style.color = borderColor;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

// Tạo ID duy nhất cho event
function generateEventId() {
  return 'manual_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

// ============================================================
// THÊM MÔN HỌC THỦ CÔNG
// ============================================================

// Đóng modal thêm môn
function closeAddModal() {
  document.getElementById('modal-add-course').classList.remove('active');
  document.getElementById('add-course-status').textContent = '';
  ['add-ma-mon', 'add-gv', 'add-phong', 'add-tiet'].forEach((id) => {
    const el = document.getElementById(id);
    el.value = '';
    el.classList.remove('input-error');
  });
  document.getElementById('add-thu').value = '';
  document.getElementById('add-thu').classList.remove('input-error');
}

// Thêm môn học thủ công vào TKB
function addManualEvent() {
  const statusEl = document.getElementById('add-course-status');
  const maMon = document.getElementById('add-ma-mon').value.trim();
  const gv = document.getElementById('add-gv').value.trim();
  const phong = document.getElementById('add-phong').value.trim();
  const thu = document.getElementById('add-thu').value;
  const tietStr = document.getElementById('add-tiet').value.trim();

  // Clear errors
  ['add-ma-mon', 'add-thu', 'add-tiet'].forEach((id) => {
    document.getElementById(id).classList.remove('input-error');
  });

  // Validate
  let hasError = false;
  if (!maMon) {
    document.getElementById('add-ma-mon').classList.add('input-error');
    hasError = true;
  }
  if (!thu) {
    document.getElementById('add-thu').classList.add('input-error');
    hasError = true;
  }
  if (!tietStr || !/^[0-9]+$/.test(tietStr)) {
    document.getElementById('add-tiet').classList.add('input-error');
    hasError = true;
  }
  if (hasError) {
    statusEl.textContent = '⚠ Vui lòng điền đầy đủ các trường bắt buộc!';
    statusEl.style.color = 'var(--red)';
    return;
  }

  const tiets = parseTietString(tietStr);
  if (tiets.length === 0) {
    document.getElementById('add-tiet').classList.add('input-error');
    statusEl.textContent = '⚠ Tiết học không hợp lệ!';
    statusEl.style.color = 'var(--red)';
    return;
  }

  const startTiet = Math.min(...tiets);
  const spanTiet = tiets.length;
  const dayOfWeek = parseInt(thu, 10);

  const newEvent = {
    _id: generateEventId(),
    title: maMon,
    fullDesc: phong ? `Phòng: ${phong}` : '',
    teacher: gv || '',
    dayOfWeek: dayOfWeek,
    startTiet: startTiet,
    spanTiet: spanTiet,
    startDate: '2000-01-01',
    untilDate: '2099-12-31',
    interval: 1,
    isManual: true
  };

  chrome.storage.local.get(['saved_manual_events'], (res) => {
    const manualEvents = res.saved_manual_events || [];
    manualEvents.push(newEvent);
    chrome.storage.local.set({ saved_manual_events: manualEvents }, () => {
      closeAddModal();
      renderTKB();
      showToast(`✓ Đã thêm môn ${maMon} vào TKB`);
    });
  });
}

// ============================================================
// XÓA MÔN HỌC TRÊN TKB
// ============================================================

let _pendingDeleteEvent = null;
let _lastDeletedEvent = null;    // Cache event vừa xóa (để undo)
let _lastDeletedType = null;     // 'manual' | 'ics'

// Đóng modal xóa
function closeDeleteModal() {
  document.getElementById('modal-delete-confirm').classList.remove('active');
  _pendingDeleteEvent = null;
}

// Hiện modal xác nhận xóa
function promptDeleteEvent(ev) {
  _pendingDeleteEvent = ev;
  const subjectEl = document.getElementById('delete-subject-name');
  subjectEl.textContent = ev.title || 'Không xác định';
  document.getElementById('modal-delete-confirm').classList.add('active');
}

// Thực thi xóa event (có cache cho Undo)
function executeDeleteEvent() {
  if (!_pendingDeleteEvent) return;
  const ev = _pendingDeleteEvent;

  if (ev.isManual && ev._id) {
    // Xóa khỏi saved_manual_events
    chrome.storage.local.get(['saved_manual_events'], (res) => {
      let manualEvents = res.saved_manual_events || [];
      // Cache event trước khi xóa
      const deletedEvent = manualEvents.find((e) => e._id === ev._id);
      manualEvents = manualEvents.filter((e) => e._id !== ev._id);
      chrome.storage.local.set({ saved_manual_events: manualEvents }, () => {
        // Lưu undo state
        _lastDeletedEvent = deletedEvent || ev;
        _lastDeletedType = 'manual';
        chrome.storage.local.set({
          undo_last_event: _lastDeletedEvent,
          undo_last_type: _lastDeletedType
        });
        updateUndoButton();
        closeDeleteModal();
        renderTKB();
        showToast(`✓ Đã xóa môn ${ev.title}`);
      });
    });
  } else {
    // Ẩn event ICS (thêm vào hidden list)
    const hideKey = `${ev.title}__${ev.dayOfWeek}__${ev.startTiet}__${ev.spanTiet}`;
    chrome.storage.local.get(['hidden_tkb_events'], (res) => {
      const hidden = res.hidden_tkb_events || [];
      if (!hidden.includes(hideKey)) hidden.push(hideKey);
      chrome.storage.local.set({ hidden_tkb_events: hidden }, () => {
        // Lưu undo state
        _lastDeletedEvent = ev;
        _lastDeletedType = 'ics';
        chrome.storage.local.set({
          undo_last_event: _lastDeletedEvent,
          undo_last_type: _lastDeletedType
        });
        updateUndoButton();
        closeDeleteModal();
        renderTKB();
        showToast(`✓ Đã ẩn môn ${ev.title}`);
      });
    });
  }
}

// Cập nhật trạng thái nút Undo trên toolbar
function updateUndoButton() {
  const btn = document.getElementById('btn-undo-delete');
  if (!btn) return;

  if (_lastDeletedEvent) {
    btn.disabled = false;
    btn.classList.add('has-undo');
    const title = _lastDeletedEvent.title || 'Không xác định';
    const shortTitle = title.split(' - ')[0].trim();
    btn.innerHTML = `<span class="undo-label">↩ Hoàn tác</span><span class="undo-course-name">${shortTitle}</span>`;
    btn.title = `Hoàn tác: khôi phục môn ${shortTitle}`;
  } else {
    btn.disabled = true;
    btn.classList.remove('has-undo');
    btn.innerHTML = '<span class="undo-label">↩ Hoàn tác</span>';
    btn.title = 'Chưa có thao tác xóa nào để hoàn tác';
  }
}

// Hoàn tác xóa môn (Undo)
function undoDelete() {
  if (!_lastDeletedEvent) return;

  const ev = _lastDeletedEvent;
  const type = _lastDeletedType;

  if (type === 'manual') {
    // Thêm lại event manual vào danh sách
    chrome.storage.local.get(['saved_manual_events'], (res) => {
      const manualEvents = res.saved_manual_events || [];
      manualEvents.push(ev);
      chrome.storage.local.set({ saved_manual_events: manualEvents }, () => {
        clearUndoState();
        renderTKB();
        showToast(`↩ Đã hoàn tác — ${ev.title} đã được khôi phục`, 'var(--orange)');
      });
    });
  } else if (type === 'ics') {
    // Bỏ ẩn event ICS (xóa hideKey khỏi danh sách)
    const hideKey = `${ev.title}__${ev.dayOfWeek}__${ev.startTiet}__${ev.spanTiet}`;
    chrome.storage.local.get(['hidden_tkb_events'], (res) => {
      let hidden = res.hidden_tkb_events || [];
      hidden = hidden.filter((k) => k !== hideKey);
      chrome.storage.local.set({ hidden_tkb_events: hidden }, () => {
        clearUndoState();
        renderTKB();
        showToast(`↩ Đã hoàn tác — ${ev.title} đã được khôi phục`, 'var(--orange)');
      });
    });
  }
}

// Xóa undo state (sau khi undo hoặc khi không cần nữa)
function clearUndoState() {
  _lastDeletedEvent = null;
  _lastDeletedType = null;
  chrome.storage.local.remove(['undo_last_event', 'undo_last_type']);
  updateUndoButton();
}

// ============================================================
// COUNTDOWN ĐKHP REALTIME
// ============================================================

let _countdownInterval = null;

// Cập nhật đồng hồ đếm ngược ĐKHP (4 trạng thái: off, active, urgent, done)
function refreshCountdown(datetimeStr, coursesStr, enabled) {
  if (_countdownInterval) {
    clearInterval(_countdownInterval);
    _countdownInterval = null;
  }

  const card = document.getElementById('dkhp-status-card');
  const clock = document.getElementById('cd-clock');
  const target = document.getElementById('cd-target');
  const badge = document.getElementById('cd-badge');
  const courses = document.getElementById('cd-courses');
  const pills = document.getElementById('cd-pills');

  card.className = 'dkhp-status-card state-off';
  clock.className = 'cd-clock off';
  badge.className = 'cd-badge off';
  courses.style.display = 'none';

  if (!enabled || !datetimeStr) {
    clock.textContent = '--:--:--';
    target.textContent = 'Chưa đặt lịch';
    badge.textContent = 'Chưa kích hoạt';
    return;
  }

  const targetTime = new Date(datetimeStr).getTime();
  target.textContent = '🎯 ' + new Date(targetTime).toLocaleString('vi-VN');

  if (coursesStr && coursesStr.trim()) {
    const list = coursesStr.trim().split('\n').map((s) => s.trim()).filter((s) => s);
    pills.textContent = '';
    list.forEach((c) => {
      const p = document.createElement('span');
      p.className = 'course-pill';
      p.textContent = c;
      pills.appendChild(p);
    });
    courses.style.display = 'block';
  }

  // Tick mỗi 50ms để hiển thị mượt mà
  function tick() {
    const remaining = targetTime - Date.now();

    if (remaining <= 0) {
      clearInterval(_countdownInterval);
      clock.className = 'cd-clock done';
      clock.textContent = '🔥 ĐÃ BẮN!';
      card.className = 'dkhp-status-card state-done';
      badge.className = 'cd-badge done';
      badge.textContent = 'Đã kích hoạt';
      return;
    }

    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    const s = Math.floor((remaining % 60000) / 1000);
    const cs = Math.floor((remaining % 1000) / 10);

    if (remaining < 3600000) {
      clock.textContent = `${pad(m)}:${pad(s)}.${pad(cs)}`;
    } else {
      clock.textContent = `${h}:${pad(m)}:${pad(s)}`;
    }

    if (remaining < 120000) {
      card.className = 'dkhp-status-card state-urgent';
      clock.className = 'cd-clock urgent';
      badge.className = 'cd-badge urgent';
      badge.textContent = '⚡ Sắp bắn!';
    } else {
      card.className = 'dkhp-status-card state-active';
      clock.className = 'cd-clock';
      badge.className = 'cd-badge active';
      badge.textContent = '● Đang chờ';
    }
  }

  tick();
  _countdownInterval = setInterval(tick, 50);
}

// Pad số thành 2 chữ số
function pad(n) {
  return String(n).padStart(2, '0');
}

// ============================================================
// DOM BUILDER HELPER
// ============================================================

// Tạo element HTML nhanh với class và textContent
function createEl(tag, className = '', textContent = '') {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (textContent) el.textContent = textContent;
  return el;
}

// ============================================================
// TKB GRID: KHỞI TẠO LƯỚI NỀN
// ============================================================

// Khởi tạo lưới nền cho bảng TKB: cột thời gian (11 tiết) × 6 ngày
function initGridBackground() {
  const dynamicClasses = document.getElementById('dynamic-classes');
  const times = [
    '7:30–8:15', '8:15–9:00', '9:00–9:45', '10:00–10:45', '10:45–11:30',
    '13:00–13:45', '13:45–14:30', '14:30–15:15', '15:30–16:15', '16:15–17:00',
    '17:45–20:45'
  ];
  const tietNames = [
    'Tiết 1', 'Tiết 2', 'Tiết 3', 'Tiết 4', 'Tiết 5',
    'Tiết 6', 'Tiết 7', 'Tiết 8', 'Tiết 9', 'Tiết 10',
    'Buổi tối'
  ];

  for (let i = 0; i < 11; i++) {
    const timeCol = createEl('div', 'time-col');
    timeCol.style.gridColumn = '1';
    timeCol.style.gridRow = i + 2;
    const strong = document.createElement('strong');
    strong.textContent = tietNames[i];
    const span = document.createElement('span');
    span.textContent = times[i];
    timeCol.append(strong, span);
    dynamicClasses.parentNode.insertBefore(timeCol, dynamicClasses);

    for (let j = 2; j <= 7; j++) {
      const cell = createEl('div', 'tkb-cell');
      cell.style.gridColumn = j;
      cell.style.gridRow = i + 2;
      dynamicClasses.parentNode.insertBefore(cell, dynamicClasses);
    }
  }
}

// Chuyển tuần xem TKB (tiến/lùi)
function changeWeek(days) {
  currentViewDate.setDate(currentViewDate.getDate() + days);
  renderTKB();
}

// ============================================================
// RENDER: CẢNH BÁO
// ============================================================

// Hiển thị danh sách cảnh báo thay đổi lịch học
function renderAlerts() {
  chrome.storage.local.get(['tkb_alerts'], (res) => {
    if (res.tkb_alerts && res.tkb_alerts.length > 0) {
      document.getElementById('alert-container').style.display = 'block';
      const ul = document.getElementById('alert-list');
      ul.textContent = '';
      res.tkb_alerts.forEach((alert) => {
        const li = createEl('li');
        li.style.marginBottom = '6px';
        const b = createEl('b', '', alert.courseName);
        const a = createEl('a', '', '🔗 Xem chi tiết');
        a.href = alert.link;
        a.target = '_blank';
        li.append('Môn ', b, `: ${alert.title} `, a);
        ul.appendChild(li);
      });
    }
  });
}

// ============================================================
// RENDER: THỜI KHÓA BIỂU (TKB)
// ============================================================

// Render TKB theo tuần hiện tại (lọc sự kiện, xử lý nghỉ/bù, phát hiện trùng lịch)
function renderTKB() {
  const monday = getMonday(currentViewDate);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);

  const p = (n) => n.toString().padStart(2, '0');
  document.getElementById('week-display').textContent =
    `${p(monday.getDate())}/${p(monday.getMonth() + 1)}/${monday.getFullYear()} — ${p(sunday.getDate())}/${p(sunday.getMonth() + 1)}/${sunday.getFullYear()}`;

  chrome.storage.local.get(['saved_tkb_ics', 'saved_manual_events', 'hidden_tkb_events'], (res) => {
    const icsEvents = res.saved_tkb_ics || [];
    const manualEvents = res.saved_manual_events || [];
    const hiddenKeys = new Set(res.hidden_tkb_events || []);
    const container = document.getElementById('dynamic-classes');
    container.textContent = '';

    // Gộp tất cả events
    const allEvents = [...icsEvents, ...manualEvents];

    let weekEvents = [];

    allEvents.forEach((ev) => {
      // Lọc bỏ event đã ẩn
      const hideKey = `${ev.title}__${ev.dayOfWeek}__${ev.startTiet}__${ev.spanTiet}`;
      if (hiddenKeys.has(hideKey)) return;

      // Môn thủ công: luôn hiển thị mọi tuần
      if (ev.isManual) {
        let startRow = ev.startTiet + 1;
        if (ev.startTiet === 0) startRow = 11;
        if (ev.startTiet === 11) startRow = 12;

        weekEvents.push({
          ev: ev,
          col: ev.dayOfWeek,
          start: startRow,
          span: ev.spanTiet,
          end: startRow + ev.spanTiet - 1
        });
        return;
      }

      // Môn ICS: logic cũ
      const evStart = new Date(ev.startDate);
      const evUntil = new Date(ev.untilDate);
      const evMonday = getMonday(evStart);
      const diffWeeks = Math.round(
        (monday.getTime() - evMonday.getTime()) / (1000 * 60 * 60 * 24 * 7)
      );

      if (diffWeeks >= 0 && monday <= evUntil && (diffWeeks % ev.interval === 0)) {
        if (ev.isCancelled) return;

        let currentEv = ev;

        if (!ev.isMakeup) {
          const eventDate = new Date(monday);
          eventDate.setDate(monday.getDate() + (ev.dayOfWeek === 8 ? 6 : ev.dayOfWeek - 2));
          const eventDateStr = `${eventDate.getFullYear()}-${p(eventDate.getMonth() + 1)}-${p(eventDate.getDate())}`;
          const baseCode = ev.title.split(' - ')[0].trim();
          const isCancelledToday = allEvents.some((c) =>
            c.isCancelled && c.startDate === eventDateStr
            && (baseCode === c.title.split(' ')[0].trim()
              || baseCode.startsWith(c.title.split(' ')[0].trim() + '.'))
          );
          if (isCancelledToday) {
            currentEv = Object.assign({}, ev);
            currentEv.isCancelled = true;
            currentEv.title = baseCode + ' (NGHỈ)';
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

    const columns = { 2: [], 3: [], 4: [], 5: [], 6: [], 7: [], 8: [] };
    weekEvents.forEach((e) => columns[e.col].push(e));

    // Tạo card hiển thị cho 1 sự kiện trên lưới TKB (có nút xóa)
    function createCardNode(ev, isItem = false) {
      // Wrapper cho card (chứa cả nút xóa)
      const wrapDiv = createEl('div', 'class-card-wrap');

      let cls = 'class-card';
      if (ev.isManual) cls += ' manual-card';
      else if (ev.isMakeup) cls += ' makeup-card';
      else if (ev.isCancelled) cls += ' cancelled-card';
      else if (ev.title.includes('.1') || (ev.fullDesc && (ev.fullDesc.includes('HT1') || ev.fullDesc.includes('TH')))) cls += ' ht1-card';
      if (isItem) cls += ' overlap-item';

      const div = createEl('div', cls);
      const parts = ev.title.split(' - ');
      const room = parts.length > 1
        ? parts[1]
        : (ev.fullDesc && ev.fullDesc.includes('Phòng:') ? ev.fullDesc : '');

      div.appendChild(createEl('div', 'class-title', parts[0]));
      div.appendChild(createEl('div', 'class-room', room));
      const td = createEl('div', 'class-teacher', ev.teacher || '');
      div.appendChild(td);

      // Nút xóa (trash icon)
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'card-delete-btn';
      deleteBtn.innerHTML = '🗑';
      deleteBtn.title = `Xóa ${parts[0]}`;
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        promptDeleteEvent(ev);
      });

      wrapDiv.appendChild(div);
      wrapDiv.appendChild(deleteBtn);
      return wrapDiv;
    }

    for (let col in columns) {
      const evs = columns[col].sort((a, b) => a.start - b.start);
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
          const wrapper = createEl('div');
          wrapper.style.gridColumn = col;
          wrapper.style.gridRow = `${group[0].start} / span ${group[0].span}`;
          wrapper.style.zIndex = 10;
          // DEBUG: log vị trí grid để kiểm tra offset
          console.log(`[TKB DEBUG] "${group[0].ev.title}" | dayOfWeek=${group[0].ev.dayOfWeek} | startTiet=${group[0].ev.startTiet} | spanTiet=${group[0].ev.spanTiet} | gridCol=${col} | gridRow=${group[0].start}/span${group[0].span}`);
          wrapper.appendChild(createCardNode(group[0].ev));
          container.appendChild(wrapper);
        } else {
          // Nhiều sự kiện trùng lịch → hiển thị overlap container
          const wrapper = createEl('div', 'overlap-container');
          wrapper.style.gridColumn = col;
          wrapper.style.gridRow = `${groupStart} / span ${groupEnd - groupStart + 1}`;
          wrapper.style.zIndex = 20;

          const trigger = createEl('div', 'overlap-trigger');
          trigger.innerHTML = `
            <div class="overlap-text-wrap">
              ⚠️ Trùng ${group.length} lịch
              <span class="overlap-hint">Rê chuột vào</span>
            </div>
          `;

          const list = createEl('div', 'overlap-list');
          group.forEach((g) => list.appendChild(createCardNode(g.ev, true)));

          wrapper.append(trigger, list);
          container.appendChild(wrapper);
        }
        i = j;
      }
    }
  });
}

// ============================================================
// RENDER: BẢNG ĐIỂM
// ============================================================

// Hiển thị bảng điểm (nhóm theo học kỳ)
function renderGrades() {
  chrome.storage.local.get(['saved_grades'], (res) => {
    const grades = res.saved_grades || [];
    const tbody = document.querySelector('#grades-table tbody');
    tbody.textContent = '';

    if (grades.length === 0) {
      const tr = createEl('tr');
      const td = createEl('td', '', 'Đang chờ quét dữ liệu điểm... Hãy mở trang KQHT trên web trường.');
      td.colSpan = 9;
      td.style.color = 'var(--text-3)';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    let currentKy = '';
    grades.forEach((g) => {
      if (g.hocKy !== currentKy && g.hocKy !== 'Chưa xác định') {
        currentKy = g.hocKy;
        const headerTr = createEl('tr', 'semester-row');
        const headerTd = createEl('td', '', `📌 ${currentKy}`);
        headerTd.colSpan = 9;
        headerTr.appendChild(headerTd);
        tbody.appendChild(headerTr);
      }

      const tr = createEl('tr');
      const keys = ['maHP', 'tenHP', 'tc', 'diemQT', 'diemGK', 'diemTH', 'diemCK', 'diemHP', 'ghiChu'];
      keys.forEach((k) => {
        const td = createEl('td', '', g[k]);
        if (k === 'tenHP') td.style.cssText = 'text-align:left; font-weight:600;';
        if (k === 'diemHP') td.style.cssText = 'color:var(--green); font-weight:700; font-family:"JetBrains Mono",monospace;';
        if (k === 'maHP') td.style.cssText = 'font-family:"JetBrains Mono",monospace; font-size:12px; color:var(--text-2);';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  });
}

// ============================================================
// RENDER: LỊCH THI
// ============================================================

// Hiển thị lịch thi
function renderExams() {
  chrome.storage.local.get(['saved_exams'], (res) => {
    const exams = res.saved_exams || [];
    const tbody = document.querySelector('#exams-table tbody');
    tbody.textContent = '';

    if (exams.length === 0) {
      const tr = createEl('tr');
      const td = createEl('td', '', 'Chưa có lịch thi hoặc đang chờ đồng bộ...');
      td.colSpan = 8;
      td.style.color = 'var(--text-3)';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    exams.forEach((e) => {
      const tr = createEl('tr');
      const keys = ['stt', 'maMH', 'maLop', 'caThi', 'thuThi', 'ngayThi', 'phongThi', 'ghiChu'];
      keys.forEach((k) => {
        const td = createEl('td', '', e[k]);
        if (k === 'maMH') td.style.cssText = 'color:var(--purple); font-weight:700; font-family:"JetBrains Mono",monospace;';
        if (k === 'maLop') td.style.cssText = 'font-family:"JetBrains Mono",monospace; font-size:12px;';
        if (k === 'ngayThi') td.style.cssText = 'color:var(--green); font-weight:600;';
        if (k === 'phongThi') td.style.cssText = 'color:var(--red); font-weight:700;';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  });
}

// ============================================================
// MODULE XẾP LỚP TKB
// ============================================================

let _allClasses = [];
let _selectedCodes = [];

// Parse chuỗi tiết: "123" → [1,2,3], "1011" → [10,11], "1234" → [1,2,3,4]
function parseTietString(tietStr) {
  if (!tietStr) return [];
  const s = String(tietStr).trim();

  // Heuristic: Nếu chuỗi KHÔNG chứa '0' → thử parse từng ký tự là tiết đơn (1-9)
  // Vì tiết 0 không tồn tại, '0' chỉ xuất hiện trong tiết 10 trở lên.
  // Nếu parse đơn bị trùng lặp (VD: "1112") → fallback sang greedy 2 chữ số.
  const hasZero = s.includes('0');

  if (!hasZero) {
    const singleDigits = [];
    for (let i = 0; i < s.length; i++) {
      const d = parseInt(s[i], 10);
      if (!isNaN(d) && d > 0) singleDigits.push(d);
    }
    // Kiểm tra trùng lặp: nếu không trùng → chắc chắn là tiết đơn
    const unique = new Set(singleDigits);
    if (unique.size === singleDigits.length) {
      return singleDigits;
    }
    // Có trùng (VD: "1112" → [1,1,1,2]) → fallback sang greedy bên dưới
  }

  // Greedy two-digit parser: dùng khi có '0' hoặc khi single-digit bị trùng
  const tiets = [];
  let i = 0;
  while (i < s.length) {
    if (i + 1 < s.length) {
      const twoDigit = parseInt(s.substring(i, i + 2), 10);
      if (twoDigit >= 10 && twoDigit <= 16) {
        tiets.push(twoDigit);
        i += 2;
        continue;
      }
    }
    const oneDigit = parseInt(s[i], 10);
    if (!isNaN(oneDigit) && oneDigit > 0) {
      tiets.push(oneDigit);
    }
    i++;
  }
  return tiets;
}

// Kiểm tra trùng lịch giữa các lớp đã chọn
function checkConflicts(selectedClasses) {
  const conflicts = [];
  for (let i = 0; i < selectedClasses.length; i++) {
    for (let j = i + 1; j < selectedClasses.length; j++) {
      const a = selectedClasses[i];
      const b = selectedClasses[j];
      if (a.thu && b.thu && String(a.thu) === String(b.thu)) {
        const tietsA = parseTietString(a.tiet);
        const tietsB = parseTietString(b.tiet);
        const overlap = tietsA.filter((t) => tietsB.includes(t));
        if (overlap.length > 0) {
          conflicts.push({ a, b, overlap, thu: a.thu });
        }
      }
    }
  }
  return conflicts;
}

// ============================================================
// XỬ LÝ UPLOAD FILE XLSX
// ============================================================

// Đọc và parse file XLSX chứa danh sách lớp học phần
function handleXlsxUpload(file) {
  const statusEl = document.getElementById('xlsx-upload-status');
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

      // Tìm dòng tiêu đề (header row)
      let headerIdx = -1;
      const colMap = {};
      const requiredKeywords = [
        'MÃ LỚP', 'MA LOP', 'MALOP',
        'MÃ MH', 'MA MH', 'MAMH',
        'TÊN MÔN', 'TEN MON'
      ];

      for (let i = 0; i < Math.min(rows.length, 25); i++) {
        const row = rows[i];
        if (!row || !Array.isArray(row)) continue;

        let matchCount = 0;
        row.forEach((cell) => {
          const val = String(cell || '').trim().toUpperCase();
          if (requiredKeywords.some((kw) => val === kw || val.includes(kw))) {
            matchCount++;
          }
        });

        if (matchCount >= 2) {
          headerIdx = i;
          row.forEach((cell, colIdx) => {
            const val = String(cell || '').trim().toUpperCase();
            if (val) {
              colMap[val] = colIdx;
            }
          });
          break;
        }
      }

      // Lấy giá trị cột theo tên (patterns), fallback theo index
      const getColValue = (row, patterns, fallbackIdx) => {
        if (headerIdx !== -1) {
          for (const colName of Object.keys(colMap)) {
            for (const p of patterns) {
              if (colName === p.toUpperCase() || colName.includes(p.toUpperCase())) {
                const idx = colMap[colName];
                if (idx !== undefined && idx < row.length) {
                  return row[idx];
                }
              }
            }
          }
        }
        if (fallbackIdx !== undefined && fallbackIdx < row.length) {
          return row[fallbackIdx];
        }
        return '';
      };

      const dataRows = headerIdx !== -1 ? rows.slice(headerIdx + 1) : rows;

      _allClasses = dataRows.map((row, idx) => {
        if (!row || !Array.isArray(row) || row.length === 0) return null;

        const maLopVal = String(getColValue(row, ['MÃ LỚP', 'MA LOP', 'MALOP'], 2) || '').trim();
        if (!maLopVal) return null;

        return {
          stt: getColValue(row, ['STT'], 0) || (idx + 1),
          maMH: String(getColValue(row, ['MÃ MH', 'MA MH', 'MAMH'], 1) || '').trim(),
          maLop: maLopVal,
          tenMH: String(getColValue(row, ['TÊN MÔN HỌC', 'TEN MON HOC', 'TÊN MÔN', 'TEN MON'], 3) || '').trim(),
          maGV: String(getColValue(row, ['MÃ GIẢNG VIÊN', 'MA GIANG VIEN', 'MÃ GV'], 4) || '').trim(),
          tenGV: String(getColValue(row, ['TÊN GIẢNG VIÊN', 'TEN GIANG VIEN', 'TÊN GV'], 5) || '').trim(),
          siSo: getColValue(row, ['SĨ SỐ', 'SI SO', 'SISO'], 6),
          soTC: getColValue(row, ['TỐ TC', 'TO TC', 'SỐ TC', 'SO TC', 'TC'], 7),
          thucHanh: getColValue(row, ['THỰC HÀNH', 'THUC HANH'], 8),
          htgd: getColValue(row, ['HTGD'], 9),
          thu: getColValue(row, ['THỨ', 'THU'], 10),
          tiet: String(getColValue(row, ['TIẾT', 'TIET'], 11) || '').trim(),
          cachTuan: getColValue(row, ['CÁCH TUẦN', 'CACH TUAN'], 12),
          phongHoc: getColValue(row, ['PHÒNG HỌC', 'PHONG HOC', 'PHÒNG', 'PHONG'], 13),
          khoaHoc: getColValue(row, ['KHOÁ HỌC', 'KHOA HOC'], 14),
          hocKy: getColValue(row, ['HỌC KỲ', 'HOC KY'], 15),
          namHoc: getColValue(row, ['NĂM HỌC', 'NAM HOC'], 16),
          heDT: getColValue(row, ['HỆ ĐT', 'HE DT'], 17),
          khoaQL: String(getColValue(row, ['KHOA QL', 'KHOA'], 18) || '').trim(),
          nbd: getColValue(row, ['NBD'], 19),
          nkt: getColValue(row, ['NKT'], 20)
        };
      }).filter(Boolean);

      statusEl.textContent = `✓ Đã tải ${_allClasses.length} lớp từ ${file.name}`;
      statusEl.style.color = 'var(--green)';

      chrome.storage.local.set({ xeplop_all_classes: _allClasses });
      populateKhoaFilter();
      renderCourseTable();
      renderPreviewTKB();
    } catch (err) {
      console.error('Lỗi parse XLSX:', err);
      statusEl.textContent = '✕ Lỗi đọc file: ' + err.message;
      statusEl.style.color = 'var(--red)';
    }
  };
  reader.readAsArrayBuffer(file);
}

// Cập nhật bộ lọc Khoa từ dữ liệu lớp đã parse
function populateKhoaFilter() {
  const select = document.getElementById('xeplop-khoa-filter');
  const khoas = [...new Set(_allClasses.map((c) => c.khoaQL).filter(Boolean))].sort();
  select.innerHTML = '<option value="">Tất cả Khoa</option>';
  khoas.forEach((k) => {
    const opt = document.createElement('option');
    opt.value = k;
    opt.textContent = k;
    select.appendChild(opt);
  });
}

// Lấy nhóm gốc từ mã lớp: "IT001.CNVN.1" → "IT001.CNVN", "IT001.CNVN" → "IT001.CNVN"
function getBaseGroup(maLop) {
  if (!maLop) return '';
  const parts = maLop.split('.');
  // Nếu có >= 3 phần (VD: IT001.CNVN.1 = thực hành), nhóm gốc = 2 phần đầu
  // Nếu có <= 2 phần (VD: IT001.CNVN = lý thuyết), nhóm gốc = chính nó
  if (parts.length >= 3) {
    return parts.slice(0, 2).join('.');
  }
  return maLop;
}

// ============================================================
// RENDER: BẢNG LỚP HỌC PHẦN (XẾP LỚP)
// ============================================================

// Render bảng lớp với ràng buộc khóa mã MH và khóa tiết/thứ đã chiếm
function renderCourseTable() {
  const tbody = document.querySelector('#xeplop-table tbody');
  const searchVal = (document.getElementById('xeplop-search').value || '').trim().toLowerCase();
  const khoaVal = document.getElementById('xeplop-khoa-filter').value;

  tbody.innerHTML = '';

  let filtered = _allClasses;
  if (khoaVal) filtered = filtered.filter((c) => c.khoaQL === khoaVal);
  if (searchVal) {
    filtered = filtered.filter((c) => {
      const h = `${c.maLop} ${c.maMH} ${c.tenMH} ${c.tenGV} ${c.maGV}`.toLowerCase();
      return h.includes(searchVal);
    });
  }

  if (filtered.length === 0) {
    const tr = createEl('tr');
    const msg = _allClasses.length > 0
      ? 'Không tìm thấy lớp phù hợp.'
      : 'Chưa có dữ liệu. Hãy upload file XLSX.';
    const td = createEl('td', '', msg);
    td.colSpan = 8;
    td.style.color = 'var(--text-3)';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  const selectedClasses = _allClasses.filter((c) => _selectedCodes.includes(c.maLop));
  const conflicts = checkConflicts(selectedClasses);
  const conflictCodes = new Set();
  conflicts.forEach((c) => {
    conflictCodes.add(c.a.maLop);
    conflictCodes.add(c.b.maLop);
  });

  // Ràng buộc 1: Tập hợp mã MH đã có lớp được chọn + nhóm gốc
  const selectedMaMH = new Set();
  const selectedBaseGroups = new Set();
  selectedClasses.forEach((c) => {
    if (c.maMH) selectedMaMH.add(c.maMH);
    if (c.maLop) selectedBaseGroups.add(getBaseGroup(c.maLop));
  });

  // Ràng buộc 2: Map "thu_tiet" → mã lớp đã chiếm slot
  const occupiedSlots = {};
  selectedClasses.forEach((c) => {
    if (!c.thu) return;
    const tiets = parseTietString(c.tiet);
    tiets.forEach((t) => {
      const key = `${c.thu}_${t}`;
      occupiedSlots[key] = c.maLop;
    });
  });

  filtered.forEach((c) => {
    const tr = document.createElement('tr');
    const isSelected = _selectedCodes.includes(c.maLop);
    const isConflict = conflictCodes.has(c.maLop);

    let isLockedByMaMH = false;
    let isLockedByTime = false;
    let lockReason = '';

    if (!isSelected) {
      // Ràng buộc mã MH: chỉ áp dụng giữa LÝ THUYẾT vs LÝ THUYẾT
      // Môn thực hành (≥3 phần trong maLop) KHÔNG bị khóa bởi mã MH
      // → chỉ bị khóa bởi trùng lịch (kiểm tra thời gian bên dưới)
      if (c.maMH && selectedMaMH.has(c.maMH)) {
        const thisParts = (c.maLop || '').split('.').length;
        const isThisPractice = thisParts >= 3;

        if (!isThisPractice) {
          // Candidate là lý thuyết → chặn nếu đã chọn lý thuyết khác cùng mã MH
          const selectedTheory = selectedClasses.find((s) =>
            s.maMH === c.maMH && (s.maLop || '').split('.').length <= 2
          );
          if (selectedTheory) {
            isLockedByMaMH = true;
            lockReason = `Đã chọn lớp LT ${selectedTheory.maLop} cùng mã MH ${c.maMH}`;
          }
        }
        // Nếu candidate là thực hành → KHÔNG khóa bởi mã MH
        // → Cho phép chọn tự do, chỉ chặn nếu trùng thời gian (bên dưới)
      }

      if (!isLockedByMaMH && c.thu) {
        const tiets = parseTietString(c.tiet);
        const overlapping = tiets.filter((t) => occupiedSlots[`${c.thu}_${t}`]);
        if (overlapping.length > 0) {
          isLockedByTime = true;
          const blockerCode = occupiedSlots[`${c.thu}_${overlapping[0]}`];
          lockReason = `Trùng Thứ ${c.thu}, Tiết ${overlapping.join(',')} với ${blockerCode}`;
        }
      }
    }

    const isLocked = isLockedByMaMH || isLockedByTime;

    if (isSelected && isConflict) tr.className = 'conflict-row';
    else if (isSelected) tr.className = 'selected-row';
    else if (isLocked) tr.className = 'locked-row';

    const tdCb = document.createElement('td');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isSelected;
    cb.disabled = isLocked;
    cb.style.cssText = 'cursor:pointer; width:16px; height:16px;';
    if (isLocked) {
      cb.style.cssText = 'width:16px; height:16px; cursor:not-allowed; opacity:0.4;';
      tdCb.title = '🔒 ' + lockReason;
    }
    cb.addEventListener('change', () => {
      if (isLocked) {
        cb.checked = false;
        return;
      }
      if (cb.checked) {
        if (!_selectedCodes.includes(c.maLop)) _selectedCodes.push(c.maLop);
      } else {
        _selectedCodes = _selectedCodes.filter((code) => code !== c.maLop);
      }
      saveSelectedClasses();
      renderCourseTable();
      renderPreviewTKB();
    });
    tdCb.appendChild(cb);
    tr.appendChild(tdCb);

    const tdCode = createEl('td', 'col-code', c.maLop);
    const tdName = createEl('td', 'col-name', c.tenMH);
    tdName.title = c.tenMH;
    if (isLocked) {
      tdCode.style.opacity = '0.45';
      tdName.style.opacity = '0.45';
    }
    tr.appendChild(tdCode);
    tr.appendChild(tdName);
    const tdGV = createEl('td', '', c.tenGV || c.maGV);
    const tdThu = createEl('td', '', c.thu ? `T${c.thu}` : '');
    const tiets = parseTietString(c.tiet);
    const tdTiet = createEl('td', '', tiets.length > 0 ? tiets.join(',') : String(c.tiet || ''));
    const tdPhong = createEl('td', '', c.phongHoc);
    const tdSiSo = createEl('td', '', c.siSo);
    if (isLocked) {
      [tdGV, tdThu, tdTiet, tdPhong, tdSiSo].forEach((td) => td.style.opacity = '0.45');
    }
    tr.append(tdGV, tdThu, tdTiet, tdPhong, tdSiSo);

    if (isLocked) {
      tr.title = '🔒 ' + lockReason;
    }

    tbody.appendChild(tr);
  });

  document.getElementById('xeplop-count').textContent = _selectedCodes.length;
  renderConflicts(conflicts);
}

// Hiển thị danh sách cảnh báo trùng lịch
function renderConflicts(conflicts) {
  const container = document.getElementById('conflict-list');
  container.innerHTML = '';
  if (conflicts.length === 0) return;
  conflicts.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'conflict-badge';
    div.innerHTML = `<span class="conflict-icon">⚠️</span><span><b>${c.a.maLop}</b> & <b>${c.b.maLop}</b> — Thứ ${c.thu}, Tiết ${c.overlap.join(',')}</span>`;
    container.appendChild(div);
  });
}

// ============================================================
// RENDER: PREVIEW TKB (XẾP LỚP)
// ============================================================

// Render bảng xem trước TKB từ các lớp đã chọn
function renderPreviewTKB() {
  const grid = document.getElementById('preview-grid');
  grid.querySelectorAll('.time-col, .preview-cell, .preview-class-wrap').forEach((el) => el.remove());

  for (let i = 1; i <= 11; i++) {
    const timeCol = document.createElement('div');
    timeCol.className = 'time-col';
    timeCol.style.gridColumn = '1';
    timeCol.style.gridRow = i + 1;
    timeCol.textContent = i <= 10 ? `T${i}` : 'Tối';
    grid.appendChild(timeCol);

    for (let j = 2; j <= 7; j++) {
      const cell = document.createElement('div');
      cell.className = 'preview-cell';
      cell.style.gridColumn = j;
      cell.style.gridRow = i + 1;
      grid.appendChild(cell);
    }
  }

  const selectedClasses = _allClasses.filter((c) => _selectedCodes.includes(c.maLop));
  const conflicts = checkConflicts(selectedClasses);
  const conflictPairs = new Set();
  conflicts.forEach((c) => {
    conflictPairs.add(c.a.maLop);
    conflictPairs.add(c.b.maLop);
  });

  selectedClasses.forEach((c) => {
    const thu = parseInt(c.thu, 10);
    if (isNaN(thu) || thu < 2 || thu > 7) return;

    const tiets = parseTietString(c.tiet);
    if (tiets.length === 0) return;

    const startTiet = Math.min(...tiets);
    const spanTiet = tiets.length;
    const col = thu;
    const startRow = (startTiet <= 10 ? startTiet : 11) + 1;

    const wrapper = document.createElement('div');
    wrapper.className = 'preview-class-wrap';
    wrapper.style.gridColumn = col;
    wrapper.style.gridRow = `${startRow} / span ${spanTiet}`;
    wrapper.style.zIndex = '10';

    const card = document.createElement('div');
    card.className = 'preview-class' + (conflictPairs.has(c.maLop) ? ' p-conflict' : '');

    const codeDiv = document.createElement('div');
    codeDiv.className = 'p-code';
    codeDiv.textContent = c.maLop;

    const roomDiv = document.createElement('div');
    roomDiv.className = 'p-room';
    roomDiv.textContent = c.phongHoc || '';

    card.append(codeDiv, roomDiv);
    wrapper.appendChild(card);
    grid.appendChild(wrapper);
  });

  renderSelectedPills(selectedClasses);
}

// Render danh sách pills hiển thị các lớp đã chọn (có nút × để bỏ chọn)
function renderSelectedPills(selectedClasses) {
  const container = document.getElementById('selected-pills');
  container.innerHTML = '';
  selectedClasses.forEach((c) => {
    const pill = document.createElement('span');
    pill.className = 'sel-pill';
    const text = document.createTextNode(c.maLop);
    const removeBtn = document.createElement('span');
    removeBtn.className = 'pill-remove';
    removeBtn.textContent = '×';
    removeBtn.title = 'Bỏ chọn ' + c.maLop;
    removeBtn.addEventListener('click', () => {
      _selectedCodes = _selectedCodes.filter((code) => code !== c.maLop);
      saveSelectedClasses();
      renderCourseTable();
      renderPreviewTKB();
    });
    pill.append(text, removeBtn);
    container.appendChild(pill);
  });
}

// ============================================================
// LƯU / TẢI DỮ LIỆU XẾP LỚP
// ============================================================

// Lưu danh sách mã lớp đã chọn vào storage
function saveSelectedClasses() {
  chrome.storage.local.set({ xeplop_selected: _selectedCodes });
}

// Tải lại danh sách lớp và mã lớp đã chọn từ storage
function loadSelectedClasses() {
  chrome.storage.local.get(['xeplop_selected', 'xeplop_all_classes'], (res) => {
    _selectedCodes = res.xeplop_selected || [];
    if (res.xeplop_all_classes && res.xeplop_all_classes.length > 0) {
      _allClasses = res.xeplop_all_classes;
      const statusEl = document.getElementById('xlsx-upload-status');
      statusEl.textContent = `✓ Đã tải ${_allClasses.length} lớp (từ lần trước)`;
      statusEl.style.color = 'var(--green)';
      populateKhoaFilter();
      renderCourseTable();
      renderPreviewTKB();
    }
  });
}

// Sao chép danh sách mã lớp đã chọn sang textarea ĐKHP và chuyển tab
function copyToDKHP() {
  if (_selectedCodes.length === 0) return;
  const coursesText = _selectedCodes.join('\n');
  const dkhpTextarea = document.getElementById('dkhp-courses');
  if (dkhpTextarea) dkhpTextarea.value = coursesText;
  chrome.storage.local.set({ dkhp_courses: coursesText });

  document.querySelectorAll('.tab-btn, .tab-content').forEach((el) => el.classList.remove('active'));
  document.querySelector('[data-tab="tab-dkhp"]').classList.add('active');
  document.getElementById('tab-dkhp').classList.add('active');
}

// ============================================================
// KHỞI TẠO MODULE XẾP LỚP
// ============================================================

// Khởi tạo event listener cho module Xếp Lớp (upload, search, filter, buttons)
function initXepLop() {
  const fileInput = document.getElementById('xlsx-file-input');
  const uploadZone = document.getElementById('xlsx-upload-zone');

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) handleXlsxUpload(e.target.files[0]);
  });

  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
  uploadZone.addEventListener('dragleave', () => {
    uploadZone.classList.remove('dragover');
  });
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleXlsxUpload(e.dataTransfer.files[0]);
  });

  let searchTimeout;
  document.getElementById('xeplop-search').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderCourseTable, 200);
  });
  document.getElementById('xeplop-khoa-filter').addEventListener('change', renderCourseTable);

  document.getElementById('btn-copy-dkhp').addEventListener('click', copyToDKHP);
  document.getElementById('btn-clear-xeplop').addEventListener('click', () => {
    _selectedCodes = [];
    saveSelectedClasses();
    renderCourseTable();
    renderPreviewTKB();
  });

  loadSelectedClasses();
}

// Khởi tạo module Xếp Lớp khi DOM sẵn sàng
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initXepLop);
} else {
  initXepLop();
}