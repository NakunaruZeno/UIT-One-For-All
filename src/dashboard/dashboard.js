/**
 * UIT One For All — Academic Dashboard Controller
 */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const UIT_PERIOD_TIMES = [
    { tiet: 1, range: '07:30 - 08:15' },
    { tiet: 2, range: '08:15 - 09:00' },
    { tiet: 3, range: '09:00 - 09:45' },
    { tiet: 4, range: '09:55 - 10:40' },
    { tiet: 5, range: '10:40 - 11:25' },
    { tiet: 6, range: '13:00 - 13:45' },
    { tiet: 7, range: '13:45 - 14:30' },
    { tiet: 8, range: '14:30 - 15:15' },
    { tiet: 9, range: '15:25 - 16:10' },
    { tiet: 10, range: '16:10 - 16:55' }
  ];

  let currentMonday = getMonday(new Date());
  let activeDetailContext = null;

  // =========================================================================
  // 1. INITIALIZATION, THEME & SIDEBAR NAVIGATION
  // =========================================================================
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');

  navItems.forEach((btn) => {
    btn.addEventListener('click', () => {
      navItems.forEach((b) => b.classList.remove('active'));
      tabPanes.forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.getAttribute('data-target'));
      if (target) target.classList.add('active');
    });
  });

  function switchToTab(tabId) {
    const targetBtn = document.querySelector(`.nav-item[data-target="${tabId}"]`);
    if (targetBtn) targetBtn.click();
  }

  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const iconSun = document.getElementById('theme-icon-sun');
  const iconMoon = document.getElementById('theme-icon-moon');
  const themeLabel = document.getElementById('theme-toggle-label');

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      iconSun.style.display = 'none';
      iconMoon.style.display = 'block';
      themeLabel.textContent = 'Giao diện Tối';
    } else {
      document.documentElement.removeAttribute('data-theme');
      iconSun.style.display = 'block';
      iconMoon.style.display = 'none';
      themeLabel.textContent = 'Giao diện Sáng';
    }
  }

  btnThemeToggle.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const next = isLight ? 'dark' : 'light';
    applyTheme(next);
    chrome.storage.local.set({ uit_theme: next });
  });

  function refreshSidebarStatus() {
    chrome.storage.local.get(
      [
        'uit_account',
        'uit_user',
        'portal_student_info',
        'tkb_EndDate',
        'tkb_scraped_until',
        'tkb_lastSync',
        'tkb_last_scraped',
        'uit_theme'
      ],
      (res) => {
        applyTheme(res.uit_theme || 'dark');

        const studentSub = document.getElementById('sidebar-student-id');
        const mssv =
          (res.uit_account && res.uit_account.username) ||
          res.uit_user ||
          (res.portal_student_info && res.portal_student_info.mssv);
        if (mssv) {
          studentSub.textContent = `MSSV: ${mssv}`;
        } else {
          studentSub.textContent = 'Cổng học vụ cá nhân';
        }

        const tkbStatusEl = document.getElementById('sidebar-tkb-status');
        const endDateVal = res.tkb_EndDate || res.tkb_scraped_until;
        if (endDateVal) {
          const dStr = new Date(endDateVal).toLocaleDateString('vi-VN');
          if (Date.now() > endDateVal) {
            tkbStatusEl.textContent = `Hết hạn (${dStr})`;
            tkbStatusEl.style.color = 'var(--danger)';
          } else {
            tkbStatusEl.textContent = `Hiệu lực → ${dStr}`;
            tkbStatusEl.style.color = 'var(--success)';
          }
        } else {
          tkbStatusEl.textContent = 'Chưa có dữ liệu';
          tkbStatusEl.style.color = 'var(--warning)';
        }

        const lastSyncEl = document.getElementById('sidebar-last-sync');
        const lastSyncVal = res.tkb_lastSync || res.tkb_last_scraped;
        if (lastSyncVal) {
          const d = new Date(lastSyncVal);
          lastSyncEl.textContent = `${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${d.toLocaleDateString('vi-VN')}`;
        } else {
          lastSyncEl.textContent = 'Chưa đồng bộ';
        }
      }
    );
  }

  document.getElementById('btn-global-sync').addEventListener('click', () => {
    const btn = document.getElementById('btn-global-sync');
    const txt = document.getElementById('global-sync-text');
    btn.disabled = true;
    txt.textContent = 'Đang đồng bộ...';

    chrome.runtime.sendMessage({ action: 'triggerCheck' }, () => {
      setTimeout(() => {
        btn.disabled = false;
        txt.textContent = 'Đồng Bộ Từ Portal';
      }, 2500);
    });
  });

  // Listen for live updates from content script
  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === 'gradesUpdated') {
      loadGrades();
      refreshSidebarStatus();
    } else if (req.action === 'tkbUpdated') {
      renderTKB();
      refreshSidebarStatus();
    } else if (req.action === 'examsUpdated') {
      loadExams();
    }
  });

  // Close any open modal on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop.open').forEach((m) => m.classList.remove('open'));
    }
  });

  // =========================================================================
  // 2. MODULE 1: THỜI KHÓA BIỂU (7-COLUMN GRID THỨ 2 -> CHỦ NHẬT)
  // =========================================================================
  function getMonday(d) {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
    dt.setDate(diff);
    dt.setHours(0, 0, 0, 0);
    return dt;
  }

  function initGridBackground(gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;

    for (let i = 0; i < 10; i++) {
      const row = i + 2;
      const isDivider = i === 4;

      const timeCell = document.createElement('div');
      timeCell.className = `tkb-time-cell${isDivider ? ' afternoon-divider' : ''}`;
      timeCell.style.gridColumn = '1';
      timeCell.style.gridRow = String(row);
      timeCell.innerHTML = `
        <span class="tkb-tiet-num">Tiết ${UIT_PERIOD_TIMES[i].tiet}</span>
        <span class="tkb-tiet-clock mono">${UIT_PERIOD_TIMES[i].range}</span>
      `;
      grid.appendChild(timeCell);

      // 7 cột từ Thứ 2 (col 2) đến Chủ Nhật (col 8)
      for (let col = 2; col <= 8; col++) {
        const bgCell = document.createElement('div');
        bgCell.className = `tkb-cell-bg${isDivider ? ' afternoon-divider' : ''}`;
        bgCell.style.gridColumn = String(col);
        bgCell.style.gridRow = String(row);
        grid.appendChild(bgCell);
      }
    }
  }

  function updateWeekHeaders() {
    const sunday = new Date(currentMonday);
    sunday.setDate(sunday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const fmtShort = (d) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

    document.getElementById('week-label').textContent = `${fmtShort(currentMonday)} – ${fmtShort(sunday)}/${sunday.getFullYear()}`;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Day offsets from Monday: Mon=0 (day 1), Tue=1 (day 2)... Sun=6 (day 0)
    const offsets = [
      { dayAttr: 1, offset: 0 },
      { dayAttr: 2, offset: 1 },
      { dayAttr: 3, offset: 2 },
      { dayAttr: 4, offset: 3 },
      { dayAttr: 5, offset: 4 },
      { dayAttr: 6, offset: 5 },
      { dayAttr: 0, offset: 6 }
    ];

    offsets.forEach(({ dayAttr, offset }) => {
      const cellDate = new Date(currentMonday);
      cellDate.setDate(cellDate.getDate() + offset);
      const dateSpan = document.getElementById(`date-col-${dayAttr}`);
      if (dateSpan) dateSpan.textContent = fmtShort(cellDate);

      const headerCell = document.querySelector(`#tkb-grid .tkb-header-cell[data-day="${dayAttr}"]`);
      if (headerCell) {
        if (cellDate.getTime() === today.getTime()) {
          headerCell.classList.add('is-today');
        } else {
          headerCell.classList.remove('is-today');
        }
      }
    });

    return sunday;
  }

  function renderTKB() {
    const grid = document.getElementById('tkb-grid');
    if (!grid) return;

    grid.querySelectorAll('.course-block').forEach((el) => el.remove());
    const currentSunday = updateWeekHeaders();

    chrome.storage.local.get(
      ['saved_tkb_ics', 'saved_custom_events', 'saved_manual_events', 'hidden_tkb_events'],
      (res) => {
        const icsEvents = res.saved_tkb_ics || [];
        const customEvents = res.saved_custom_events || [];
        const manualEvents = res.saved_manual_events || [];
        const hiddenEvents = res.hidden_tkb_events || [];

        const allEvents = [...icsEvents, ...customEvents, ...manualEvents];
        const weekKey = currentMonday.toISOString().split('T')[0];

        allEvents.forEach((ev) => {
          const evStart = new Date(ev.startDate);
          const evUntil = new Date(ev.untilDate);

          if (currentMonday > evUntil || currentSunday < evStart) return;

          // Kiểm tra lịch học Cách tuần (interval === 2)
          if (ev.interval && ev.interval > 1) {
            const evStartMonday = getMonday(evStart);
            const diffWeeks = Math.round(
              (currentMonday.getTime() - evStartMonday.getTime()) / (7 * 86400000)
            );
            if (diffWeeks < 0 || diffWeeks % ev.interval !== 0) return;
          }

          const startTiet = Math.max(1, Math.min(10, Number(ev.startTiet) || 1));
          const fallbackEnd = startTiet + (Number(ev.spanTiet) || 1) - 1;
          const endTiet = Math.max(
            startTiet,
            Math.min(10, Number(ev.endTiet) || fallbackEnd || startTiet)
          );

          const uniqueKey = `${ev.title}_${ev.dayOfWeek}_${startTiet}_${weekKey}`;
          if (hiddenEvents.includes(uniqueKey)) return;

          // Day of week: 1 (Mon) -> col 2 ... 6 (Sat) -> col 7, 0 (Sun) -> col 8
          const col = ev.dayOfWeek === 0 ? 8 : ev.dayOfWeek + 1;
          if (col < 2 || col > 8) return;

          const rowStart = startTiet + 1;
          const rowSpan = endTiet - startTiet + 1;

          const block = document.createElement('div');
          let stateClass = '';
          let badgeText = '';

          if (ev.type === 'bu') {
            stateClass = ' is-bu';
            badgeText = 'HỌC BÙ';
          } else if (ev.type === 'nghi' || ev.isCancelled) {
            stateClass = ' is-nghi';
            badgeText = 'BÁO NGHỈ';
          } else if (ev.isManual) {
            stateClass = ' is-manual';
            badgeText = 'CÁ NHÂN';
          } else if (ev.interval && ev.interval > 1) {
            badgeText = 'CÁCH TUẦN';
          }

          block.className = `course-block${stateClass}`;
          block.style.gridColumn = String(col);
          block.style.gridRow = `${rowStart} / span ${rowSpan}`;

          // Tách Mã lớp và Tên môn học để hiển thị gọn đẹp
          const cleanTitle = (ev.title || '').replace(/^\[(HỌC BÙ|BÁO NGHỈ)\]\s*/i, '');
          const parts = cleanTitle.split(' - ');
          const codePart = parts.length > 1 ? parts[0].trim() : (ev.maLop || 'LỊCH HỌC');
          const namePart = parts.length > 1 ? parts.slice(1).join(' - ').trim() : cleanTitle;

          let roomDisplay = ev.room || '';
          if (!roomDisplay && ev.fullDesc) {
            const rm = ev.fullDesc.match(/Phòng:\s*([^|\n]+)/i);
            if (rm) roomDisplay = rm[1].trim();
          }

          block.innerHTML = `
            <div>
              <div class="course-code-tag mono">
                <span>${escapeHtml(codePart)}</span>
                ${badgeText ? `<span>${badgeText}</span>` : ''}
              </div>
              <div class="course-name">${escapeHtml(namePart)}</div>
            </div>
            <div class="course-meta">
              <span class="course-room-pill mono">${escapeHtml(roomDisplay || '—')}</span>
              <span class="mono">T${startTiet}–${endTiet}</span>
            </div>
          `;

          block.addEventListener('click', () => {
            openCourseDetailModal(ev, uniqueKey, codePart, namePart, startTiet, endTiet);
          });

          grid.appendChild(block);
        });
      }
    );
  }

  function openCourseDetailModal(ev, uniqueKey, codePart, namePart, startTiet, endTiet) {
    activeDetailContext = { ev, uniqueKey };
    const modal = document.getElementById('modal-course-detail');
    const body = document.getElementById('detail-modal-body');

    const dayNames = ['Chủ Nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const startStr = new Date(ev.startDate).toLocaleDateString('vi-VN');
    const untilStr = new Date(ev.untilDate).toLocaleDateString('vi-VN');
    const freqStr = ev.interval && ev.interval > 1 ? ' · Học cách tuần' : '';

    body.innerHTML = `
      <div><strong style="color:var(--text-secondary);">Mã lớp / Phân loại:</strong> <span class="mono" style="font-weight:700; color:var(--accent);">${escapeHtml(codePart)}</span></div>
      <div><strong style="color:var(--text-secondary);">Môn học:</strong> <span style="font-weight:600;">${escapeHtml(namePart)}</span></div>
      <div><strong style="color:var(--text-secondary);">Thời gian:</strong> <span class="mono">${dayNames[ev.dayOfWeek] || ''} · Tiết ${startTiet}–${endTiet}${freqStr}</span></div>
      <div><strong style="color:var(--text-secondary);">Phòng học:</strong> <span class="mono" style="font-weight:600;">${escapeHtml(ev.room || 'Chưa cập nhật')}</span></div>
      <div><strong style="color:var(--text-secondary);">Giảng viên:</strong> <span>${escapeHtml(ev.teacher || 'Xem trên Portal')}</span></div>
      <div><strong style="color:var(--text-secondary);">Hiệu lực:</strong> <span class="mono">${startStr} → ${untilStr}</span></div>
    `;

    modal.classList.add('open');
  }

  document.getElementById('btn-close-detail-modal').addEventListener('click', () => {
    document.getElementById('modal-course-detail').classList.remove('open');
  });

  document.getElementById('btn-delete-this-occurrence').addEventListener('click', () => {
    if (!activeDetailContext) return;
    const { ev, uniqueKey } = activeDetailContext;

    if (ev.isManual) {
      chrome.storage.local.get(['saved_manual_events'], (res) => {
        const list = (res.saved_manual_events || []).filter((m) => m.id !== ev.id);
        chrome.storage.local.set({ saved_manual_events: list }, () => {
          document.getElementById('modal-course-detail').classList.remove('open');
          renderTKB();
        });
      });
    } else {
      chrome.storage.local.get(['hidden_tkb_events'], (res) => {
        const hidden = res.hidden_tkb_events || [];
        if (!hidden.includes(uniqueKey)) hidden.push(uniqueKey);
        chrome.storage.local.set({ hidden_tkb_events: hidden }, () => {
          document.getElementById('modal-course-detail').classList.remove('open');
          renderTKB();
        });
      });
    }
  });

  document.getElementById('btn-prev-week').addEventListener('click', () => {
    currentMonday.setDate(currentMonday.getDate() - 7);
    renderTKB();
  });

  document.getElementById('btn-today-week').addEventListener('click', () => {
    currentMonday = getMonday(new Date());
    renderTKB();
  });

  document.getElementById('btn-next-week').addEventListener('click', () => {
    currentMonday.setDate(currentMonday.getDate() + 7);
    renderTKB();
  });

  document.getElementById('btn-reset-hidden').addEventListener('click', () => {
    chrome.storage.local.set({ hidden_tkb_events: [] }, () => {
      renderTKB();
    });
  });

  // Manual Event Modal
  const modalAddCourse = document.getElementById('modal-add-course');
  document.getElementById('btn-add-course-modal').addEventListener('click', () => {
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('manual-start-date').value = todayStr;
    document.getElementById('manual-end-date').value = todayStr;
    modalAddCourse.classList.add('open');
  });

  const closeAddModal = () => modalAddCourse.classList.remove('open');
  document.getElementById('btn-close-add-modal').addEventListener('click', closeAddModal);
  document.getElementById('btn-cancel-manual').addEventListener('click', closeAddModal);

  document.getElementById('btn-save-manual').addEventListener('click', () => {
    const title = document.getElementById('manual-title').value.trim();
    const room = document.getElementById('manual-room').value.trim() || 'Tự chọn';
    const teacher = document.getElementById('manual-teacher').value.trim();
    const dayVal = parseInt(document.getElementById('manual-day').value, 10);
    const startTiet = parseInt(document.getElementById('manual-start-tiet').value, 10);
    const endTiet = parseInt(document.getElementById('manual-end-tiet').value, 10);
    const sDate = document.getElementById('manual-start-date').value;
    const eDate = document.getElementById('manual-end-date').value;

    if (!title || !sDate || !eDate || isNaN(startTiet) || isNaN(endTiet) || startTiet > endTiet) {
      alert('Vui lòng điền đầy đủ thông tin và kiểm tra tiết bắt đầu <= tiết kết thúc.');
      return;
    }

    const startDate = new Date(sDate);
    startDate.setHours(0, 0, 0, 0);
    const untilDate = new Date(eDate);
    untilDate.setHours(23, 59, 59, 999);

    const newEvent = {
      id: 'manual_' + Date.now(),
      maLop: 'CÁ NHÂN',
      title,
      room,
      teacher,
      dayOfWeek: dayVal === 8 ? 0 : dayVal - 1,
      startTiet,
      endTiet,
      startDate: startDate.toISOString(),
      endDate: startDate.toISOString(),
      untilDate: untilDate.toISOString(),
      isManual: true
    };

    chrome.storage.local.get(['saved_manual_events'], (res) => {
      const list = res.saved_manual_events || [];
      list.push(newEvent);
      chrome.storage.local.set({ saved_manual_events: list }, () => {
        closeAddModal();
        document.getElementById('manual-title').value = '';
        renderTKB();
      });
    });
  });

  // =========================================================================
  // 3. MODULE 2: BẢNG ĐIỂM & GPA ANALYTICS
  // =========================================================================
  let allGradesCache = [];
  let gradesSummaryCache = null;

  function classifyGPA(gpa) {
    if (gpa === null || isNaN(gpa)) return { text: 'Chưa xếp loại', cls: 'badge-accent' };
    if (gpa >= 9.0) return { text: 'Xuất sắc', cls: 'badge-success' };
    if (gpa >= 8.0) return { text: 'Giỏi', cls: 'badge-success' };
    if (gpa >= 7.0) return { text: 'Khá', cls: 'badge-accent' };
    if (gpa >= 5.0) return { text: 'Trung bình', cls: 'badge-warning' };
    return { text: 'Yếu / Kém', cls: 'badge-danger' };
  }

  function loadGrades() {
    chrome.storage.local.get(['saved_grades', 'saved_grades_summary'], (res) => {
      const rawGrades = res.saved_grades || [];
      allGradesCache = rawGrades.map((g) => ({
        ...g,
        semester: g.semester || g.hocKy || 'Học kỳ',
        maMH: g.maMH || g.maHP || '',
        tenMH: g.tenMH || g.tenHP || '',
        tc: g.tc !== undefined ? String(g.tc) : '',
        qt: g.qt !== undefined ? g.qt : g.diemQT || '',
        th: g.th !== undefined ? g.th : g.diemTH || '',
        gk: g.gk !== undefined ? g.gk : g.diemGK || '',
        ck: g.ck !== undefined ? g.ck : g.diemCK || '',
        hp: g.hp !== undefined ? g.hp : g.diemHP || '',
        ghiChu: g.ghiChu || ''
      }));
      gradesSummaryCache = res.saved_grades_summary || null;

      populateSemesterFilter(allGradesCache);
      updateGradesBentoStats(allGradesCache, gradesSummaryCache);
      renderGradesTable();
    });
  }

  function populateSemesterFilter(grades) {
    const select = document.getElementById('grade-semester-filter');
    const currentVal = select.value;
    const semesters = Array.from(new Set(grades.map((g) => g.semester).filter(Boolean)));

    select.innerHTML = '<option value="all">Tất cả học kỳ</option>';
    semesters.forEach((sem) => {
      const opt = document.createElement('option');
      opt.value = sem;
      opt.textContent = sem;
      select.appendChild(opt);
    });

    if (semesters.includes(currentVal)) {
      select.value = currentVal;
    }
  }

  function updateGradesBentoStats(grades, summary) {
    let computedTcHoc = 0;
    let computedTcTichLuy = 0;
    let totalWeightedAll = 0;
    let totalWeightedPass = 0;
    let passCount = 0;

    // Tính theo môn (lấy điểm cao nhất nếu học lại)
    const bestByCourse = {};
    grades.forEach((g) => {
      const tc = parseFloat(g.tc);
      const hp = parseFloat(g.hp);
      if (!isNaN(tc) && tc > 0) {
        computedTcHoc += tc;
        if (!isNaN(hp)) {
          totalWeightedAll += hp * tc;
          if (!bestByCourse[g.maMH] || hp > bestByCourse[g.maMH].hp) {
            bestByCourse[g.maMH] = { tc, hp };
          }
          if (hp >= 5.0) passCount++;
        } else if ((g.hp || '').toUpperCase() === 'M' || (g.ghiChu || '').toLowerCase().includes('miễn')) {
          computedTcTichLuy += tc;
          passCount++;
        }
      }
    });

    let bestTcSum = 0;
    Object.values(bestByCourse).forEach(({ tc, hp }) => {
      if (hp >= 5.0) {
        computedTcTichLuy += tc;
        bestTcSum += tc;
        totalWeightedPass += hp * tc;
      }
    });

    const gpaTichLuy =
      summary && summary.gpaTichLuy !== null
        ? summary.gpaTichLuy
        : bestTcSum > 0
        ? totalWeightedPass / bestTcSum
        : null;

    const gpaToanKhoa =
      summary && summary.gpaToanKhoa !== null
        ? summary.gpaToanKhoa
        : computedTcHoc > 0
        ? totalWeightedAll / computedTcHoc
        : null;

    const tcTichLuy =
      summary && summary.tcTichLuy !== null ? summary.tcTichLuy : computedTcTichLuy;
    const tcDaHoc =
      summary && summary.tcDaHoc !== null ? summary.tcDaHoc : computedTcHoc;

    document.getElementById('stat-gpa-tichluy').textContent =
      gpaTichLuy !== null ? gpaTichLuy.toFixed(2) : '—';
    document.getElementById('stat-gpa-toankhoa').textContent =
      gpaToanKhoa !== null ? gpaToanKhoa.toFixed(2) : '—';

    const rank = classifyGPA(gpaTichLuy);
    const rankEl = document.getElementById('stat-gpa-rank');
    rankEl.textContent = rank.text;
    rankEl.className = `badge ${rank.cls}`;

    document.getElementById('stat-tc-tichluy').textContent = `${tcTichLuy} TC`;
    document.getElementById('stat-tc-sub').textContent = `Đã học: ${tcDaHoc} TC · Tiến độ ~${Math.min(100, Math.round((tcTichLuy / 132) * 100))}%`;
    document.getElementById('stat-tc-progress').style.width = `${Math.min(100, Math.round((tcTichLuy / 132) * 100))}%`;

    document.getElementById('stat-course-count').textContent = String(grades.length);
    document.getElementById('stat-pass-rate').textContent = `Đạt / Miễn: ${passCount}/${grades.length} môn`;
  }

  function renderGradesTable() {
    const tbody = document.getElementById('grades-body');
    const query = (document.getElementById('grade-search-input').value || '').trim().toLowerCase();
    const semFilter = document.getElementById('grade-semester-filter').value;

    tbody.innerHTML = '';

    const filtered = allGradesCache.filter((item) => {
      if (semFilter !== 'all' && item.semester !== semFilter) return false;
      if (query) {
        return (
          (item.maMH || '').toLowerCase().includes(query) ||
          (item.tenMH || '').toLowerCase().includes(query)
        );
      }
      return true;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="empty-state">
              <span>Chưa có dữ liệu bảng điểm khớp bộ lọc. Hãy nhấn <strong>Đồng Bộ Từ Portal</strong> ở thanh bên trái.</span>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    const semMetaMap = {};
    if (gradesSummaryCache && Array.isArray(gradesSummaryCache.semesters)) {
      gradesSummaryCache.semesters.forEach((s) => {
        semMetaMap[s.name] = s;
      });
    }

    let lastSemester = '';
    filtered.forEach((item) => {
      if (item.semester && item.semester !== lastSemester) {
        lastSemester = item.semester;
        const meta = semMetaMap[lastSemester];

        const semRow = document.createElement('tr');
        semRow.className = 'semester-divider-row';
        semRow.innerHTML = `
          <td colspan="9">
            <div class="semester-header-flex">
              <span>${escapeHtml(lastSemester)}</span>
              ${
                meta
                  ? `<div class="semester-metrics mono">
                      ${meta.tongTC !== null ? `<span>Tổng TC: <strong>${meta.tongTC}</strong></span>` : ''}
                      ${meta.gpaHK !== null ? `<span>GPA HK: <strong style="color:var(--accent);">${Number(meta.gpaHK).toFixed(2)}</strong></span>` : ''}
                    </div>`
                  : ''
              }
            </div>
          </td>
        `;
        tbody.appendChild(semRow);
      }

      const hpVal = parseFloat(item.hp);
      let badgeCls = 'badge-accent';
      if (!isNaN(hpVal)) {
        if (hpVal >= 8.0) badgeCls = 'badge-success';
        else if (hpVal >= 6.5) badgeCls = 'badge-accent';
        else if (hpVal >= 5.0) badgeCls = 'badge-warning';
        else badgeCls = 'badge-danger';
      } else if ((item.hp || '').toUpperCase() === 'M') {
        badgeCls = 'badge-violet';
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="mono" style="font-weight: 700; color: var(--accent);">${escapeHtml(item.maMH)}</td>
        <td style="font-weight: 600;">${escapeHtml(item.tenMH)}</td>
        <td class="mono" style="text-align: center;">${escapeHtml(item.tc || '—')}</td>
        <td class="mono" style="text-align: center;">${escapeHtml(item.qt || '—')}</td>
        <td class="mono" style="text-align: center;">${escapeHtml(item.th || '—')}</td>
        <td class="mono" style="text-align: center;">${escapeHtml(item.gk || '—')}</td>
        <td class="mono" style="text-align: center;">${escapeHtml(item.ck || '—')}</td>
        <td class="mono" style="text-align: center;" title="${escapeHtml(item.weightNote || '')}">
          ${item.hp ? `<span class="badge ${badgeCls} mono">${escapeHtml(item.hp)}</span>` : '—'}
        </td>
        <td style="color: var(--text-secondary); font-size: 12px;">${escapeHtml(item.ghiChu || '')}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  document.getElementById('grade-search-input').addEventListener('input', renderGradesTable);
  document.getElementById('grade-semester-filter').addEventListener('change', renderGradesTable);

  // =========================================================================
  // 4. MODULE 3: LỊCH THI HỌC KỲ (portal.uit.edu.vn/sinh-vien/lich-thi)
  // =========================================================================
  document.getElementById('btn-fetch-exams').addEventListener('click', () => {
    const hocky = document.getElementById('exam-hocky').value;
    const namhoc = document.getElementById('exam-namhoc').value;
    const url = `https://portal.uit.edu.vn/sinh-vien/lich-thi?hocky=${hocky}&namhoc=${namhoc}&source=auto_check_exam`;
    chrome.tabs.create({ url, active: true });
  });

  function computeExamCountdown(dateStr) {
    const m = (dateStr || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return { text: 'Chưa rõ ngày', cls: 'badge-warning' };
    const examDate = new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((examDate - today) / 86400000);
    if (diffDays === 0) return { text: 'Hôm nay!', cls: 'badge-danger' };
    if (diffDays > 0 && diffDays <= 7) return { text: `Còn ${diffDays} ngày`, cls: 'badge-warning' };
    if (diffDays > 7) return { text: `Còn ${diffDays} ngày`, cls: 'badge-success' };
    return { text: 'Đã qua', cls: 'badge-accent' };
  }

  function loadExams() {
    chrome.storage.local.get(['saved_exam_schedule'], (res) => {
      const tbody = document.getElementById('exams-body');
      const exams = res.saved_exam_schedule || [];
      tbody.innerHTML = '';

      if (exams.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="8">
              <div class="empty-state">
                <span>Chưa có dữ liệu lịch thi. Nhấn <strong>Tải Lịch Thi Từ Portal</strong> hoặc <strong>Thêm Lịch Thi</strong> để bổ sung.</span>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      exams.forEach((ex, idx) => {
        const cd = computeExamCountdown(ex.ngayThi);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="mono" style="text-align: center; color: var(--text-muted);">${idx + 1}</td>
          <td class="mono" style="font-weight: 700; color: var(--accent);">${escapeHtml(ex.maLop)}</td>
          <td style="font-weight: 600;">${escapeHtml(ex.tenMH || ex.maLop)}</td>
          <td class="mono" style="font-weight: 600;">${escapeHtml(ex.ngayThi)}</td>
          <td class="mono">${escapeHtml(ex.caThi)}</td>
          <td class="mono"><span class="badge badge-accent mono">${escapeHtml(ex.phongThi)}</span></td>
          <td><span class="badge ${cd.cls} mono">${cd.text}</span></td>
          <td style="text-align: center;">
            <button class="btn btn-sm btn-danger btn-del-exam" data-idx="${idx}" title="Xóa dòng này">×</button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      tbody.querySelectorAll('.btn-del-exam').forEach((btn) => {
        btn.addEventListener('click', () => {
          const i = parseInt(btn.getAttribute('data-idx'), 10);
          exams.splice(i, 1);
          chrome.storage.local.set({ saved_exam_schedule: exams }, loadExams);
        });
      });
    });
  }

  const modalAddExam = document.getElementById('modal-add-exam');
  document.getElementById('btn-add-exam-modal').addEventListener('click', () => {
    modalAddExam.classList.add('open');
  });
  document.getElementById('btn-close-exam-modal').addEventListener('click', () => {
    modalAddExam.classList.remove('open');
  });
  document.getElementById('btn-save-exam-manual').addEventListener('click', () => {
    const maLop = document.getElementById('exam-input-malop').value.trim().toUpperCase();
    const tenMH = document.getElementById('exam-input-tenmh').value.trim();
    const ngayThi = document.getElementById('exam-input-ngay').value.trim();
    const caThi = document.getElementById('exam-input-ca').value.trim() || '—';
    const phongThi = document.getElementById('exam-input-phong').value.trim() || '—';

    if (!maLop || !ngayThi) {
      alert('Vui lòng nhập Mã lớp và Ngày thi (DD/MM/YYYY).');
      return;
    }

    chrome.storage.local.get(['saved_exam_schedule'], (res) => {
      const exams = res.saved_exam_schedule || [];
      exams.push({
        stt: exams.length + 1,
        maLop,
        tenMH: tenMH || maLop,
        ngayThi,
        caThi,
        phongThi
      });
      chrome.storage.local.set({ saved_exam_schedule: exams }, () => {
        modalAddExam.classList.remove('open');
        loadExams();
      });
    });
  });

  // =========================================================================
  // 5. MODULE 4: XẾP LỚP HỌC (XLSX SCHEDULER)
  // =========================================================================
  let allCoursesDB = {};
  let selectedClasses = [];

  document.getElementById('btn-trigger-xlsx').addEventListener('click', () => {
    document.getElementById('input-xlsx').click();
  });

  chrome.storage.local.get(['cached_courses_db', 'saved_schedules'], (res) => {
    if (res.cached_courses_db && Object.keys(res.cached_courses_db).length > 0) {
      allCoursesDB = res.cached_courses_db;
      renderCourseList(document.getElementById('search-course').value);
    }
    if (res.saved_schedules) {
      updateSavedSchedulesDropdown(res.saved_schedules);
    }
  });

  document.getElementById('input-xlsx').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        let combinedRows = [];
        workbook.SheetNames.forEach((sheetName) => {
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
          combinedRows = combinedRows.concat(rows);
        });
        processExcelRows(combinedRows);
      } catch (err) {
        console.error(err);
        alert('Không thể đọc file Excel. Vui lòng kiểm tra định dạng .xlsx.');
      }
    };
    reader.readAsArrayBuffer(file);
  });

  function processExcelRows(rows) {
    let colMap = { maMH: 1, maLop: 2, tenMH: 3, thu: 9, tiet: 10, phong: 11, gv: 6 };
    const newDB = {};

    for (let i = 0; i < Math.min(25, rows.length); i++) {
      const r = rows[i];
      if (!r || !Array.isArray(r)) continue;
      const str = r.join(' ').toUpperCase();
      if (str.includes('MÃ MH') && str.includes('MÃ LỚP')) {
        r.forEach((cell, idx) => {
          if (!cell) return;
          const c = String(cell).toUpperCase().replace(/\s+/g, ' ').trim();
          if (c.includes('MÃ MH') || c.includes('MÃ MÔN HỌC')) colMap.maMH = idx;
          else if (c.includes('MÃ LỚP')) colMap.maLop = idx;
          else if (c.includes('TÊN MÔN HỌC') || c.includes('TÊN MH')) colMap.tenMH = idx;
          else if (c === 'THỨ') colMap.thu = idx;
          else if (c === 'TIẾT') colMap.tiet = idx;
          else if (c.includes('PHÒNG')) colMap.phong = idx;
          else if (c.includes('GIẢNG VIÊN') || c.includes('TÊN GV')) colMap.gv = idx;
        });
        break;
      }
    }

    rows.forEach((r) => {
      if (!r || !Array.isArray(r) || r.length < 5) return;
      const rawMaMH = String(r[colMap.maMH] || '').trim();
      const rawMaLop = String(r[colMap.maLop] || '').trim();
      const rawTenMH = String(r[colMap.tenMH] || '').trim();
      if (!rawMaMH || !rawMaLop || rawMaMH.toUpperCase().includes('MÃ MH')) return;

      const maMHLines = rawMaMH.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const maLopLines = rawMaLop.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const tenMHLines = rawTenMH.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const thuLines = String(r[colMap.thu] || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const tietLines = String(r[colMap.tiet] || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const phongLines = String(r[colMap.phong] || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
      const gvLines = String(r[colMap.gv] || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);

      for (let k = 0; k < maLopLines.length; k++) {
        const maLop = maLopLines[k];
        const maMH = maMHLines[k] || maMHLines[0];
        const tenMH = tenMHLines[k] || tenMHLines[0] || maMH;
        const thuRaw = thuLines[k] !== undefined ? thuLines[k] : thuLines[0] || '';
        const tietStr = tietLines[k] !== undefined ? tietLines[k] : tietLines[0] || '';
        const phong = phongLines[k] !== undefined ? phongLines[k] : phongLines[0] || '';
        const gv = gvLines[k] !== undefined ? gvLines[k] : gvLines[0] || '';

        let thu = parseInt(thuRaw, 10);
        if (String(thuRaw).toUpperCase().includes('CN') || thuRaw === '8') thu = 8;

        let startTiet = null;
        let endTiet = null;

        if (tietStr && tietStr !== '*' && !isNaN(thu)) {
          const digits = tietStr.replace(/[^0-9]/g, '').split('');
          const tiets = digits.map((d) => (d === '0' ? 10 : parseInt(d, 10)));
          if (tiets.length > 0) {
            startTiet = Math.min(...tiets);
            endTiet = Math.max(...tiets);
          }
        }

        if (!newDB[maMH]) {
          newDB[maMH] = { tenMH, classes: [] };
        }
        newDB[maMH].classes.push({
          maMH,
          tenMH,
          maLop,
          thu: isNaN(thu) ? null : thu,
          startTiet,
          endTiet,
          phong: phong || 'Online',
          gv: gv || 'Chưa cập nhật'
        });
      }
    });

    allCoursesDB = newDB;
    chrome.storage.local.set({ cached_courses_db: allCoursesDB }, () => {
      renderCourseList(document.getElementById('search-course').value);
    });
  }

  function checkSchedulerConflict(cls) {
    if (!cls.thu || !cls.startTiet) return null;
    for (const sel of selectedClasses) {
      if (sel.maLop === cls.maLop) continue;
      if (sel.thu === cls.thu && sel.startTiet && sel.endTiet) {
        if (Math.max(cls.startTiet, sel.startTiet) <= Math.min(cls.endTiet, sel.endTiet)) {
          return sel.maLop;
        }
      }
    }
    return null;
  }

  function renderCourseList(filterText = '') {
    const container = document.getElementById('course-list');
    container.innerHTML = '';
    const q = (filterText || '').trim().toLowerCase();

    const keys = Object.keys(allCoursesDB).filter((maMH) => {
      if (!q) return true;
      const c = allCoursesDB[maMH];
      return maMH.toLowerCase().includes(q) || (c.tenMH || '').toLowerCase().includes(q);
    });

    if (keys.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding:24px 10px;"><span>Không tìm thấy môn học phù hợp.</span></div>`;
      return;
    }

    keys.forEach((maMH) => {
      const course = allCoursesDB[maMH];
      const hasSelected = selectedClasses.some((s) => s.maMH === maMH);

      const groupedByMaLop = {};
      course.classes.forEach((c) => {
        if (!groupedByMaLop[c.maLop]) groupedByMaLop[c.maLop] = [];
        groupedByMaLop[c.maLop].push(c);
      });

      const card = document.createElement('div');
      card.className = `subject-group-card${hasSelected || keys.length <= 5 ? ' expanded' : ''}`;

      const header = document.createElement('div');
      header.className = 'subject-group-header';
      header.innerHTML = `
        <span style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          <strong class="mono" style="color:var(--accent);">${escapeHtml(maMH)}</strong> — ${escapeHtml(course.tenMH)}
        </span>
        <span class="badge ${hasSelected ? 'badge-success' : 'badge-accent'} mono">${Object.keys(groupedByMaLop).length}</span>
      `;
      header.addEventListener('click', () => card.classList.toggle('expanded'));

      const listEl = document.createElement('div');
      listEl.className = 'subject-class-list';

      Object.keys(groupedByMaLop).forEach((maLop) => {
        const sessions = groupedByMaLop[maLop];
        const isSelected = selectedClasses.some((s) => s.maLop === maLop);

        let conflictWith = null;
        if (!isSelected) {
          for (const s of sessions) {
            const c = checkSchedulerConflict(s);
            if (c) {
              conflictWith = c;
              break;
            }
          }
        }

        const timeDesc = sessions
          .map((s) =>
            s.thu && s.startTiet
              ? `${s.thu === 8 ? 'CN' : 'T' + s.thu} (Tiết ${s.startTiet}–${s.endTiet}, P.${s.phong})`
              : 'HT2 / Không xếp TKB'
          )
          .join(' + ');

        const item = document.createElement('label');
        item.className = `class-option-item${isSelected ? ' selected' : ''}${conflictWith ? ' conflict' : ''}`;
        item.innerHTML = `
          <input type="checkbox" ${isSelected ? 'checked' : ''} style="margin-top:3px; accent-color:var(--accent);">
          <div style="flex:1; min-width:0;">
            <div style="display:flex; justify-content:space-between; gap:6px;">
              <strong class="mono" style="font-size:12.5px;">${escapeHtml(maLop)}</strong>
              ${conflictWith ? `<span class="badge badge-danger mono">Trùng ${escapeHtml(conflictWith)}</span>` : ''}
            </div>
            <div class="mono" style="font-size:11px; color:var(--text-secondary); margin-top:2px;">${escapeHtml(timeDesc)}</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:1px;">GV: ${escapeHtml(sessions[0].gv)}</div>
          </div>
        `;

        const checkbox = item.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
          toggleScheduleClass(maMH, maLop, e.target.checked);
        });

        listEl.appendChild(item);
      });

      card.appendChild(header);
      card.appendChild(listEl);
      container.appendChild(card);
    });
  }

  function toggleScheduleClass(maMH, maLop, checked) {
    const course = allCoursesDB[maMH];
    if (!course) return;

    const isPractice = /\.\d+$/.test(maLop);
    const baseTheoryCode = isPractice ? maLop.replace(/\.\d+$/, '') : maLop;

    if (checked) {
      // Bỏ các lớp khác của cùng môn học trước khi chọn lớp mới
      selectedClasses = selectedClasses.filter((s) => s.maMH !== maMH);

      const targetSessions = course.classes.filter((c) => c.maLop === maLop);
      selectedClasses.push(...targetSessions);

      // Nếu chọn lớp Thực hành (VD: IT001.Q31.1), tự động chọn luôn lớp Lý thuyết gốc (IT001.Q31)
      if (isPractice) {
        const theorySessions = course.classes.filter((c) => c.maLop === baseTheoryCode);
        selectedClasses.push(...theorySessions);
      }
    } else {
      if (!isPractice) {
        // Bỏ lớp Lý thuyết thì bỏ luôn lớp Thực hành đi kèm
        selectedClasses = selectedClasses.filter(
          (s) => s.maLop !== maLop && !s.maLop.startsWith(maLop + '.')
        );
      } else {
        selectedClasses = selectedClasses.filter((s) => s.maLop !== maLop);
      }
    }

    renderSchedulerPreview();
    renderCourseList(document.getElementById('search-course').value);
  }

  function renderSchedulerPreview() {
    const grid = document.getElementById('scheduler-grid');
    grid.querySelectorAll('.course-block').forEach((el) => el.remove());

    const uniqueCodes = Array.from(new Set(selectedClasses.map((s) => s.maLop)));
    document.getElementById('scheduler-selected-count').textContent = String(uniqueCodes.length);

    const chipsContainer = document.getElementById('scheduler-chips');
    if (uniqueCodes.length === 0) {
      chipsContainer.innerHTML = `<span style="font-size: 12px; color: var(--text-muted);">Chưa chọn lớp nào</span>`;
    } else {
      chipsContainer.innerHTML = '';
      uniqueCodes.forEach((code) => {
        const sample = selectedClasses.find((s) => s.maLop === code);
        const chip = document.createElement('span');
        chip.className = 'class-chip mono';
        chip.innerHTML = `
          <span>${escapeHtml(code)}</span>
          <button type="button" title="Bỏ lớp này">×</button>
        `;
        chip.querySelector('button').addEventListener('click', () => {
          if (sample) toggleScheduleClass(sample.maMH, code, false);
        });
        chipsContainer.appendChild(chip);
      });
    }

    selectedClasses.forEach((cls) => {
      if (!cls.thu || !cls.startTiet || !cls.endTiet) return;
      const col = cls.thu === 8 ? 8 : cls.thu;
      if (col < 2 || col > 8) return;

      const rowStart = cls.startTiet + 1;
      const rowSpan = cls.endTiet - cls.startTiet + 1;

      const block = document.createElement('div');
      block.className = 'course-block';
      block.style.gridColumn = String(col);
      block.style.gridRow = `${rowStart} / span ${rowSpan}`;
      block.innerHTML = `
        <div>
          <div class="course-code-tag mono"><span>${escapeHtml(cls.maLop)}</span></div>
          <div class="course-name">${escapeHtml(cls.tenMH)}</div>
        </div>
        <div class="course-meta">
          <span class="course-room-pill mono">${escapeHtml(cls.phong)}</span>
          <span class="mono">T${cls.startTiet}–${cls.endTiet}</span>
        </div>
      `;
      block.title = 'Nhấn để bỏ chọn lớp này';
      block.addEventListener('click', () => {
        toggleScheduleClass(cls.maMH, cls.maLop, false);
      });

      grid.appendChild(block);
    });
  }

  document.getElementById('search-course').addEventListener('input', (e) => {
    renderCourseList(e.target.value);
  });

  document.getElementById('btn-clear-scheduler').addEventListener('click', () => {
    selectedClasses = [];
    renderSchedulerPreview();
    renderCourseList(document.getElementById('search-course').value);
  });

  // Save / Load / Delete Scheduler Plans
  function updateSavedSchedulesDropdown(schedulesMap) {
    const sel = document.getElementById('saved-schedules-select');
    const current = sel.value;
    sel.innerHTML = '<option value="">— Chọn phương án đã lưu —</option>';
    Object.keys(schedulesMap || {}).forEach((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    });
    if (schedulesMap && schedulesMap[current]) sel.value = current;
  }

  document.getElementById('btn-save-schedule').addEventListener('click', () => {
    if (selectedClasses.length === 0) {
      alert('Hãy chọn ít nhất 1 lớp trước khi lưu phương án.');
      return;
    }
    const name = prompt('Nhập tên phương án xếp lớp (VD: Phương án 1 - Học sáng):');
    if (!name || !name.trim()) return;

    chrome.storage.local.get(['saved_schedules'], (res) => {
      const schedules = res.saved_schedules || {};
      schedules[name.trim()] = selectedClasses;
      chrome.storage.local.set({ saved_schedules: schedules }, () => {
        updateSavedSchedulesDropdown(schedules);
        document.getElementById('saved-schedules-select').value = name.trim();
      });
    });
  });

  document.getElementById('saved-schedules-select').addEventListener('change', (e) => {
    const name = e.target.value;
    if (!name) return;
    chrome.storage.local.get(['saved_schedules'], (res) => {
      const schedules = res.saved_schedules || {};
      if (schedules[name]) {
        selectedClasses = [...schedules[name]];
        renderSchedulerPreview();
        renderCourseList(document.getElementById('search-course').value);
      }
    });
  });

  document.getElementById('btn-delete-schedule').addEventListener('click', () => {
    const sel = document.getElementById('saved-schedules-select');
    const name = sel.value;
    if (!name) return;
    chrome.storage.local.get(['saved_schedules'], (res) => {
      const schedules = res.saved_schedules || {};
      delete schedules[name];
      chrome.storage.local.set({ saved_schedules: schedules }, () => {
        updateSavedSchedulesDropdown(schedules);
      });
    });
  });

  // Custom Class Creation in Scheduler
  const modalCustomSched = document.getElementById('modal-custom-scheduler');
  document.getElementById('btn-create-custom-course').addEventListener('click', () => {
    modalCustomSched.classList.add('open');
  });
  document.getElementById('btn-close-custom-sched').addEventListener('click', () => {
    modalCustomSched.classList.remove('open');
  });
  document.getElementById('btn-save-custom-sched').addEventListener('click', () => {
    const maMH = document.getElementById('cs-mamh').value.trim().toUpperCase();
    const maLop = document.getElementById('cs-malop').value.trim().toUpperCase();
    const tenMH = document.getElementById('cs-tenmh').value.trim() || maMH;
    const thuRaw = document.getElementById('cs-thu').value;
    const tietStr = document.getElementById('cs-tiet').value.trim();
    const phong = document.getElementById('cs-phong').value.trim() || 'Online';
    const gv = document.getElementById('cs-gv').value.trim() || 'Tự tạo';

    if (!maMH || !maLop || !tietStr) {
      alert('Vui lòng nhập Mã môn, Mã lớp và Chuỗi tiết (VD: 123).');
      return;
    }

    const thu = thuRaw === 'CN' ? 8 : parseInt(thuRaw, 10);
    const digits = tietStr.replace(/[^0-9]/g, '').split('');
    const tiets = digits.map((d) => (d === '0' ? 10 : parseInt(d, 10)));
    const startTiet = Math.min(...tiets);
    const endTiet = Math.max(...tiets);

    if (!allCoursesDB[maMH]) allCoursesDB[maMH] = { tenMH, classes: [] };
    allCoursesDB[maMH].classes.push({
      maMH,
      tenMH,
      maLop,
      thu,
      startTiet,
      endTiet,
      phong,
      gv
    });

    chrome.storage.local.set({ cached_courses_db: allCoursesDB }, () => {
      modalCustomSched.classList.remove('open');
      toggleScheduleClass(maMH, maLop, true);
    });
  });

  // 1-Click Send Selected Classes to Auto ĐKHP Tab
  function transferSelectedClassesToDkhp(switchTabAfter = true) {
    const uniqueCodes = Array.from(new Set(selectedClasses.map((s) => s.maLop)));
    if (uniqueCodes.length === 0) {
      alert('Bạn chưa chọn lớp nào trong phần Xếp Lớp Học.');
      return;
    }
    const dkhpInput = document.getElementById('dkhp-courses-input');
    dkhpInput.value = uniqueCodes.join('\n');
    updateDkhpParsedChips();
    if (switchTabAfter) switchToTab('tab-dkhp');
  }

  document.getElementById('btn-send-to-dkhp').addEventListener('click', () => {
    transferSelectedClassesToDkhp(true);
  });

  document.getElementById('btn-import-from-scheduler').addEventListener('click', () => {
    transferSelectedClassesToDkhp(false);
  });

  // =========================================================================
  // 6. MODULE 5: HẸN GIỜ ĐĂNG KÝ HỌC PHẦN TỰ ĐỘNG (AUTO ĐKHP)
  // =========================================================================
  let dkhpInterval = null;
  const dkhpInput = document.getElementById('dkhp-courses-input');
  const dkhpDatetime = document.getElementById('dkhp-datetime');
  const btnSaveDkhp = document.getElementById('btn-save-dkhp');
  const btnCancelDkhp = document.getElementById('btn-cancel-dkhp');
  const dkhpBadge = document.getElementById('dkhp-status-badge');
  const dkhpClock = document.getElementById('dkhp-countdown');
  const dkhpDesc = document.getElementById('dkhp-status-desc');

  function parseDkhpCodes(raw) {
    return Array.from(
      new Set(
        (raw || '')
          .split(/[\n,;]+/)
          .map((s) => s.trim().toUpperCase())
          .filter(Boolean)
      )
    );
  }

  function updateDkhpParsedChips() {
    const codes = parseDkhpCodes(dkhpInput.value);
    document.getElementById('dkhp-parsed-count').textContent = String(codes.length);
    const container = document.getElementById('dkhp-parsed-chips');
    if (codes.length === 0) {
      container.innerHTML = `<span style="font-size: 12px; color: var(--text-muted);">Chưa có mã lớp nào</span>`;
      return;
    }
    container.innerHTML = codes
      .map((c) => `<span class="badge badge-accent mono">${escapeHtml(c)}</span>`)
      .join('');
  }

  dkhpInput.addEventListener('input', updateDkhpParsedChips);

  function loadDkhpSchedule() {
    chrome.storage.local.get(['dkhp_schedule'], (res) => {
      const sched = res.dkhp_schedule;
      if (!sched) return;
      if (sched.courses) {
        dkhpInput.value = sched.courses.join('\n');
        updateDkhpParsedChips();
      }
      if (sched.datetime) {
        dkhpDatetime.value = sched.datetime;
      }
      if (sched.active) {
        startDkhpCountdownUI(sched.datetime, sched.courses.length);
      } else {
        stopDkhpCountdownUI();
      }
    });
  }

  function startDkhpCountdownUI(datetimeStr, count) {
    if (dkhpInterval) clearInterval(dkhpInterval);
    btnCancelDkhp.style.display = 'inline-flex';
    dkhpBadge.textContent = `Đang hẹn giờ (${count} mã lớp)`;
    dkhpBadge.className = 'badge badge-success';
    dkhpDesc.textContent = `Kích hoạt lúc: ${new Date(datetimeStr).toLocaleString('vi-VN')}`;

    const tick = () => {
      const diff = new Date(datetimeStr).getTime() - Date.now();
      if (diff <= 0) {
        clearInterval(dkhpInterval);
        dkhpClock.textContent = '00:00:00';
        dkhpBadge.textContent = 'Đang mở cổng ĐKHP...';
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      dkhpClock.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };

    tick();
    dkhpInterval = setInterval(tick, 1000);
  }

  function stopDkhpCountdownUI() {
    if (dkhpInterval) clearInterval(dkhpInterval);
    btnCancelDkhp.style.display = 'none';
    dkhpBadge.textContent = 'Đang tắt hẹn giờ';
    dkhpBadge.className = 'badge badge-warning';
    dkhpClock.textContent = '00:00:00';
    dkhpDesc.textContent = 'Hãy nhập danh sách mã lớp và thời gian mở cổng rồi nhấn Bật Hẹn Giờ.';
  }

  btnSaveDkhp.addEventListener('click', () => {
    const courses = parseDkhpCodes(dkhpInput.value);
    const dt = dkhpDatetime.value;

    if (courses.length === 0) {
      alert('Vui lòng nhập ít nhất 1 mã lớp học phần.');
      return;
    }
    if (!dt || new Date(dt).getTime() <= Date.now()) {
      alert('Thời điểm hẹn giờ phải lớn hơn thời gian hiện tại.');
      return;
    }

    const scheduleObj = { courses, datetime: dt, active: true };
    chrome.storage.local.set({ dkhp_schedule: scheduleObj }, () => {
      chrome.runtime.sendMessage({ action: 'scheduleDkhpAlarm', datetime: dt }, () => {
        startDkhpCountdownUI(dt, courses.length);
      });
    });
  });

  btnCancelDkhp.addEventListener('click', () => {
    chrome.storage.local.get(['dkhp_schedule'], (res) => {
      const sched = res.dkhp_schedule || {};
      sched.active = false;
      chrome.storage.local.set({ dkhp_schedule: sched }, () => {
        chrome.runtime.sendMessage({ action: 'cancelDkhpAlarm' }, () => {
          stopDkhpCountdownUI();
        });
      });
    });
  });

  // =========================================================================
  // 7. MODULE 6: TỰ ĐỘNG KHẢO SÁT GIẢNG DẠY (AUTO SURVEY)
  // =========================================================================
  chrome.storage.local.get(['survey_settings'], (res) => {
    if (res.survey_settings) {
      const s = res.survey_settings;
      const radio = document.querySelector(`input[name="survey-rate"][value="${s.rateIndex}"]`);
      if (radio) radio.checked = true;
      if (s.text1 !== undefined) document.getElementById('survey-text-1').value = s.text1;
      if (s.text2 !== undefined) document.getElementById('survey-text-2').value = s.text2;
    }
  });

  function saveSurveyConfig(callback) {
    const rateEl = document.querySelector('input[name="survey-rate"]:checked');
    const rateIndex = rateEl ? rateEl.value : '3';
    const text1 = document.getElementById('survey-text-1').value;
    const text2 = document.getElementById('survey-text-2').value;

    chrome.storage.local.set({ survey_settings: { rateIndex, text1, text2 } }, () => {
      const msg = document.getElementById('survey-save-msg');
      msg.style.display = 'inline';
      setTimeout(() => (msg.style.display = 'none'), 2500);
      if (callback) callback();
    });
  }

  document.getElementById('btn-save-survey').addEventListener('click', () => {
    saveSurveyConfig();
  });

  document.getElementById('btn-start-survey').addEventListener('click', () => {
    saveSurveyConfig(() => {
      chrome.tabs.create({
        url: 'https://portal.uit.edu.vn/sinh-vien/khao-sat-giang-day?source=auto_survey',
        active: true
      });
    });
  });

  // =========================================================================
  // 8. UTILITIES & INITIAL BOOTSTRAP
  // =========================================================================
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  initGridBackground('tkb-grid');
  initGridBackground('scheduler-grid');
  refreshSidebarStatus();
  renderTKB();
  loadGrades();
  loadExams();
  loadDkhpSchedule();
});

