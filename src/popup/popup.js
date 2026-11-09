/**
 * UIT One For All — Popup Control Center Script
 */
document.addEventListener('DOMContentLoaded', () => {
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const btnTogglePass = document.getElementById('btn-toggle-pass');
  const iconEye = document.getElementById('icon-eye');
  const iconEyeOff = document.getElementById('icon-eye-off');
  const btnSave = document.getElementById('btn-save-account');
  const btnSync = document.getElementById('btn-sync-now');
  const syncIcon = document.getElementById('sync-icon');
  const syncLabel = document.getElementById('sync-btn-label');
  const btnDashboard = document.getElementById('btn-open-dashboard');
  const statusMsg = document.getElementById('status-msg');
  const statusDot = document.getElementById('status-dot');
  const accountStatusText = document.getElementById('account-status-text');
  const tkbBadge = document.getElementById('tkb-validity-badge');
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const iconSun = document.getElementById('icon-sun');
  const iconMoon = document.getElementById('icon-moon');

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      iconSun.style.display = 'none';
      iconMoon.style.display = 'block';
    } else {
      document.documentElement.removeAttribute('data-theme');
      iconSun.style.display = 'block';
      iconMoon.style.display = 'none';
    }
  }

  function showStatus(text, type = 'info') {
    statusMsg.textContent = text;
    statusMsg.className = `feedback-msg ${type}`;
  }

  // Load saved state
  chrome.storage.local.get(
    ['uit_account', 'portal_student_info', 'tkb_EndDate', 'tkb_scraped_until', 'uit_theme'],
    async (res) => {
      applyTheme(res.uit_theme || 'dark');

      const acc = await UITCrypto.getDecryptedAccount();
      if (acc && acc.username) {
        usernameInput.value = acc.username;
        passwordInput.value = acc.password || '';

        statusDot.className = 'status-dot online';
        accountStatusText.textContent = `MSSV: ${acc.username}`;
      } else if (res.portal_student_info && res.portal_student_info.mssv) {
        usernameInput.value = res.portal_student_info.mssv;
        statusDot.className = 'status-dot online';
        accountStatusText.textContent = `MSSV: ${res.portal_student_info.mssv}`;
      } else {
        statusDot.className = 'status-dot warning';
        accountStatusText.textContent = 'Chưa cấu hình MSSV';
      }

      const endDateVal = res.tkb_EndDate || res.tkb_scraped_until;
      if (endDateVal) {
        const endDate = new Date(endDateVal);
        const dateStr = endDate.toLocaleDateString('vi-VN');
        if (Date.now() > endDateVal) {
          tkbBadge.textContent = `Hết hạn ${dateStr}`;
          tkbBadge.className = 'status-badge err mono';
        } else {
          tkbBadge.textContent = `TKB → ${dateStr}`;
          tkbBadge.className = 'status-badge ok mono';
        }
      } else {
        tkbBadge.textContent = 'Chưa có TKB';
        tkbBadge.className = 'status-badge warn mono';
      }
    }
  );

  // Theme toggle
  btnThemeToggle.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const nextTheme = isLight ? 'dark' : 'light';
    applyTheme(nextTheme);
    chrome.storage.local.set({ uit_theme: nextTheme });
  });

  // Password visibility toggle
  btnTogglePass.addEventListener('click', () => {
    const isPass = passwordInput.type === 'password';
    passwordInput.type = isPass ? 'text' : 'password';
    iconEye.style.display = isPass ? 'none' : 'block';
    iconEyeOff.style.display = isPass ? 'block' : 'none';
  });

  // Save credentials
  btnSave.addEventListener('click', async () => {
    const user = usernameInput.value.trim();
    const pass = passwordInput.value.trim();

    if (!user || !pass) {
      showStatus('Vui lòng nhập đầy đủ MSSV và mật khẩu.', 'error');
      return;
    }

    try {
      const encryptedPassword = await UITCrypto.encryptPassword(pass);
      chrome.storage.local.set(
        {
          uit_account: {
            username: user,
            password: encryptedPassword
          }
        },
        () => {
          statusDot.className = 'status-dot online';
          accountStatusText.textContent = `MSSV: ${user}`;
          showStatus('Đã mã hóa AES-256 và lưu tài khoản thành công.', 'success');
        }
      );
    } catch (e) {
      console.error(e);
      showStatus('Lỗi khi mã hóa mật khẩu.', 'error');
    }
  });

  // Trigger sync
  btnSync.addEventListener('click', () => {
    btnSync.disabled = true;
    syncIcon.classList.add('spin');
    syncLabel.textContent = 'Đang đồng bộ dữ liệu...';
    showStatus('Đang mở phiên đồng bộ ngầm với UIT Portal...', 'info');

    chrome.runtime.sendMessage({ action: 'triggerCheck' }, (response) => {
      btnSync.disabled = false;
      syncIcon.classList.remove('spin');
      syncLabel.textContent = 'Đồng bộ Điểm, TKB & Lịch thi';

      if (response && response.status === 'no_account') {
        showStatus('Hãy lưu tài khoản MSSV trước khi đồng bộ.', 'error');
      } else if (response && response.status === 'decrypt_error') {
        showStatus('Không giải mã được mật khẩu. Vui lòng lưu lại.', 'error');
      } else {
        showStatus('Đang quét dữ liệu ngầm (~15s). Sẽ có thông báo khi xong.', 'success');
      }
    });
  });

  // Open Dashboard
  btnDashboard.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
  });
});

