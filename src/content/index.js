/**
 * UIT One For All — Content Script for UIT Web Portals
 * Supports: portal.uit.edu.vn, sso.uit.edu.vn, courses.uit.edu.vn,
 *           dkhp.uit.edu.vn, daa.uit.edu.vn, oep.uit.edu.vn, survey.uit.edu.vn
 */
(async function () {
  'use strict';

  // Tránh khởi tạo trùng lặp nếu script được tiêm lại
  if (window.__uitContentScriptInitialized) {
    if (typeof window.__uitTriggerPortalScrape === 'function') {
      window.__uitTriggerPortalScrape();
    }
    return;
  }
  window.__uitContentScriptInitialized = true;

  const urlParams = new URLSearchParams(window.location.search);
  const isAutoCheckGrade = urlParams.get('source') === 'auto_check_grade';
  const isAutoCheckTKB = urlParams.get('source') === 'auto_check_tkb';
  const isAutoCheckExam = urlParams.get('source') === 'auto_check_exam';
  const isAutoSurvey = urlParams.get('source') === 'auto_survey';
  const isAutoDkhp = urlParams.get('source') === 'auto_dkhp';

  const host = window.location.hostname;
  const path = window.location.pathname;

  function setNativeValue(element, value) {
    if (!element) return;
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (valueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Radix UI Tabs (@radix-ui/react-tabs) trên portal.uit.edu.vn lắng nghe sự kiện
   * pointerdown / mousedown (button === 0) thay vì click thông thường.
   */
  function simulateRadixClick(el) {
    if (!el) return;
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
      isPrimary: true
    };
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', opts));
    } catch (_) {}
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    if (typeof el.focus === 'function') el.focus();
    try {
      el.dispatchEvent(new PointerEvent('pointerup', opts));
    } catch (_) {}
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.dispatchEvent(new MouseEvent('click', opts));
  }

  /**
   * Nối các text node con bằng khoảng trắng để các thẻ <div>/<span> liền kề
   * không bị dính chữ vào nhau (VD: "B3.02" + "Cách tuần" + "28/09/2026").
   */
  function extractSpacedText(rootEl) {
    if (!rootEl) return '';
    const parts = [];
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
    let node;
    while ((node = walker.nextNode())) {
      const t = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
      if (t) parts.push(t);
    }
    return parts.join(' ');
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  const acc = await UITCrypto.getDecryptedAccount();

  // =========================================================================
  // 1. AUTO-LOGIN ACROSS UIT SYSTEMS
  // =========================================================================
  if (acc && acc.username && acc.password) {
    if (host.includes('sso.uit.edu.vn')) {
      runKeycloakLogin(acc);
    } else if (host.includes('portal.uit.edu.vn')) {
      if (path.includes('/login') || path.includes('/web/login') || path === '/') {
        runPortalLocalLogin(acc);
      }
    } else if (host.includes('courses.uit.edu.vn')) {
      runMoodleLogin(acc);
    } else if (host.includes('daa.uit.edu.vn') || host.includes('oep.uit.edu.vn')) {
      runDrupalLogin(acc);
    }
  }

  function runKeycloakLogin(account) {
    const hasError = document.querySelector('.alert-error, #input-error, .pf-m-danger');
    if (hasError) return;

    const lastAttempt = Number(sessionStorage.getItem('uit_kc_login_ts') || 0);
    if (Date.now() - lastAttempt < 4000) return;

    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      const userInput = document.querySelector('#username, input[name="username"]');
      const passInput = document.querySelector('#password, input[name="password"]');
      const rememberCheck = document.querySelector('#rememberMe, input[name="rememberMe"]');
      const loginBtn = document.querySelector(
        '#kc-login, button[name="login"], input[name="login"], button[type="submit"]'
      );

      if (userInput && passInput && loginBtn) {
        clearInterval(timer);
        sessionStorage.setItem('uit_kc_login_ts', String(Date.now()));
        setNativeValue(userInput, account.username);
        setNativeValue(passInput, account.password);
        if (rememberCheck && !rememberCheck.checked) {
          rememberCheck.click();
        }
        setTimeout(() => loginBtn.click(), 120);
      } else if (attempts > 25) {
        clearInterval(timer);
      }
    }, 250);
  }

  function runPortalLocalLogin(account) {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;

      if (
        document.querySelector('a[href*="/sinh-vien/"]') ||
        document.querySelector('aside nav')
      ) {
        clearInterval(timer);
        return;
      }

      const ssoDirectLink = document.querySelector(
        'a[href*="/api/auth/login"], a[href*="sso.uit.edu.vn"]'
      );
      if (ssoDirectLink) {
        clearInterval(timer);
        ssoDirectLink.click();
        return;
      }

      const candidates = Array.from(document.querySelectorAll('button, a'));
      const ssoBtn = candidates.find((el) => {
        const text = (el.textContent || '').trim().toLowerCase();
        return (
          text.includes('uit sso') ||
          text.includes('đăng nhập với uit sso') ||
          text.includes('đăng nhập bằng sso') ||
          text.includes('single sign')
        );
      });
      if (ssoBtn) {
        clearInterval(timer);
        ssoBtn.click();
        return;
      }

      const userInput = document.querySelector(
        'input[name="login"], input[name="username"], #login, #username'
      );
      const passInput = document.querySelector(
        'input[name="password"], input[type="password"], #password'
      );
      if (userInput && passInput) {
        clearInterval(timer);
        setNativeValue(userInput, account.username);
        setNativeValue(passInput, account.password);
        const submitBtn =
          document.querySelector('button[type="submit"], input[type="submit"]') ||
          Array.from(document.querySelectorAll('button')).find((b) =>
            (b.textContent || '').toLowerCase().includes('đăng nhập')
          );
        if (submitBtn) setTimeout(() => submitBtn.click(), 150);
      } else if (attempts > 30) {
        clearInterval(timer);
      }
    }, 300);
  }

  function runMoodleLogin(account) {
    if (path.includes('/login')) {
      const errorBox = document.querySelector('#loginerrormessage, .alert-danger');
      if (errorBox && errorBox.textContent.trim()) return;

      const lastAttempt = Number(sessionStorage.getItem('uit_moodle_sso_ts') || 0);
      if (Date.now() - lastAttempt < 4000) return;

      const ssoLink =
        document.querySelector('.login-identityproviders a[href*="auth/oauth2/login.php"]') ||
        document.querySelector('.login-identityprovider a') ||
        Array.from(document.querySelectorAll('#region-main a, .loginform a')).find((a) =>
          (a.textContent || '').trim().toUpperCase().includes('UIT SSO')
        );

      if (ssoLink) {
        sessionStorage.setItem('uit_moodle_sso_ts', String(Date.now()));
        ssoLink.click();
        return;
      }

      const userInput = document.querySelector('#username');
      const passInput = document.querySelector('#password');
      const loginBtn = document.querySelector('#loginbtn');
      if (userInput && passInput && loginBtn) {
        sessionStorage.setItem('uit_moodle_sso_ts', String(Date.now()));
        setNativeValue(userInput, account.username);
        setNativeValue(passInput, account.password);
        loginBtn.click();
      }
    }
  }

  function runDrupalLogin(account) {
    const userInput = document.querySelector('#edit-name');
    const passInput = document.querySelector('#edit-pass');
    const loginBtn = document.querySelector('#edit-submit');
    if (userInput && passInput && loginBtn) {
      const lastAttempt = Number(sessionStorage.getItem('uit_drupal_ts') || 0);
      if (Date.now() - lastAttempt < 5000) return;
      sessionStorage.setItem('uit_drupal_ts', String(Date.now()));
      setNativeValue(userInput, account.username);
      setNativeValue(passInput, account.password);
      loginBtn.click();
    }
  }

  // =========================================================================
  // 2. PORTAL.UIT.EDU.VN — SPA ROUTER WATCHER & SCRAPER DISPATCHER
  // =========================================================================
  function scrapePortalStudentInfo() {
    try {
      const headerEl = document.querySelector('header') || document.body;
      let mssv = '';
      let fullname = '';

      const candidates = Array.from(headerEl.querySelectorAll('button, div, a, span'));
      for (const el of candidates) {
        const text = extractSpacedText(el);
        const m = text.match(/\b(\d{8})\b/);
        if (m) {
          mssv = m[1];
          const lines = el.innerText
            ? el.innerText
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
            : [];
          if (lines.length >= 2) {
            const nameCandidate = lines.find(
              (l) => !/\d{8}/.test(l) && l.length >= 3 && !l.includes('/')
            );
            if (nameCandidate) fullname = nameCandidate;
          }
          break;
        }
      }

      if (mssv) {
        chrome.storage.local.set({
          portal_student_info: {
            mssv,
            fullname: fullname || '',
            updatedAt: Date.now()
          }
        });
      }
    } catch (_) {}
  }

  function dispatchPortalRouteScraper(force = false) {
    if (!host.includes('portal.uit.edu.vn')) return;

    const currentPath = window.location.pathname;
    const currentHref = window.location.href;
    if (!force && window.__uitLastScrapedHref === currentHref) return;
    window.__uitLastScrapedHref = currentHref;

    setTimeout(scrapePortalStudentInfo, 1000);

    // 2.1. Bảng điểm (/sinh-vien/bang-diem)
    if (currentPath.includes('/sinh-vien/bang-diem') || isAutoCheckGrade) {
      let gradeChecks = 0;
      const gradeTimer = setInterval(() => {
        gradeChecks++;
        const hasContent =
          document.querySelectorAll('main table').length > 0 ||
          document.querySelectorAll('button[role="tab"]').length > 0;
        if (hasContent) {
          clearInterval(gradeTimer);
          setTimeout(checkGradesPortal, 500);
        } else if (gradeChecks > 45) {
          clearInterval(gradeTimer);
        }
      }, 350);
    }

    // 2.2. Thời khóa biểu (/sinh-vien/tkb)
    if (currentPath.includes('/sinh-vien/tkb') || isAutoCheckTKB) {
      let tkbChecks = 0;
      const tkbTimer = setInterval(() => {
        tkbChecks++;
        const hasContent =
          document.querySelector('main table tbody tr') ||
          document.querySelector('div[style*="grid-template-columns"]') ||
          document.querySelector('button[role="tab"]');
        if (hasContent) {
          clearInterval(tkbTimer);
          setTimeout(scrapeTKB_Portal, 500);
        } else if (tkbChecks > 45) {
          clearInterval(tkbTimer);
        }
      }, 350);
    }

    // 2.3. Lịch thi (/sinh-vien/lich-thi)
    if (currentPath.includes('/sinh-vien/lich-thi') || isAutoCheckExam) {
      let examChecks = 0;
      const examTimer = setInterval(() => {
        examChecks++;
        const mainEl = document.querySelector('main');
        if (mainEl && mainEl.querySelectorAll('table, select, h1').length > 0) {
          clearInterval(examTimer);
          setTimeout(checkExamsPortal, 600);
        } else if (examChecks > 45) {
          clearInterval(examTimer);
        }
      }, 350);
    }

    // 2.4. Khảo sát giảng dạy (/sinh-vien/khao-sat-giang-day hoặc /sinh-vien/phieu-khao-sat)
    if (
      isAutoSurvey ||
      currentPath.includes('/sinh-vien/khao-sat-giang-day') ||
      currentPath.includes('/sinh-vien/phieu-khao-sat')
    ) {
      chrome.storage.local.get(['survey_settings'], (res) => {
        const settings = res.survey_settings || {
          rateIndex: '3',
          text1: 'Không ý kiến',
          text2: 'Không ý kiến'
        };
        if (isAutoSurvey) {
          setTimeout(() => runPortalSurveyAutomation(settings), 1000);
        }
      });
    }
  }

  window.__uitTriggerPortalScrape = () => dispatchPortalRouteScraper(true);

  if (host.includes('portal.uit.edu.vn')) {
    dispatchPortalRouteScraper(true);

    // Theo dõi điều hướng SPA (Next.js App Router không reload trang khi bấm menu trái)
    setInterval(() => {
      if (window.location.href !== window.__uitLastScrapedHref) {
        dispatchPortalRouteScraper(false);
      }
    }, 800);

    window.addEventListener('popstate', () => {
      setTimeout(() => dispatchPortalRouteScraper(true), 300);
    });

    chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
      if (req && req.action === 'runPortalScraper') {
        dispatchPortalRouteScraper(true);
        sendResponse({ ok: true });
      }
    });
  }

  // =========================================================================
  // 3. SCRAPER: BẢNG ĐIỂM & GPA (portal.uit.edu.vn/sinh-vien/bang-diem)
  // =========================================================================
  async function checkGradesPortal() {
    if (window.__uitGradeScraping) return;
    window.__uitGradeScraping = true;

    try {
      const summaryStats = {
        tcDaHoc: null,
        tcTichLuy: null,
        gpaToanKhoa: null,
        gpaTichLuy: null,
        xepLoai: null,
        semesters: [],
        updatedAt: Date.now()
      };

      const semSummaryMap = {};

      // A. Quét 4 thẻ tổng quan nếu có (bản r3430)
      const statCards = document.querySelectorAll('main .rounded-xl.border.bg-card p.text-xs');
      statCards.forEach((labelEl) => {
        const label = (labelEl.textContent || '').trim().toLowerCase();
        const valEl = labelEl.parentElement?.querySelector('p.text-2xl, p.font-mono');
        if (!valEl) return;
        const num = parseFloat(valEl.textContent.trim().replace(',', '.'));
        if (isNaN(num)) return;
        if (label.includes('tc đã học')) summaryStats.tcDaHoc = num;
        else if (label.includes('tc tích lũy')) summaryStats.tcTichLuy = num;
        else if (label.includes('gpa toàn khóa')) summaryStats.gpaToanKhoa = num;
        else if (label.includes('gpa tích lũy')) summaryStats.gpaTichLuy = num;
      });

      // B. Hàm đọc bảng "Tổng kết theo kỳ" (tab mặc định trên bản r3487)
      // Cột: HỌC KỲ | GPA HK | GPA TÍCH LŨY | XẾP LOẠI | ĐRL | TC HK | TC TÍCH LŨY
      function parseSummaryTableInDOM() {
        const tables = document.querySelectorAll('main table');
        tables.forEach((table) => {
          const headers = Array.from(table.querySelectorAll('thead th')).map((th) =>
            (th.textContent || '').trim().toLowerCase()
          );
          const isSummaryTable =
            headers.some((h) => h.includes('gpa tích lũy')) ||
            (headers.some((h) => h.includes('gpa hk')) && headers.some((h) => h.includes('xếp loại')));

          if (!isSummaryTable) return;

          let sumTcHK = 0;
          const rows = table.querySelectorAll('tbody tr');
          rows.forEach((tr) => {
            const cols = Array.from(tr.querySelectorAll('td')).map((td) =>
              (td.textContent || '').replace(/\s+/g, ' ').trim()
            );
            if (cols.length < 6) return;

            const semName = cols[0];
            const gpaHK = parseFloat((cols[1] || '').replace(',', '.'));
            const gpaTL = parseFloat((cols[2] || '').replace(',', '.'));
            const xepLoai = cols[3] && cols[3] !== '—' ? cols[3] : '';
            const drl = parseFloat((cols[4] || '').replace(',', '.'));
            const tcHK = parseFloat((cols[5] || '').replace(',', '.'));
            const tcTL = parseFloat((cols[6] || '').replace(',', '.'));

            if (!isNaN(tcHK)) sumTcHK += tcHK;
            if (!isNaN(gpaTL)) summaryStats.gpaTichLuy = gpaTL;
            if (!isNaN(tcTL)) {
              summaryStats.tcTichLuy =
                summaryStats.tcTichLuy !== null ? Math.max(summaryStats.tcTichLuy, tcTL) : tcTL;
            }
            if (xepLoai) summaryStats.xepLoai = xepLoai;

            if (semName) {
              semSummaryMap[semName] = {
                name: semName,
                tongTC: !isNaN(tcHK) ? tcHK : null,
                gpaHK: !isNaN(gpaHK) ? gpaHK : null,
                gpaTichLuy: !isNaN(gpaTL) ? gpaTL : null,
                drl: !isNaN(drl) ? drl : null,
                xepLoai
              };
            }
          });

          if (sumTcHK > 0 && summaryStats.tcDaHoc === null) {
            summaryStats.tcDaHoc = sumTcHK;
          }
        });
      }

      parseSummaryTableInDOM();

      // C. Chuyển sang tab "Chi tiết môn học" bằng simulateRadixClick để lấy danh sách từng môn
      const allTabs = Array.from(document.querySelectorAll('button[role="tab"], main button'));
      const detailTab = allTabs.find((b) => {
        const txt = (b.textContent || '').trim().toLowerCase();
        const id = (b.id || '').toLowerCase();
        return id.includes('trigger-by-semester') || txt.includes('chi tiết môn học');
      });

      if (detailTab && detailTab.getAttribute('data-state') !== 'active') {
        simulateRadixClick(detailTab);

        // Chờ bảng chi tiết môn học render trong DOM (tối đa 3.5 giây)
        for (let i = 0; i < 28; i++) {
          await sleep(125);
          const tables = Array.from(document.querySelectorAll('main table'));
          const hasCourseTable = tables.some((t) => {
            const thText = (t.querySelector('thead')?.textContent || '').toLowerCase();
            return thText.includes('mã môn') || thText.includes('tên môn') || thText.includes('điểm tb');
          });
          if (hasCourseTable) break;
        }
        await sleep(150);
      }

      // D. Quét tất cả các bảng điểm môn học theo từng học kỳ
      const currentGrades = {};
      const allGradesData = [];

      const tables = Array.from(document.querySelectorAll('main table'));
      tables.forEach((table, tableIdx) => {
        const headers = Array.from(table.querySelectorAll('thead th')).map((th) =>
          (th.textContent || '').trim().toLowerCase()
        );
        const isCourseTable =
          headers.some((h) => h.includes('mã môn') || h.includes('mã hp')) ||
          headers.some((h) => h.includes('tên môn') || h.includes('điểm tb'));

        if (!isCourseTable) return;

        // Tìm tên Học kỳ và các chỉ số Tổng TC / GPA HK từ thẻ card bao ngoài bảng
        let currentSemester = `Học kỳ ${tableIdx + 1}`;
        let semTC = null;
        let semGPA = null;

        let container = table.parentElement;
        for (let depth = 0; depth < 5 && container && container.tagName !== 'MAIN'; depth++) {
          const heading = container.querySelector('h3, h2, h4');
          if (heading && heading.textContent.trim()) {
            currentSemester = heading.textContent.replace(/\s+/g, ' ').trim();
            const spans = container.querySelectorAll('span, p');
            spans.forEach((sp) => {
              const txt = (sp.textContent || '').trim();
              if (txt.includes('Tổng TC')) {
                const v = parseFloat(txt.replace(/[^0-9.,]/g, '').replace(',', '.'));
                if (!isNaN(v)) semTC = v;
              } else if (txt.includes('GPA HK')) {
                const v = parseFloat(txt.replace(/[^0-9.,]/g, '').replace(',', '.'));
                if (!isNaN(v)) semGPA = v;
              }
            });
            break;
          }
          container = container.parentElement;
        }

        summaryStats.semesters.push({
          name: currentSemester,
          tongTC: semTC,
          gpaHK: semGPA
        });

        const rows = table.querySelectorAll('tbody tr');
        rows.forEach((row) => {
          const cols = row.querySelectorAll('td');
          if (cols.length < 7) return;

          const cleanCell = (idx) => {
            const t = (cols[idx]?.textContent || '').trim().replace(',', '.');
            return t === '—' || t === '-' || t === '–' ? '' : t;
          };

          const maMH = cleanCell(0);
          const tenMH = (cols[1]?.textContent || '').replace(/\s+/g, ' ').trim();
          if (!maMH || maMH.toLowerCase().includes('mã môn')) return;

          const tc = cleanCell(2);
          const qt = cleanCell(3);
          const th = cleanCell(4);
          const gk = cleanCell(5);
          const ck = cleanCell(6);
          const hp = cleanCell(7);
          const ghiChu = (cols[8]?.textContent || '').replace(/\s+/g, ' ').trim();
          const weightNote = cols[7]?.getAttribute('title') || '';

          allGradesData.push({
            semester: currentSemester,
            maMH,
            tenMH,
            tc,
            qt,
            th,
            gk,
            ck,
            hp,
            ghiChu,
            weightNote,
            // Tương thích ngược với cấu trúc khóa cũ
            hocKy: currentSemester,
            maHP: maMH,
            tenHP: tenMH,
            diemQT: qt,
            diemTH: th,
            diemGK: gk,
            diemCK: ck,
            diemHP: hp
          });

          if (hp !== '' && !isNaN(parseFloat(hp))) {
            currentGrades[maMH] = `${tenMH}: ${hp}`;
          }
        });
      });

      // Nếu chưa có danh sách semesters từ tab chi tiết, bổ sung từ bảng tổng kết
      if (summaryStats.semesters.length === 0 && Object.keys(semSummaryMap).length > 0) {
        summaryStats.semesters = Object.values(semSummaryMap);
      }

      if (allGradesData.length === 0) return;

      const res = await chrome.storage.local.get(['savedGrades']);
      const oldGrades = res.savedGrades || {};
      const newCourses = [];

      for (const [code, info] of Object.entries(currentGrades)) {
        if (oldGrades[code] !== info) {
          newCourses.push(info);
        }
      }

      await chrome.storage.local.set({
        savedGrades: currentGrades,
        saved_grades: allGradesData,
        saved_grades_summary: summaryStats
      });

      chrome.runtime.sendMessage({ action: 'gradesUpdated' }).catch(() => {});

      if (newCourses.length > 0 && Object.keys(oldGrades).length > 0) {
        chrome.runtime.sendMessage({
          action: 'showNotification',
          title: 'Có điểm môn học mới!',
          message: `Cập nhật điểm: ${newCourses.join(', ')}`,
          closeTab: isAutoCheckGrade
        });
      } else if (isAutoCheckGrade) {
        chrome.runtime.sendMessage({
          action: 'showNotification',
          title: 'Đã đồng bộ Bảng điểm & GPA',
          message: `Đã lưu ${allGradesData.length} môn học từ UIT Portal.`,
          closeTab: true
        });
      }
    } catch (err) {
      console.error('[UIT Content] Lỗi quét bảng điểm:', err);
    } finally {
      window.__uitGradeScraping = false;
    }
  }

  // =========================================================================
  // 4. SCRAPER: THỜI KHÓA BIỂU (portal.uit.edu.vn/sinh-vien/tkb)
  // =========================================================================
  async function scrapeTKB_Portal() {
    if (window.__uitTkbScraping) return;
    window.__uitTkbScraping = true;

    try {
      const PERIOD_START_TIMES = {
        1: [7, 30], 2: [8, 15], 3: [9, 0], 4: [9, 55], 5: [10, 40],
        6: [13, 0], 7: [13, 45], 8: [14, 30], 9: [15, 25], 10: [16, 10],
        11: [16, 55], 12: [17, 45]
      };
      const PERIOD_END_TIMES = {
        1: [8, 15], 2: [9, 0], 3: [9, 45], 4: [10, 40], 5: [11, 25],
        6: [13, 45], 7: [14, 30], 8: [15, 15], 9: [16, 10], 10: [16, 55],
        11: [17, 40], 12: [18, 30]
      };

      const allTabs = Array.from(document.querySelectorAll('button[role="tab"], main button'));
      const dkhpTabBtn = allTabs.find((b) => {
        const t = (b.textContent || '').trim().toLowerCase();
        const id = (b.id || '').toLowerCase();
        return id.includes('trigger-dang-ky') || t.includes('theo đkhp');
      });
      const weekTabBtn = allTabs.find((b) => {
        const t = (b.textContent || '').trim().toLowerCase();
        const id = (b.id || '').toLowerCase();
        return id.includes('trigger-lich-tuan') || t.includes('lịch tuần');
      });

      // ---------------------------------------------------------------------
      // PHƯƠNG PHÁP 1 (ƯU TIÊN): Quét trực tiếp bảng "Theo ĐKHP" (siêu tốc <100ms)
      // Cột trên r3487: # | Lớp / Môn học | TC | HTGD | Lịch học / Thời gian | Giảng viên | Sĩ số
      // ---------------------------------------------------------------------
      if (dkhpTabBtn && dkhpTabBtn.getAttribute('data-state') !== 'active') {
        simulateRadixClick(dkhpTabBtn);
        for (let i = 0; i < 20; i++) {
          await sleep(100);
          if (document.querySelector('main table tbody tr')) break;
        }
      }

      const dkhpEvents = [];
      const dkhpMetaByClass = {};
      const dkhpRows = document.querySelectorAll('main table tbody tr');

      dkhpRows.forEach((tr) => {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 5) return;

        // Cột 1: Lớp / Môn học (VD: "JAN07.R13.CNVN JAN07 Tiếng Nhật 7")
        const classCellText = extractSpacedText(tds[1]);
        const maLopMatch = classCellText.match(/\b([A-Z]{2,6}\d{2,4}\.[A-Z0-9._-]+)\b/i);
        if (!maLopMatch) return;

        const maLop = maLopMatch[1].toUpperCase();
        const baseCourseCode = maLop.split('.')[0];

        let tenMH = classCellText
          .replace(maLopMatch[0], '')
          .replace(new RegExp(`^\\s*${baseCourseCode}\\b`, 'i'), '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!tenMH) tenMH = maLop;

        const tc = extractSpacedText(tds[2]);
        const htgd = extractSpacedText(tds[3]);
        const schedText = extractSpacedText(tds[4]);
        const giangVien = extractSpacedText(tds[5]) || 'Xem portal';

        // Lưu metadata phục vụ fallback Lịch tuần nếu cần
        dkhpMetaByClass[maLop] = {
          tenMH,
          giangVien,
          tc,
          htgd
        };

        // Kiểm tra học Cách tuần (interval = 2)
        const interval = /cách\s*tuần/i.test(schedText) ? 2 : 1;

        // Trích xuất khoảng ngày học: DD/MM/YYYY – DD/MM/YYYY
        const dateMatches = schedText.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/g) || [];
        let firstDate = null;
        let lastDate = null;
        if (dateMatches.length >= 2) {
          const [d1, m1, y1] = dateMatches[0].split('/').map(Number);
          const [d2, m2, y2] = dateMatches[dateMatches.length - 1].split('/').map(Number);
          firstDate = new Date(y1, m1 - 1, d1);
          lastDate = new Date(y2, m2 - 1, d2);
        } else if (dateMatches.length === 1) {
          const [d1, m1, y1] = dateMatches[0].split('/').map(Number);
          firstDate = new Date(y1, m1 - 1, d1);
          lastDate = new Date(y1, m1 - 1, d1 + 105);
        } else {
          const now = new Date();
          firstDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
          lastDate = new Date(now.getFullYear(), now.getMonth() + 4, 28);
        }

        // Bóc tách từng cụm "Thứ X, tiết A–B, Phòng" (hỗ trợ cả lớp học nhiều buổi/tuần)
        const cleanSched = schedText
          .replace(/cách\s*tuần/gi, ' ')
          .replace(/\b\d{2}\/\d{2}\/\d{4}\s*[–\-~]\s*\d{2}\/\d{2}\/\d{4}\b/g, ' ')
          .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const scheduleRegex =
          /(Thứ\s*([2-7])|Chủ\s*nhật|CN)\s*,?\s*tiết\s*(\d+)(?:\s*[–\-~]\s*(\d+))?\s*(?:,\s*([A-Za-z0-9._\-/ ]+?))?(?=\s*(?:Thứ\s*[2-7]|Chủ\s*nhật|CN|$))/gi;

        let match;
        while ((match = scheduleRegex.exec(cleanSched)) !== null) {
          const dayNumStr = match[2];
          const dayOfWeek = dayNumStr ? parseInt(dayNumStr, 10) - 1 : 0;

          let startTiet = parseInt(match[3], 10);
          let endTiet = match[4] ? parseInt(match[4], 10) : startTiet;

          // Xử lý trường hợp tiết viết liền kiểu cũ (VD: tiết 12345 -> 1..5, tiết 67890 -> 6..10)
          if (!match[4] && match[3].length > 1 && startTiet > 12) {
            const digits = match[3].split('').map((ch) => (ch === '0' ? 10 : parseInt(ch, 10)));
            startTiet = digits[0];
            endTiet = digits[digits.length - 1];
          }

          const room = (match[5] || '').trim() || 'Chưa rõ';

          const sHM = PERIOD_START_TIMES[startTiet] || [7, 30];
          const eHM = PERIOD_END_TIMES[endTiet] || [11, 25];

          const startDate = new Date(firstDate);
          startDate.setHours(sHM[0], sHM[1], 0, 0);

          const endDate = new Date(firstDate);
          endDate.setHours(eHM[0], eHM[1], 0, 0);

          const untilDate = new Date(lastDate);
          untilDate.setHours(23, 59, 59, 0);

          dkhpEvents.push({
            maLop,
            title: `${maLop} - ${tenMH}`,
            room,
            teacher: giangVien,
            tc,
            htgd,
            dayOfWeek,
            startTiet,
            endTiet,
            spanTiet: endTiet - startTiet + 1,
            interval,
            fullDesc: `Phòng: ${room} | GV: ${giangVien}`,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            untilDate: untilDate.toISOString(),
            isCancelled: false
          });
        }
      });

      let finalEvents = dkhpEvents;

      // ---------------------------------------------------------------------
      // PHƯƠNG PHÁP 2 (FALLBACK): Nếu bảng Theo ĐKHP không có lịch, quét "Lịch tuần"
      // ---------------------------------------------------------------------
      if (finalEvents.length === 0) {
        if (weekTabBtn && weekTabBtn.getAttribute('data-state') !== 'active') {
          simulateRadixClick(weekTabBtn);
          await sleep(450);
        }

        function getToolbarButtons() {
          const allBtns = Array.from(document.querySelectorAll('main button'));
          const todayBtn = allBtns.find((b) => {
            const t = (b.textContent || '').trim().toLowerCase();
            return t === 'về tuần này' || t === 'hôm nay';
          });
          if (!todayBtn) return { prevBtn: null, todayBtn: null, nextBtn: null };
          const container = todayBtn.parentElement;
          const siblings = Array.from(container.querySelectorAll('button'));
          const idx = siblings.indexOf(todayBtn);
          return {
            prevBtn: idx > 0 ? siblings[idx - 1] : null,
            todayBtn,
            nextBtn: idx < siblings.length - 1 ? siblings[idx + 1] : null
          };
        }

        function parseWeekHeaderDates() {
          const colMap = {};
          const headerGrid = document.querySelector('main div.grid.border-b.border-border');
          if (!headerGrid) return colMap;
          const children = Array.from(headerGrid.children);
          children.forEach((cell, idx) => {
            const text = (cell.textContent || '').trim();
            const dateMatch = text.match(/(\d{2})\/(\d{2})(?:\/(\d{4}))?$/);
            if (dateMatch && idx >= 1) {
              colMap[idx + 1] = {
                day: parseInt(dateMatch[1], 10),
                month: parseInt(dateMatch[2], 10),
                year: dateMatch[3] ? parseInt(dateMatch[3], 10) : null
              };
            }
          });
          return colMap;
        }

        function getCurrentWeekYear() {
          const els = Array.from(document.querySelectorAll('main button, main p'));
          for (const el of els) {
            const m = (el.textContent || '').match(
              /\d{2}\/\d{2}(?:\/(\d{4}))?\s*[–-]\s*\d{2}\/\d{2}\/(\d{4})/
            );
            if (m) {
              const endY = parseInt(m[2], 10);
              const startY = m[1] ? parseInt(m[1], 10) : endY;
              return { startYear: startY, endYear: endY };
            }
          }
          const y = new Date().getFullYear();
          return { startYear: y, endYear: y };
        }

        function getWeekSignature() {
          const headerGrid = document.querySelector('main div.grid.border-b.border-border');
          return headerGrid ? headerGrid.textContent.trim() : '';
        }

        async function clickAndWaitWeekChange(btn) {
          if (!btn || btn.disabled) return false;
          const before = getWeekSignature();
          btn.click();
          for (let i = 0; i < 12; i++) {
            await sleep(45);
            const now = getWeekSignature();
            if (now && now !== before) return true;
          }
          return false;
        }

        function parseCurrentWeekCourses(colDates, yearInfo) {
          const results = [];
          const courseEls = document.querySelectorAll('main div[style*="grid-area"]');

          courseEls.forEach((el) => {
            const style = el.getAttribute('style') || '';
            const areaMatch = style.match(
              /grid-area:\s*(\d+)\s*\/\s*(\d+)(?:\s*\/\s*span\s*(\d+))?/
            );
            if (!areaMatch) return;

            const startTiet = parseInt(areaMatch[1], 10);
            const gridCol = parseInt(areaMatch[2], 10);
            const spanTiet = areaMatch[3] ? parseInt(areaMatch[3], 10) : 1;
            const endTiet = startTiet + spanTiet - 1;

            const btn = el.querySelector('button');
            if (!btn) return;

            const maLopSpan = btn.querySelector('span.font-mono');
            const maLop = maLopSpan ? maLopSpan.textContent.trim() : '';
            if (!maLop) return;

            const nameDiv = btn.querySelector('div.font-semibold');
            const tenMH = nameDiv ? nameDiv.textContent.trim() : '';

            let phong = '';
            const mapPinSvg = btn.querySelector('svg.lucide-map-pin');
            if (mapPinSvg && mapPinSvg.parentElement) {
              const roomSpan = mapPinSvg.parentElement.querySelector('span');
              if (roomSpan) phong = roomSpan.textContent.trim();
            }
            if (!phong) {
              const spans = Array.from(btn.querySelectorAll('span'));
              for (const s of spans) {
                const txt = s.textContent.trim();
                if (txt !== maLop && !txt.startsWith('Tiết') && !txt.includes('Đề cương')) {
                  phong = txt;
                  break;
                }
              }
            }

            let realEndTiet = endTiet;
            const tietSpan = Array.from(btn.querySelectorAll('span')).find((s) =>
              s.textContent.includes('Tiết')
            );
            if (tietSpan) {
              const tm = tietSpan.textContent.match(/Tiết\s*(\d+)\s*[–-]\s*(\d+)/);
              if (tm) realEndTiet = parseInt(tm[2], 10);
            }

            const colDate = colDates[gridCol];
            let eventDate = null;
            if (colDate) {
              let year = colDate.year || yearInfo.startYear;
              if (!colDate.year && yearInfo.startYear !== yearInfo.endYear && colDate.month <= 2) {
                year = yearInfo.endYear;
              }
              eventDate = new Date(year, colDate.month - 1, colDate.day);
            }

            const dayOfWeek = gridCol === 8 ? 0 : gridCol - 1;
            const meta = dkhpMetaByClass[maLop.toUpperCase()] || {};

            results.push({
              maLop,
              tenMH: tenMH || meta.tenMH || maLop,
              phong: phong || 'Chưa rõ',
              giangVien: meta.giangVien || 'Xem portal',
              startTiet,
              endTiet: realEndTiet,
              dayOfWeek,
              eventDate
            });
          });

          return results;
        }

        const courseMap = {};
        const { todayBtn } = getToolbarButtons();
        if (todayBtn) {
          await clickAndWaitWeekChange(todayBtn);
        }

        for (let i = 0; i < 10; i++) {
          const { prevBtn } = getToolbarButtons();
          if (!prevBtn || prevBtn.disabled) break;
          await clickAndWaitWeekChange(prevBtn);
        }

        let emptyStreak = 0;
        let foundAny = false;
        for (let w = 0; w < 22; w++) {
          const colDates = parseWeekHeaderDates();
          const yearInfo = getCurrentWeekYear();
          const weekCourses = parseCurrentWeekCourses(colDates, yearInfo);

          if (weekCourses.length > 0) {
            foundAny = true;
            emptyStreak = 0;
          } else if (foundAny) {
            emptyStreak++;
            if (emptyStreak >= 4) break;
          }

          weekCourses.forEach((ev) => {
            if (!ev.eventDate) return;
            const key = `${ev.maLop}_${ev.dayOfWeek}_${ev.startTiet}`;
            if (!courseMap[key]) {
              courseMap[key] = {
                ...ev,
                firstDate: new Date(ev.eventDate),
                lastDate: new Date(ev.eventDate)
              };
            } else {
              if (ev.eventDate < courseMap[key].firstDate) {
                courseMap[key].firstDate = new Date(ev.eventDate);
              }
              if (ev.eventDate > courseMap[key].lastDate) {
                courseMap[key].lastDate = new Date(ev.eventDate);
              }
              if (ev.phong && ev.phong !== 'Chưa rõ') {
                courseMap[key].phong = ev.phong;
              }
            }
          });

          const { nextBtn } = getToolbarButtons();
          if (!nextBtn || nextBtn.disabled) break;
          const changed = await clickAndWaitWeekChange(nextBtn);
          if (!changed) break;
        }

        const { todayBtn: returnToday } = getToolbarButtons();
        if (returnToday) {
          await clickAndWaitWeekChange(returnToday);
        }

        finalEvents = Object.values(courseMap).map((c) => {
          const sHM = PERIOD_START_TIMES[c.startTiet] || [7, 30];
          const eHM = PERIOD_END_TIMES[c.endTiet] || [11, 25];

          const startDate = new Date(c.firstDate);
          startDate.setHours(sHM[0], sHM[1], 0, 0);

          const endDate = new Date(c.firstDate);
          endDate.setHours(eHM[0], eHM[1], 0, 0);

          const untilDate = new Date(c.lastDate);
          untilDate.setHours(23, 59, 59, 0);

          return {
            maLop: c.maLop,
            title: `${c.maLop} - ${c.tenMH}`,
            room: c.phong,
            teacher: c.giangVien || 'Xem portal',
            dayOfWeek: c.dayOfWeek,
            startTiet: c.startTiet,
            endTiet: c.endTiet,
            spanTiet: c.endTiet - c.startTiet + 1,
            interval: 1,
            fullDesc: `Phòng: ${c.phong} | GV: ${c.giangVien || 'Xem portal'}`,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            untilDate: untilDate.toISOString(),
            isCancelled: false
          };
        });
      }

      if (finalEvents.length > 0) {
        let maxEnd = 0;
        finalEvents.forEach((ev) => {
          const u = new Date(ev.untilDate).getTime();
          if (u > maxEnd) maxEnd = u;
        });

        await chrome.storage.local.set({
          saved_tkb_ics: finalEvents,
          tkb_EndDate: maxEnd,
          tkb_scraped_until: maxEnd,
          tkb_lastSync: Date.now(),
          tkb_last_scraped: Date.now()
        });

        chrome.runtime.sendMessage({ action: 'tkbUpdated' }).catch(() => {});

        await scrapeNghiBuAlerts(finalEvents);
        chrome.runtime.sendMessage({ action: 'tkbUpdated' }).catch(() => {});

        chrome.runtime.sendMessage({
          action: 'showNotification',
          title: 'Đồng bộ Thời khóa biểu hoàn tất',
          message: `Đã lưu ${finalEvents.length} buổi học trong tuần và kiểm tra lịch Nghỉ/Bù.`,
          closeTab: isAutoCheckTKB
        });
      }
    } catch (err) {
      console.error('[UIT Content] Lỗi quét TKB:', err);
    } finally {
      window.__uitTkbScraping = false;
    }
  }

  // =========================================================================
  // 5. SCRAPER: LỊCH THI (portal.uit.edu.vn/sinh-vien/lich-thi)
  // =========================================================================
  async function checkExamsPortal() {
    try {
      const hockyParam = urlParams.get('hocky');
      const namhocParam = urlParams.get('namhoc');

      if (hockyParam || namhocParam) {
        const hkSelect = document.querySelector(
          'select[aria-label*="học kỳ" i], select[aria-label*="Học kỳ" i]'
        );
        const nhSelect = document.querySelector(
          'select[aria-label*="năm học" i], select[aria-label*="Năm học" i]'
        );
        let filterChanged = false;

        if (hkSelect && hockyParam && hkSelect.value !== hockyParam) {
          setNativeValue(hkSelect, hockyParam);
          filterChanged = true;
        }
        if (nhSelect && namhocParam) {
          const yearVal = namhocParam.split('-')[0];
          const hasOpt = Array.from(nhSelect.options).some(
            (o) => o.value === yearVal || o.value === namhocParam
          );
          if (hasOpt) {
            const targetVal = Array.from(nhSelect.options).find(
              (o) => o.value === yearVal || o.value === namhocParam
            ).value;
            if (nhSelect.value !== targetVal) {
              setNativeValue(nhSelect, targetVal);
              filterChanged = true;
            }
          }
        }

        if (filterChanged) {
          const applyBtn = Array.from(document.querySelectorAll('main button')).find((b) =>
            b.textContent.trim().includes('Áp dụng')
          );
          if (applyBtn) {
            applyBtn.click();
            await sleep(900);
          }
        }
      }

      const exams = [];
      const tables = document.querySelectorAll('main table');

      tables.forEach((table) => {
        const headers = Array.from(table.querySelectorAll('thead th')).map((th) =>
          th.textContent.trim().toLowerCase()
        );
        const rows = table.querySelectorAll('tbody tr');

        rows.forEach((row, idx) => {
          const cols = Array.from(row.querySelectorAll('td')).map((td) =>
            td.textContent.replace(/\s+/g, ' ').trim()
          );
          if (cols.length < 4) return;
          if (
            cols.join('').toLowerCase().includes('không có lịch thi') ||
            cols.join('').toLowerCase().includes('chưa có dữ liệu')
          ) {
            return;
          }

          const findCol = (keywords, fallbackIdx) => {
            const hIdx = headers.findIndex((h) => keywords.some((k) => h.includes(k)));
            if (hIdx !== -1 && cols[hIdx] !== undefined) return cols[hIdx];
            return cols[fallbackIdx] || '';
          };

          const maLop = findCol(['mã lớp', 'lớp'], 1);
          const tenMH = findCol(['tên môn', 'môn học', 'học phần'], 2);
          const ngayThi = findCol(['ngày thi', 'ngày'], 3);
          const caThi = findCol(['ca thi', 'ca', 'giờ thi', 'tiết'], 4);
          const phongThi = findCol(['phòng thi', 'phòng'], 5);
          const ghiChu = findCol(['hình thức', 'ghi chú', 'số báo danh'], 6);

          if (maLop || tenMH) {
            exams.push({
              stt: idx + 1,
              maLop: maLop || '—',
              tenMH: tenMH || maLop,
              ngayThi: ngayThi || 'Chưa xếp',
              caThi: caThi || '—',
              phongThi: phongThi || '—',
              ghiChu: ghiChu || ''
            });
          }
        });
      });

      if (exams.length === 0) {
        const cards = document.querySelectorAll(
          'main div.rounded-lg.border.bg-card, main li.rounded-lg.border'
        );
        cards.forEach((card, idx) => {
          const text = card.textContent || '';
          const codeMatch = text.match(/\b([A-Z]{2,5}\d{2,4}(?:\.[A-Z0-9.]+)?)\b/);
          const dateMatch = text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
          if (codeMatch && dateMatch) {
            const titleEl = card.querySelector('h3, h4, .font-semibold');
            const roomMatch = text.match(/Phòng[:\s]*([A-Za-z0-9._-]+)/i);
            const caMatch = text.match(/(Ca\s*\d+|Tiết\s*[\d–-]+|\d{1,2}[h:]\d{2})/i);
            exams.push({
              stt: idx + 1,
              maLop: codeMatch[1],
              tenMH: titleEl ? titleEl.textContent.trim() : codeMatch[1],
              ngayThi: dateMatch[1],
              caThi: caMatch ? caMatch[1] : '—',
              phongThi: roomMatch ? roomMatch[1] : '—',
              ghiChu: ''
            });
          }
        });
      }

      await chrome.storage.local.set({
        saved_exam_schedule: exams,
        exam_lastSync: Date.now()
      });

      chrome.runtime.sendMessage({ action: 'examsUpdated' }).catch(() => {});

      if (isAutoCheckExam) {
        chrome.runtime.sendMessage({
          action: 'showNotification',
          title: 'Đã đồng bộ Lịch thi',
          message:
            exams.length > 0
              ? `Tìm thấy ${exams.length} môn trong lịch thi học kỳ.`
              : 'Hiện chưa có lịch thi được công bố cho học kỳ này.',
          closeTab: true
        });
      }
    } catch (err) {
      console.error('[UIT Content] Lỗi quét lịch thi:', err);
    }
  }

  // =========================================================================
  // 6. SCRAPER: THÔNG BÁO NGHỈ / HỌC BÙ TỪ DAA & OEP
  // =========================================================================
  async function scrapeNghiBuAlerts(baseEvents) {
    if (!baseEvents || baseEvents.length === 0) return;

    const myCoursesMap = {};
    baseEvents.forEach((ev) => {
      if (ev.isCustom) return;
      const rawCode = (ev.maLop || ev.title.split(' - ')[0]).trim().toUpperCase();
      if (rawCode) myCoursesMap[rawCode] = ev;
    });

    const myCodes = Object.keys(myCoursesMap);
    if (myCodes.length === 0) return;

    const storageData = await chrome.storage.local.get([
      'saved_custom_events',
      'nghibu_initialized'
    ]);
    const customEvents = storageData.saved_custom_events || [];
    const isInitialized = storageData.nghibu_initialized || false;
    const maxPage = isInitialized ? 2 : 8;

    const fetchPage = (url) =>
      new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'fetchExternalUrl', url }, (res) => {
          resolve(res && res.success ? res.html : '');
        });
      });

    const urls = [];
    for (let page = 0; page <= maxPage; page++) {
      urls.push(`https://daa.uit.edu.vn/thong-bao-nghi-bu?page=${page}`);
      urls.push(
        page === 0
          ? 'https://oep.uit.edu.vn/vi/category/thong-bao-nghi-hoc-hoc-bu'
          : `https://oep.uit.edu.vn/vi/category/thong-bao-nghi-hoc-hoc-bu?page=${page}`
      );
    }

    const htmlPages = [];
    const BATCH_SIZE = 4;
    for (let i = 0; i < urls.length; i += BATCH_SIZE) {
      const chunk = urls.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(chunk.map(fetchPage));
      htmlPages.push(...results);
    }

    const PERIOD_START_TIMES = {
      1: [7, 30], 2: [8, 15], 3: [9, 0], 4: [9, 55], 5: [10, 40],
      6: [13, 0], 7: [13, 45], 8: [14, 30], 9: [15, 25], 10: [16, 10]
    };
    const PERIOD_END_TIMES = {
      1: [8, 15], 2: [9, 0], 3: [9, 45], 4: [10, 40], 5: [11, 25],
      6: [13, 45], 7: [14, 30], 8: [15, 15], 9: [16, 10], 10: [16, 55]
    };

    const parser = new DOMParser();

    for (const html of htmlPages) {
      if (!html) continue;
      const doc = parser.parseFromString(html, 'text/html');
      const articles = doc.querySelectorAll('article, .views-row');

      articles.forEach((art) => {
        const text = art.textContent || '';
        const matchedCode = myCodes.find((code) => text.toUpperCase().includes(code));
        if (!matchedCode) return;

        const baseCourse = myCoursesMap[matchedCode];
        const titleEl = art.querySelector('h2, h3');
        const titleText = titleEl ? titleEl.textContent.toLowerCase() : text.toLowerCase();

        const isBu = titleText.includes('học bù') || titleText.includes('bù lớp');
        const isNghi = titleText.includes('nghỉ') && !isBu;
        if (!isBu && !isNghi) return;

        const dateMatches = text.match(/\d{2}\/\d{2}\/\d{4}/g);
        if (!dateMatches || dateMatches.length === 0) return;

        const targetDateStr = dateMatches[dateMatches.length - 1];
        const [d, m, y] = targetDateStr.split('/').map(Number);

        let room = baseCourse.room;
        const roomMatch = text.match(/Phòng\s*:\s*([A-Za-z0-9._-]+)/i);
        if (roomMatch && roomMatch[1].trim()) room = roomMatch[1].trim();

        let startTiet = baseCourse.startTiet || 1;
        let endTiet = baseCourse.endTiet || 5;

        const startTietMatch = text.match(/Tiết bắt đầu\s*:\s*(\d+)/i);
        const endTietMatch = text.match(/Tiết kết thúc\s*:\s*(\d+)/i);

        if (startTietMatch && endTietMatch) {
          startTiet = parseInt(startTietMatch[1], 10);
          endTiet = parseInt(endTietMatch[1], 10);
        }

        const sHM = PERIOD_START_TIMES[startTiet] || [7, 30];
        const eHM = PERIOD_END_TIMES[endTiet] || [11, 25];

        const startDate = new Date(y, m - 1, d, sHM[0], sHM[1], 0);
        const endDate = new Date(y, m - 1, d, eHM[0], eHM[1], 0);
        const untilDate = new Date(y, m - 1, d, 23, 59, 59);

        const eventId = `${matchedCode}_${isBu ? 'BU' : 'NGHI'}_${targetDateStr}_${startTiet}`;

        if (!customEvents.some((e) => e.id === eventId)) {
          customEvents.push({
            id: eventId,
            maLop: matchedCode,
            title: `${isBu ? '[HỌC BÙ] ' : '[BÁO NGHỈ] '}${baseCourse.title}`,
            room,
            teacher: baseCourse.teacher,
            dayOfWeek: startDate.getDay(),
            startTiet,
            endTiet,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            untilDate: untilDate.toISOString(),
            isCustom: true,
            type: isBu ? 'bu' : 'nghi'
          });
        }
      });
    }

    await chrome.storage.local.set({
      saved_custom_events: customEvents,
      nghibu_initialized: true
    });
  }

  // =========================================================================
  // 7. AUTO SURVEY (portal.uit.edu.vn & survey.uit.edu.vn)
  // =========================================================================
  function runPortalSurveyAutomation(settings) {
    let attempts = 0;
    const poller = setInterval(() => {
      attempts++;

      const radios = document.querySelectorAll('input[type="radio"]');
      const scaleBtns = document.querySelectorAll('[role="radio"], button[data-value]');

      if (radios.length > 0 || scaleBtns.length > 0) {
        clearInterval(poller);
        setTimeout(() => fillPortalSurveyForm(settings), 400);
        return;
      }

      const allClickables = Array.from(document.querySelectorAll('main a, main button'));
      const surveyBtn = allClickables.find((el) => {
        const text = (el.textContent || '').trim().toLowerCase();
        return (
          (text.includes('khảo sát') ||
            text.includes('đánh giá') ||
            text.includes('thực hiện')) &&
          !text.includes('đã khảo sát') &&
          !text.includes('hoàn thành') &&
          !el.disabled
        );
      });

      if (surveyBtn) {
        clearInterval(poller);
        surveyBtn.click();
        setTimeout(() => runPortalSurveyAutomation(settings), 1800);
        return;
      }

      if (attempts > 25) {
        clearInterval(poller);
      }
    }, 500);
  }

  function fillPortalSurveyForm(settings) {
    let targetVal = '4';
    if (settings.rateIndex === '0') targetVal = '1';
    else if (settings.rateIndex === '1') targetVal = '2';
    else if (settings.rateIndex === '2') targetVal = '3';
    else if (settings.rateIndex === '3') targetVal = '4';

    const radios = document.querySelectorAll('input[type="radio"]');
    if (radios.length > 0) {
      const byName = {};
      radios.forEach((r) => {
        const key = r.name || 'default';
        if (!byName[key]) byName[key] = [];
        byName[key].push(r);
      });

      Object.values(byName).forEach((group) => {
        let target = group.find((r) => r.value === targetVal);
        if (!target) {
          const idx =
            settings.rateIndex === 'random'
              ? Math.floor(Math.random() * 2) + Math.max(0, group.length - 2)
              : Math.min(parseInt(settings.rateIndex, 10) || group.length - 1, group.length - 1);
          target = group[idx];
        }
        if (target) target.click();
      });
    }

    const textareas = document.querySelectorAll('textarea');
    if (textareas.length >= 1) setNativeValue(textareas[0], settings.text1);
    if (textareas.length >= 2) setNativeValue(textareas[1], settings.text2);

    setTimeout(() => {
      const submitBtn = Array.from(
        document.querySelectorAll('button[type="submit"], main button')
      ).find((b) => {
        const txt = (b.textContent || '').trim().toLowerCase();
        return (
          txt.includes('gửi') ||
          txt.includes('hoàn thành') ||
          txt.includes('nộp') ||
          txt.includes('tiếp tục') ||
          txt.includes('lưu')
        );
      });
      if (submitBtn) submitBtn.click();
    }, 600);
  }

  if (host.includes('survey.uit.edu.vn')) {
    chrome.storage.local.get(['survey_settings'], (res) => {
      const settings = res.survey_settings || {
        rateIndex: '3',
        text1: 'Không ý kiến',
        text2: 'Không ý kiến'
      };
      setTimeout(() => {
        const questionTables = document.querySelectorAll('table.question');
        questionTables.forEach((table) => {
          const rows = table.querySelectorAll('tbody tr');
          rows.forEach((row) => {
            const radios = row.querySelectorAll('input[type="radio"]');
            if (radios.length >= 4) {
              let idx = 3;
              if (settings.rateIndex === 'random') {
                idx = Math.floor(Math.random() * 2) + 2;
              } else {
                idx = Math.min(parseInt(settings.rateIndex, 10), radios.length - 1);
              }
              if (radios[idx]) radios[idx].click();
            }
          });
        });

        const textareas = document.querySelectorAll('textarea');
        if (textareas.length >= 1) setNativeValue(textareas[0], settings.text1);
        if (textareas.length >= 2) setNativeValue(textareas[1], settings.text2);

        setTimeout(() => {
          const submitBtn = document.querySelector(
            '#movenextbtn, #movesubmitbtn, button[type="submit"]'
          );
          if (submitBtn) submitBtn.click();
        }, 500);
      }, 800);
    });
  }

  // =========================================================================
  // 8. ĐĂNG KÝ HỌC PHẦN TỰ ĐỘNG (dkhp.uit.edu.vn)
  // =========================================================================
  if (host.includes('dkhp.uit.edu.vn')) {
    chrome.storage.local.get(['dkhp_schedule'], async (res) => {
      const schedule = res.dkhp_schedule;
      const shouldRun = isAutoDkhp || (schedule && schedule.active);
      if (!shouldRun && !acc) return;

      let loginRedirectDone = false;
      let regCompleted = false;
      let filterApplied = false;
      let attempts = 0;

      const dkhpPoller = setInterval(async () => {
        attempts++;
        if (attempts > 120) {
          clearInterval(dkhpPoller);
          return;
        }

        const currentPath = window.location.pathname;

        const userInput = document.querySelector('input[name="username"]');
        const passInput = document.querySelector(
          'input[name="password"], input[type="password"]'
        );

        if (userInput && passInput && acc && acc.username && acc.password) {
          const lastDkhpLogin = Number(sessionStorage.getItem('uit_dkhp_login_ts') || 0);
          if (Date.now() - lastDkhpLogin > 4000) {
            sessionStorage.setItem('uit_dkhp_login_ts', String(Date.now()));
            setNativeValue(userInput, acc.username);
            setNativeValue(passInput, acc.password);

            await sleep(150);
            const submitBtn =
              document.querySelector('button[type="submit"]') ||
              Array.from(document.querySelectorAll('button')).find((b) =>
                (b.textContent || '').toLowerCase().includes('đăng nhập')
              );
            if (submitBtn) submitBtn.click();
          }
          return;
        }

        if (!shouldRun || !schedule || !schedule.courses || schedule.courses.length === 0) {
          return;
        }

        if (!currentPath.includes('/app/reg') && !userInput && !loginRedirectDone) {
          loginRedirectDone = true;
          window.location.href = 'https://dkhp.uit.edu.vn/app/reg?source=auto_dkhp';
          return;
        }

        if (currentPath.includes('/app/reg') && !regCompleted) {
          const rows = document.querySelectorAll('table tbody tr');
          if (rows.length === 0) return;

          const targetCodes = schedule.courses.map((c) => c.trim().toUpperCase()).filter(Boolean);
          let matchedCount = 0;

          const selectMatchingRows = () => {
            let count = 0;
            const currentRows = document.querySelectorAll('table tbody tr');
            currentRows.forEach((tr) => {
              const codeTd = tr.querySelectorAll('td')[1];
              const rowCode = (codeTd ? codeTd.textContent : tr.textContent).trim().toUpperCase();
              const isTarget = targetCodes.some(
                (code) => rowCode === code || rowCode.includes(code)
              );
              if (isTarget) {
                const checkbox = tr.querySelector('input[type="checkbox"]');
                if (checkbox && !checkbox.disabled) {
                  if (!checkbox.checked) {
                    checkbox.click();
                  }
                  count++;
                }
              }
            });
            return count;
          };

          matchedCount = selectMatchingRows();

          if (matchedCount < targetCodes.length && !filterApplied) {
            const filterInput = document.querySelector('input.filter-input');
            if (filterInput) {
              filterApplied = true;
              setNativeValue(filterInput, targetCodes.join(', '));
              await sleep(650);
              matchedCount = selectMatchingRows();
            }
          }

          if (matchedCount > 0) {
            regCompleted = true;
            clearInterval(dkhpPoller);

            await sleep(250);
            const regBtn = Array.from(
              document.querySelectorAll('.detailBar button, button')
            ).find((b) => {
              const txt = (b.textContent || '').trim().toLowerCase();
              return txt.startsWith('đăng ký') && !b.disabled;
            });

            if (regBtn) {
              regBtn.click();
            }

            schedule.active = false;
            chrome.storage.local.set({ dkhp_schedule: schedule });

            chrome.runtime.sendMessage({
              action: 'showNotification',
              title: 'Đã thực thi Đăng ký học phần!',
              message: `Đã tự động chọn ${matchedCount}/${targetCodes.length} mã lớp và nhấn Đăng ký.`
            });
          }
        }
      }, 400);
    });
  }
})();
