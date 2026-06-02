/**
 * ============================================================
 * UIT One For All — Content Script
 * ============================================================
 * Script chạy trên các trang web UIT, xử lý:
 *  - Tự động đăng nhập (Drupal, Courses, ĐKHP React)
 *  - Cào điểm, lịch thi, thời khóa biểu (ICS)
 *  - Cào thông báo nghỉ/bù từ DAA và OEP
 *  - Tự động đăng ký học phần (bypass Chakra UI / React SPA)
 *  - Tự động khảo sát (Auto Survey)
 * ============================================================
 */
(async function () {
  'use strict';

  const host = location.hostname;
  const path = window.location.pathname;

  // Kiểm tra tab có phải được mở bởi auto_check không
  const isAutoCheck = location.href.includes('source=auto_check')
    || sessionStorage.getItem('uit_auto_check') === 'true';
  if (location.href.includes('source=auto_check')) {
    sessionStorage.setItem('uit_auto_check', 'true');
  }

  const isAutoCheckExam = location.href.includes('source=auto_check_exam');

  // ============================================================
  // MODULE BẢO MẬT: GIẢI MÃ MẬT KHẨU AES-GCM
  // ============================================================

  // Chuyển đổi chuỗi Base64 về ArrayBuffer
  function base64ToBuffer(base64) {
    const binary_string = window.atob(base64);
    const bytes = new Uint8Array(binary_string.length);
    for (let i = 0; i < binary_string.length; i++) {
      bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
  }

  // Lấy khóa AES-GCM đã lưu trong storage (trả về null nếu chưa có)
  async function getAesKey() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['aes_key'], async (res) => {
        if (res.aes_key) {
          const key = await crypto.subtle.importKey(
            "jwk",
            res.aes_key,
            { name: "AES-GCM" },
            true,
            ["encrypt", "decrypt"]
          );
          resolve(key);
        } else {
          resolve(null);
        }
      });
    });
  }

  // Giải mã mật khẩu từ cipher và IV đã mã hóa AES-GCM
  async function decryptPassword(cipherBase64, ivBase64) {
    const key = await getAesKey();
    if (!key) return null;
    try {
      const encryptedBytes = base64ToBuffer(cipherBase64);
      const ivBytes = base64ToBuffer(ivBase64);
      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBytes },
        key,
        encryptedBytes
      );
      return new TextDecoder().decode(decrypted);
    } catch (e) {
      console.error("Lỗi giải mã mật khẩu", e);
      return null;
    }
  }

  // Lấy thông tin tài khoản UIT (hỗ trợ cả format AES-GCM mới và Base64 cũ)
  async function getAccount() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['uit_user', 'uit_pass_cipher', 'uit_pass_iv', 'uit_pass'], async (res) => {
        if (res.uit_user && res.uit_pass_cipher && res.uit_pass_iv) {
          const pass = await decryptPassword(res.uit_pass_cipher, res.uit_pass_iv);
          resolve({ username: res.uit_user, password: pass });
        } else if (res.uit_user && res.uit_pass) {
          resolve({ username: res.uit_user, password: atob(res.uit_pass) });
        } else {
          resolve(null);
        }
      });
    });
  }

  // ============================================================
  // UTILITIES: TƯƠNG TÁC VỚI REACT / CHAKRA UI
  // ============================================================

  // Gán giá trị cho input tương thích React controlled component (dùng native setter)
  function setNativeValue(element, value) {
    try {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      ).set;
      nativeSetter.call(element, value);
    } catch (e) {
      element.value = value;
    }

    if (element._valueTracker) element._valueTracker.setValue('');
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Tick/untick checkbox tương thích React controlled component
  function setReactCheckbox(checkbox, checked = true) {
    if (checkbox.checked === checked) return true;
    try {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'checked'
      ).set;
      nativeSetter.call(checkbox, checked);
    } catch (e) {
      checkbox.checked = checked;
    }
    if (checkbox._valueTracker) checkbox._valueTracker.setValue(String(!checked));
    checkbox.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    checkbox.dispatchEvent(new Event('input', { bubbles: true }));
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    return checkbox.checked === checked;
  }

  // Mô phỏng click chuột thật (dispatch đầy đủ pointer/mouse events để bypass Chakra/React)
  function simulateHumanClick(element) {
    element.scrollIntoView({ block: 'center', behavior: 'instant' });

    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;

    const commonProps = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: x,
      clientY: y,
      screenX: window.screenX + x,
      screenY: window.screenY + y,
      button: 0,
      buttons: 1,
    };

    const pointerProps = {
      ...commonProps,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      width: 1,
      height: 1
    };

    // Chuỗi event giống trình tự trình duyệt khi con người click chuột
    element.dispatchEvent(new PointerEvent('pointerover', pointerProps));
    element.dispatchEvent(new PointerEvent('pointerenter', { ...pointerProps, bubbles: false }));
    element.dispatchEvent(new MouseEvent('mouseover', commonProps));
    element.dispatchEvent(new MouseEvent('mouseenter', { ...commonProps, bubbles: false }));

    element.dispatchEvent(new PointerEvent('pointerdown', pointerProps));
    element.dispatchEvent(new MouseEvent('mousedown', commonProps));

    if (element.focus) element.focus();

    element.dispatchEvent(new PointerEvent('pointerup', pointerProps));
    element.dispatchEvent(new MouseEvent('mouseup', commonProps));

    element.dispatchEvent(new MouseEvent('click', commonProps));

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Click checkbox Chakra: thử nhiều cách fallback (simulateHumanClick → parent → native → setReactCheckbox)
  function clickChakraCheckbox(checkbox) {
    const wasBefore = checkbox.checked;

    simulateHumanClick(checkbox);
    if (checkbox.checked !== wasBefore) return true;

    const parent = checkbox.closest('div.px-1, label, div');
    if (parent && parent !== checkbox) {
      simulateHumanClick(parent);
      if (checkbox.checked !== wasBefore) return true;
    }

    checkbox.click();
    if (checkbox.checked !== wasBefore) return true;

    return setReactCheckbox(checkbox, !wasBefore);
  }

  // Chờ 2 animation frames liên tiếp để React commit DOM changes
  function waitForReactFrame() {
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }

  // Tìm input element dựa trên text của label liên kết (dùng cho form ĐKHP React)
  function findDkhpInputByLabel(labelText) {
    const labels = [...document.querySelectorAll('label')];
    const targetLabel = labels.find((l) => l.textContent.includes(labelText));
    if (targetLabel) {
      const id = targetLabel.getAttribute('for');
      if (id) return document.getElementById(id);
    }
    return null;
  }

  // ============================================================
  // MODULE ĐĂNG NHẬP: DRUPAL CMS (student, daa, oep)
  // ============================================================

  // Tự động đăng nhập trên các trang Drupal CMS (điền tài khoản, giải captcha, submit)
  async function runDrupalLogin(loginForm) {
    const userInput = loginForm.querySelector('input[name="name"], #edit-name');
    const passInput = loginForm.querySelector('input[name="pass"], #edit-pass');
    const captchaInput = loginForm.querySelector('input[name="captcha_response"], #edit-english-captcha-answer');
    const submitBtn = loginForm.querySelector('input[type="submit"], button[type="submit"]');

    if (!userInput || !passInput || !submitBtn) return;

    const acc = await getAccount();
    if (!acc) return;

    userInput.value = acc.username;
    passInput.value = acc.password;

    // Giải captcha (nếu có) rồi submit. Captcha UIT dùng text trong alt ảnh
    const solveCaptchaAndLogin = () => {
      if (!captchaInput) {
        setTimeout(() => {
          submitBtn.click();
        }, 600);
        return true;
      }

      const img = loginForm.querySelector('.english-captcha-image img');
      if (img) {
        const alt = img.getAttribute('alt');
        if (alt && alt.includes(':')) {
          captchaInput.value = alt.split(':')[1].trim();
          setTimeout(() => {
            submitBtn.click();
          }, 600);
          return true;
        }
      }
      return false;
    };

    // Thử giải captcha ngay, nếu chưa load xong thì poll mỗi 500ms (tối đa 20 lần)
    if (!solveCaptchaAndLogin()) {
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        if (solveCaptchaAndLogin() || attempts > 20) {
          clearInterval(interval);
        }
      }, 500);
    }
  }

  // Tự động đăng nhập trang Courses (Moodle)
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

  // ============================================================
  // MODULE ĐKHP TỰ ĐỘNG
  // ============================================================

  // Chờ selector xuất hiện trong DOM (MutationObserver + timeout)
  function waitForSelector(selector, timeout = 5000, waitReact = false) {
    return new Promise((resolve) => {
      const found = document.querySelector(selector);
      if (found) {
        if (waitReact) {
          waitForReactFrame().then(() => resolve(found));
        } else {
          resolve(found);
        }
        return;
      }

      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          obs.disconnect();
          if (waitReact) {
            waitForReactFrame().then(() => resolve(el));
          } else {
            resolve(el);
          }
        }
      });
      obs.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => {
        obs.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  // Tự động đăng nhập trang ĐKHP (React SPA, dùng setNativeValue để tương thích React)
  async function runDkhpLogin() {
    const passInp = document.querySelector('input[type="password"]');
    const userInp = findDkhpInputByLabel('Mã sinh viên')
      || findDkhpInputByLabel('sinh viên')
      || document.querySelector('input[type="text"]');
    const submitBtn = document.querySelector('button[type="submit"]');

    if (!userInp || !passInp || !submitBtn) {
      console.log('%c[ĐKHP] Không tìm thấy form đăng nhập.', 'color:red');
      return;
    }

    const acc = await getAccount();
    if (!acc) {
      console.log('%c[ĐKHP] Chưa có tài khoản trong extension. Vào popup để nhập.', 'color:red');
      return;
    }

    // Nhập user → chờ React → nhập pass → chờ React → submit
    setNativeValue(userInp, acc.username);
    await waitForReactFrame();
    await new Promise((r) => setTimeout(r, 100));
    setNativeValue(passInp, acc.password);
    await waitForReactFrame();
    await new Promise((r) => setTimeout(r, 300));
    submitBtn.click();
    console.log('%c[ĐKHP] Đã tự động đăng nhập.', 'font-weight:bold; color:green;');

    // Retry: nếu sau 3s vẫn còn trên trang login → click lại
    setTimeout(() => {
      const stillLogin = document.querySelector('input[type="password"]');
      const stillBtn = document.querySelector('button[type="submit"]');
      if (stillLogin && stillBtn) {
        console.log('%c[ĐKHP] Retry submit login...', 'color:orange;');
        stillBtn.click();
      }
    }, 3000);
  }

  // Chọn các lớp trong bảng ĐKHP theo danh sách mã lớp, tick checkbox, nhấn "Đăng ký"
  function runDkhpSelectCourses(coursesString) {
    let selectedCount = 0;
    try {
      const listMonDangKy = coursesString.trim().split('\n').map((it) => it.trim()).filter(Boolean);
      console.log('%c[ĐKHP] ═══════════════════════════════════════', 'color:cyan;');
      console.log('%c[ĐKHP] Danh sách mã lớp cần đăng ký:', 'color:cyan; font-weight:bold;', listMonDangKy);

      const allCb = document.querySelectorAll('input[type="checkbox"]');
      console.log(`%c[ĐKHP] Tổng checkbox trên trang: ${allCb.length}`, 'color:#aaa;');
      allCb.forEach((cb, i) => {
        const parentHTML = (cb.parentElement?.outerHTML || '').substring(0, 120);
        console.log(`%c[ĐKHP]   checkbox[${i}]: class="${cb.className}" checked=${cb.checked} | parent: ${parentHTML}`, 'color:#666;');
      });

      const allRows = [...document.querySelectorAll('tr, [role="row"]')];
      console.log(`%c[ĐKHP] Tổng dòng (tr/row): ${allRows.length}`, 'color:#aaa;');

      allRows.forEach((row, rowIdx) => {
        const cells = [...row.querySelectorAll('td, [role="gridcell"]')];
        if (cells.length === 0) return;

        const cellTexts = cells.map((c) => (c.textContent || '').trim()).filter(Boolean);

        const matchedCode = listMonDangKy.find((monCode) => {
          return cells.some((cell) => {
            const text = (cell.textContent || '').trim();
            return text === monCode || (text.length < 50 && text.includes(monCode));
          });
        });

        if (matchedCode) {
          console.log(`%c[ĐKHP] ✔ Dòng ${rowIdx} khớp mã "${matchedCode}": [${cellTexts.slice(0, 5).join(' | ')}]`, 'color:yellow; font-weight:bold;');

          let checkbox = row.querySelector('input[type="checkbox"]');
          if (!checkbox) {
            const cbWrapper = row.querySelector('div.px-1, div[class*="px"]');
            if (cbWrapper) checkbox = cbWrapper.querySelector('input[type="checkbox"]');
          }

          if (checkbox) {
            console.log(`%c[ĐKHP]   → Tìm thấy checkbox: class="${checkbox.className}" checked=${checkbox.checked}`, 'color:#aaa;');

            if (!checkbox.checked) {
              const success = clickChakraCheckbox(checkbox);
              if (success) {
                selectedCount++;
                console.log(`%c[ĐKHP]   ✓ ĐÃ CHECK thành công! (checked=${checkbox.checked})`, 'color:lime; font-weight:bold; font-size:14px;');
              } else {
                console.log(`%c[ĐKHP]   ✗ KHÔNG CHECK được (checked=${checkbox.checked})`, 'color:red; font-weight:bold;');
              }
            } else {
              selectedCount++;
              console.log('%c[ĐKHP]   ✓ Đã được chọn sẵn', 'color:#6cf;');
            }
          } else {
            console.log(`%c[ĐKHP]   ⚠ KHÔNG TÌM THẤY checkbox trong dòng này!`, 'color:red;');
            console.log(`%c[ĐKHP]   innerHTML: ${row.innerHTML.substring(0, 200)}`, 'color:#666;');
          }
        }
      });

      console.log(`%c[ĐKHP] ═══ KẾT QUẢ: ${selectedCount} lớp được chọn ═══`, 'color:cyan; font-weight:bold;');

      if (selectedCount > 0) {
        setTimeout(() => {
          const registerBtn = document.querySelector('button.css-kyhdse, button.chakra-button.css-kyhdse')
            || [...document.querySelectorAll('button.chakra-button, button')].find((btn) => {
              const txt = (btn.textContent || '').toLowerCase();
              return txt.includes('đăng ký') && !txt.includes('hủy');
            });

          if (registerBtn) {
            console.log('%c[ĐKHP] Nhấn nút: ' + registerBtn.textContent.trim(), 'font-weight:bold; color:blue; font-size:14px;');
            simulateHumanClick(registerBtn);

            // Tự động xác nhận modal
            setTimeout(() => {
              const confirmBtn = [...document.querySelectorAll('button, [role="dialog"] button')].find((btn) =>
                /xác nhận|ok|đồng ý|confirm|có/i.test(btn.textContent)
              );
              if (confirmBtn) {
                simulateHumanClick(confirmBtn);
                console.log('%c[ĐKHP] ✓ Đã xác nhận modal!', 'font-weight:bold; color:blue;');
              }
              setTimeout(() => {
                sessionStorage.removeItem('dkhp_retry_count');
                sessionStorage.removeItem('dkhp_reloaded');
              }, 3000);
            }, 2000);
          } else {
            console.log('%c[ĐKHP] ⚠ Không tìm thấy nút đăng ký.', 'font-weight:bold; color:orange;');
            document.querySelectorAll('button').forEach((btn, i) => {
              console.log(`%c[ĐKHP]   button[${i}]: class="${btn.className}" text="${btn.textContent.trim().substring(0, 50)}"`, 'color:#666;');
            });
          }
        }, 800);
      }
    } catch (e) {
      console.log('%c[ĐKHP] Lỗi: ' + e.message, 'font-weight:bold; color:red;');
      console.error(e);
    }
    return selectedCount;
  }

  // ============================================================
  // MODULE CÀO ĐIỂM & LỊCH THI
  // ============================================================

  // Cào kết quả học tập, so sánh với điểm cũ, gửi notification nếu có thay đổi
  async function checkGrades() {
    if (!path.includes('/sinhvien/kqhoctap')) return;

    const rows = document.querySelectorAll('table[bordercolor="#000000"] tr');
    let currentGrades = [];
    let currentSemester = "Chưa xác định";

    const cleanText = (text) => text
      ? text.replace(/&nbsp;/g, '').replace(/[\u00A0\s]+/g, ' ').trim()
      : "";

    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');

      if (cells.length === 1 && cells[0].hasAttribute('colspan')) {
        currentSemester = cleanText(cells[0].innerText);
      }

      if (cells.length >= 10
        && cells[1].innerText.trim() !== ""
        && !cells[2].innerText.includes("Trung bình")) {
        currentGrades.push({
          hocKy: currentSemester,
          maHP: cleanText(cells[1].innerText),
          tenHP: cleanText(cells[2].innerText),
          tc: cleanText(cells[3].innerText),
          diemQT: cleanText(cells[4].innerText),
          diemGK: cleanText(cells[5].innerText),
          diemTH: cleanText(cells[6].innerText),
          diemCK: cleanText(cells[7].innerText),
          diemHP: cleanText(cells[8].innerText),
          ghiChu: cleanText(cells[9].innerText)
        });
      }
    });

    chrome.storage.local.get(['saved_grades'], (res) => {
      const oldGrades = res.saved_grades || [];
      let hasRealChanges = false;

      if (oldGrades.length > 0 && currentGrades.length > 0) {
        const oldMap = {};
        oldGrades.forEach((g) => {
          oldMap[g.hocKy + "_" + g.maHP] = g;
        });

        for (const curr of currentGrades) {
          const uniqueKey = curr.hocKy + "_" + curr.maHP;
          const old = oldMap[uniqueKey];
          if (!old
            || old.diemQT !== curr.diemQT
            || old.diemGK !== curr.diemGK
            || old.diemTH !== curr.diemTH
            || old.diemCK !== curr.diemCK
            || old.diemHP !== curr.diemHP) {
            hasRealChanges = true;
            break;
          }
        }
      }

      if (hasRealChanges) {
        chrome.runtime.sendMessage({
          action: "notifyUpdates",
          title: "Cập nhật bảng điểm UIT!",
          content: "Vừa có điểm mới được cập nhật trên trường."
        });
      }

      if (currentGrades.length > 0) {
        chrome.storage.local.set({ saved_grades: currentGrades }, () => {
          cleanUpTab();
        });
      } else {
        cleanUpTab();
      }
    });
  }

  // Cào lịch thi, so sánh với lịch cũ, gửi notification nếu có lịch mới
  async function checkExamsTab() {
    if (!path.includes('/sinhvien/lichhoc/lichthi')) return;

    const rows = document.querySelectorAll('table tr');
    let currentExams = [];

    rows.forEach((row) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 8
        && cells[1].innerText.trim() !== ""
        && !cells[0].innerText.includes("Hiện tại bạn")) {
        currentExams.push({
          stt: cells[0].innerText.trim(),
          maMH: cells[1].innerText.trim(),
          maLop: cells[2].innerText.trim(),
          caThi: cells[3].innerText.trim(),
          thuThi: cells[4].innerText.trim(),
          ngayThi: cells[5].innerText.trim(),
          phongThi: cells[6].innerText.trim(),
          ghiChu: cells[7].innerText.trim()
        });
      }
    });

    chrome.storage.local.get(['saved_exams'], (res) => {
      const oldExams = res.saved_exams || [];
      let hasNew = false;

      if (oldExams.length > 0 && currentExams.length > 0) {
        const oldExamsSet = new Set(oldExams.map((e) => e.maLop + "_" + e.ngayThi));
        for (const ex of currentExams) {
          if (!oldExamsSet.has(ex.maLop + "_" + ex.ngayThi)) {
            hasNew = true;
            break;
          }
        }
      }

      if (hasNew) {
        chrome.runtime.sendMessage({
          action: "notifyUpdates",
          title: "Có Lịch thi mới!",
          content: "Phòng đào tạo vừa cập nhật Lịch thi của bạn."
        });
      }

      chrome.storage.local.set({ saved_exams: currentExams }, () => {
        chrome.runtime.sendMessage({ action: "examsUpdated" });
        setTimeout(() => {
          chrome.runtime.sendMessage({ action: "closeAutoTab" });
        }, 1000);
      });
    });
  }

  // ============================================================
  // MODULE CÀO THỜI KHÓA BIỂU (ICS) & THÔNG BÁO NGHỈ/BÙ
  // ============================================================

  // Cào TKB từ file ICS, thông báo nghỉ/bù từ DAA + OEP, lưu vào storage
  async function scrapeTKB_ICS() {
    if (!path.includes('/sinhvien/tkb')) return;

    const icsLinkElem = document.querySelector('a[href^="/ics/tkb/"]');
    if (!icsLinkElem) {
      cleanUpTab();
      return;
    }

    try {
      const baseEvents = [];

      // Fetch và parse file ICS
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
          let startTiet = 1;
          let spanTiet = 1;
          if (tietMatch) {
            const tStr = tietMatch[1];
            // Parse chuỗi tiết chính xác (xử lý cả tiết 10-16)
            const hasZero = tStr.includes('0');
            const tiets = [];

            if (!hasZero) {
              const singleDigits = [];
              for (let idx = 0; idx < tStr.length; idx++) {
                const d = parseInt(tStr[idx], 10);
                if (!isNaN(d) && d > 0) singleDigits.push(d);
              }
              const unique = new Set(singleDigits);
              if (unique.size === singleDigits.length) {
                tiets.push(...singleDigits);
              }
            }

            if (tiets.length === 0) {
              let idx = 0;
              while (idx < tStr.length) {
                if (idx + 1 < tStr.length) {
                  const twoDigit = parseInt(tStr.substring(idx, idx + 2), 10);
                  if (twoDigit >= 10 && twoDigit <= 16) {
                    tiets.push(twoDigit);
                    idx += 2;
                    continue;
                  }
                }
                const oneDigit = parseInt(tStr[idx], 10);
                if (!isNaN(oneDigit) && oneDigit > 0) {
                  tiets.push(oneDigit);
                }
                idx++;
              }
            }
            if (tiets.length > 0) {
              startTiet = Math.min(...tiets);
              spanTiet = tiets.length;
            }
          } else if (description.toLowerCase().includes("tối")) {
            startTiet = 11;
            spanTiet = 1;
          }

          const gvMatch = description.match(/Giảng viên: (.*?),/);

          let interval = 1;
          let untilDateStr = '2099-12-31';

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
            title: summary,
            fullDesc: description,
            teacher: gvMatch ? gvMatch[1] : "Chưa cập nhật",
            dayOfWeek: dayOfWeek,
            startTiet: startTiet,
            spanTiet: spanTiet,
            startDate: startDateStr,
            untilDate: untilDateStr,
            interval: interval
          });
        }
      }

      // Cào thông tin học bù từ các card trên trang TKB
      document.querySelectorAll('.tkb-card').forEach((card) => {
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
            title: `${titles[0].innerText.trim()} (BÙ)`,
            fullDesc: `Phòng: ${match[3] ? match[3].trim() : "Chưa cập nhật"}`,
            teacher: "Chi tiết trên web",
            dayOfWeek: dayOfWeek,
            startTiet: tiets[0],
            spanTiet: tiets.length,
            startDate: match[2],
            untilDate: match[2],
            interval: 1,
            isMakeup: true
          });
        }
      });

      // Cào thông báo nghỉ/bù từ DAA và OEP (fetch song song nhiều trang)
      const storageRes = await chrome.storage.local.get(['saved_custom_events', 'tkb_alerts', 'has_scraped_30_pages']);
      let customEvents = storageRes.saved_custom_events || [];
      let activeAlerts = storageRes.tkb_alerts || [];
      const maxPage = storageRes.has_scraped_30_pages ? 10 : 30;
      let hasNewAlerts = false;

      const fetchPromises = [];
      for (let page = 0; page <= maxPage; page++) {
        // DAA (fetch trực tiếp)
        fetchPromises.push(
          fetch(`https://daa.uit.edu.vn/thong-bao-nghi-bu?page=${page}`)
            .then((res) => res.text())
            .then((html) => ({ html: html, source: 'daa' }))
            .catch(() => ({ html: "", source: 'daa' }))
        );

        // OEP (qua background proxy do CORS)
        fetchPromises.push(
          new Promise((resolve) => {
            chrome.runtime.sendMessage(
              { action: 'fetchHtml', url: `https://oep.uit.edu.vn/vi/category/thong-bao-nghi-hoc-hoc-bu?page=${page}` },
              (res) => {
                resolve({ html: res ? res.html : "", source: "oep" });
              }
            );
          })
        );
      }

      const pagesHtml = await Promise.all(fetchPromises);
      const parser = new DOMParser();
      let matchedArticles = [];

      // Parse HTML và tìm bài viết liên quan đến môn đang học
      pagesHtml.forEach((pageData) => {
        if (!pageData || !pageData.html) return;
        const htmlString = pageData.html;
        const baseDomain = pageData.source === 'oep'
          ? 'https://oep.uit.edu.vn'
          : 'https://daa.uit.edu.vn';
        const doc = parser.parseFromString(htmlString, 'text/html');

        doc.querySelectorAll('article, .views-row').forEach((item) => {
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

          const matchedCourse = baseEvents.find((c) => {
            const baseCode = c.title.split(' - ')[0].trim();
            return baseCode === classCode;
          });

          if (matchedCourse) {
            const dateStr = `${dateMatchTitle[3]}-${dateMatchTitle[2].padStart(2, '0')}-${dateMatchTitle[1].padStart(2, '0')}`;
            matchedArticles.push({
              articleLink: articleLink,
              articleTitle: articleTitle,
              classCode: classCode,
              dateStr: dateStr,
              isMakeup: articleTitle.toLowerCase().includes("bù"),
              isCancelled: articleTitle.toLowerCase().includes("nghỉ"),
              rawText: item.innerText
            });
          }
        });
      });

      // Lấy chi tiết tiết/phòng từ bài viết gốc (nếu rawText chưa đủ)
      const detailPromises = matchedArticles.map(async (art) => {
        let roomMatch = art.rawText.match(/Phòng\s*:\s*([A-Za-z0-9.\-_]*)/i);
        let startTietMatch = art.rawText.match(/Tiết\s*bắt\s*đầu\s*:\s*(\d+)/i);
        let endTietMatch = art.rawText.match(/Tiết\s*kết\s*thúc\s*:\s*(\d+)/i);

        if (!startTietMatch || !endTietMatch) {
          try {
            let detailHtml = "";
            if (art.articleLink.includes("oep.uit.edu.vn")) {
              detailHtml = await new Promise((resolve) => {
                chrome.runtime.sendMessage(
                  { action: 'fetchHtml', url: art.articleLink },
                  (res) => resolve(res ? res.html : "")
                );
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
          } catch (e) {
            console.error("Không lấy được chi tiết bài: ", art.articleLink);
          }
        }

        if (startTietMatch && endTietMatch) {
          const uid = `${art.isMakeup ? 'BU' : 'NGHI'}_${art.classCode}_${art.dateStr}_${startTietMatch[1]}`;
          let dayOfWeek = new Date(art.dateStr).getDay() + 1;
          if (dayOfWeek === 1) dayOfWeek = 8;

          return {
            uid: uid,
            title: `${art.classCode} ${art.isMakeup ? '(BÙ)' : '(NGHỈ)'}`,
            fullDesc: art.isMakeup
              ? `Phòng: ${(roomMatch && roomMatch[1].trim() !== "") ? roomMatch[1].trim() : "Chưa cập nhật"}`
              : `Nghỉ học`,
            teacher: "Chi tiết trên web",
            dayOfWeek: dayOfWeek,
            startTiet: parseInt(startTietMatch[1], 10),
            spanTiet: parseInt(endTietMatch[1], 10) - parseInt(startTietMatch[1], 10) + 1,
            startDate: art.dateStr,
            untilDate: art.dateStr,
            interval: 1,
            isMakeup: art.isMakeup,
            isCancelled: art.isCancelled,
            articleLink: art.articleLink,
            articleTitle: art.articleTitle,
            classCode: art.classCode
          };
        }
        return null;
      });

      const processedEvents = (await Promise.all(detailPromises)).filter((e) => e !== null);

      // Lưu sự kiện mới vào storage, gửi notification nếu không phải lần quét đầu tiên
      processedEvents.forEach((ev) => {
        if (!customEvents.some((e) => e.uid === ev.uid)) {
          customEvents.push(ev);
          if (!activeAlerts.some((a) => a.link === ev.articleLink)) {
            activeAlerts.push({
              title: ev.articleTitle,
              link: ev.articleLink,
              courseName: ev.classCode
            });
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

    } catch (e) {
      console.error("Lỗi cào file TKB", e);
    } finally {
      cleanUpTab();
    }
  }

  // ============================================================
  // TIỆN ÍCH
  // ============================================================

  // Đóng tab hiện tại nếu đây là tab auto_check
  function cleanUpTab() {
    if (isAutoCheck || isAutoCheckExam) {
      sessionStorage.removeItem('uit_auto_check');
      setTimeout(() => chrome.runtime.sendMessage({ action: "closeAutoTab" }), 2000);
    }
  }

  // An toàn: tự đóng tab auto sau 15 giây phòng trường hợp script bị kẹt
  if (isAutoCheck || isAutoCheckExam) {
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "closeAutoTab" });
    }, 15000);
  }

  // ============================================================
  // MODULE TỰ ĐỘNG KHẢO SÁT (AUTO SURVEY)
  // ============================================================

  // Tự động điền và submit khảo sát survey.uit.edu.vn
  async function runAutoSurvey() {
    setTimeout(function () {
      let nextBtn = document.getElementById('movenextbtn');
      let submitBtn = document.getElementById('movesubmitbtn');
      let groupNameEl = document.querySelector('.group-name');

      if (!nextBtn && !submitBtn && !groupNameEl) {
        setTimeout(() => {
          chrome.runtime.sendMessage({ action: "closeAutoTab" });
        }, 1000);
        return;
      }

      if (!groupNameEl) {
        if (nextBtn) nextBtn.click();
        return;
      }

      let groupName = groupNameEl.innerText.trim();

      if (groupName === 'THÔNG TIN CHUNG') {
        document.querySelectorAll('label.answertext').forEach((label) => {
          if (label.innerText.includes('>80%') || label.innerText.includes('Trên 90%')) {
            let input = document.getElementById(label.getAttribute('for'));
            if (input && !input.checked) input.click();
          }
        });
        if (nextBtn) setTimeout(() => nextBtn.click(), 500);
      } else if (groupName === 'ĐÁNH GIÁ VỀ HOẠT ĐỘNG GIẢNG DẠY') {
        document.querySelectorAll('tr.answers-list').forEach((row) => {
          let options = row.querySelectorAll('input[type="radio"][title="3"], input[type="radio"][title="4"]');
          if (options.length > 0) {
            let opt = options[Math.floor(Math.random() * options.length)];
            if (!opt.checked) opt.click();
          }
        });
        if (nextBtn) setTimeout(() => nextBtn.click(), 500);
      } else if (groupName === 'Ý KIẾN KHÁC') {
        if (submitBtn) setTimeout(() => submitBtn.click(), 500);
      }
    }, 1000);
  }

  // ============================================================
  // ĐIỀU PHỐI CHÍNH: PHÂN LUỒNG XỬ LÝ THEO HOSTNAME
  // ============================================================

  if (host.includes("survey.uit.edu.vn")) {
    runAutoSurvey();

  } else if (host.includes("courses.uit.edu.vn")) {
    if (document.querySelector('#username') && document.querySelector('#password')) {
      runCoursesLogin();
    }

  } else if (host.includes("dkhp.uit.edu.vn")) {
    // ĐKHP TỰ ĐỘNG: Xử lý React SPA, Bypass Chakra UI
    console.log('%c[ĐKHP] ════════════════════════════════════════════', 'color:cyan;');
    console.log(`%c[ĐKHP] Content script loaded! host=${host}`, 'color:cyan; font-weight:bold;');

    // Click element tương thích React (mousedown → mouseup → click + fallback)
    function clickReactElement(el) {
      if (!el) return;
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      el.click();
    }

    // Check checkbox tương thích React controlled input (click + fallback native setter)
    function checkReactCheckbox(checkbox) {
      if (!checkbox || checkbox.checked) return;

      checkbox.click();

      setTimeout(() => {
        if (!checkbox.checked) {
          const nativeSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'checked'
          )?.set;
          if (nativeSetter) {
            nativeSetter.call(checkbox, true);
          } else {
            checkbox.checked = true;
          }
          checkbox.dispatchEvent(new Event('input', { bubbles: true }));
          checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, 50);
    }

    let isProcessingReg = false;

    // Monitor liên tục trạng thái trang ĐKHP (React SPA, không có page load event)
    setInterval(async () => {
      const currentPath = window.location.pathname;

      // 1. Xử lý trang Login
      if (!currentPath.includes('/reg') && !isProcessingReg) {
        const passInput = document.querySelector('input[type="password"]');
        const submitBtn = document.querySelector('button[type="submit"]');

        if (passInput && submitBtn) {
          if (!sessionStorage.getItem('dkhp_login_attempted')) {
            console.log('%c[ĐKHP] Phát hiện trang login, tự động đăng nhập...', 'font-weight:bold; color:#6cf;');
            sessionStorage.setItem('dkhp_login_attempted', 'true');
            sessionStorage.removeItem('dkhp_reloaded');
            sessionStorage.setItem('dkhp_auto_reg', 'true');
            await runDkhpLogin();
          }
        } else if (sessionStorage.getItem('dkhp_auto_reg') === 'true') {
          chrome.storage.local.get(['dkhp_enabled'], (res) => {
            if (res.dkhp_enabled) {
              console.log('%c[ĐKHP] Login xong, chuyển hướng sang trang đăng ký /app/reg...', 'font-weight:bold; color:#6cf;');
              window.location.href = 'https://dkhp.uit.edu.vn/app/reg';
            }
          });
        }
      }

      // 2. Xử lý trang Đăng ký môn học (/reg)
      if (currentPath.includes('/reg') && !isProcessingReg) {
        isProcessingReg = true;

        chrome.storage.local.get(['dkhp_enabled', 'dkhp_courses'], (res) => {
          if (!res.dkhp_enabled || !res.dkhp_courses) {
            console.log('%c[ĐKHP] ⚠ dkhp_enabled = false hoặc chưa thiết lập môn học → BỎ QUA', 'color:orange; font-weight:bold;');
            return;
          }

          // Reload trang 1 lần để đảm bảo dữ liệu môn học tải đầy đủ
          if (sessionStorage.getItem('dkhp_reloaded') !== 'true') {
            console.log('%c[ĐKHP] ► RELOAD trang 1 lần để đảm bảo tải đầy đủ dữ liệu môn học...', 'font-weight:bold; color:yellow; font-size:16px;');
            sessionStorage.setItem('dkhp_reloaded', 'true');
            setTimeout(() => location.reload(), 1500);
            return;
          }

          console.log('%c[ĐKHP] ► Trang đã sẵn sàng, chờ danh sách lớp xuất hiện...', 'font-weight:bold; color:lime; font-size:14px;');

          const listMonDangKy = res.dkhp_courses.trim().split('\n')
            .map((it) => it.trim().toUpperCase())
            .filter(Boolean);
          const maxWait = 30000;
          const startWait = Date.now();
          let done = false;
          let lastLogTime = 0;

          // Polling mỗi 500ms, chờ checkbox xuất hiện và khớp mã lớp
          const poll = setInterval(() => {
            if (done) {
              clearInterval(poll);
              return;
            }

            if (Date.now() - startWait >= maxWait) {
              clearInterval(poll);
              console.log('%c[ĐKHP] ✗ Hết 30s không tìm thấy lớp khớp. Thử reload trang.', 'font-weight:bold; color:red; font-size:14px;');
              const retries = parseInt(sessionStorage.getItem('dkhp_extra_retry') || '0');
              if (retries < 2) {
                sessionStorage.setItem('dkhp_extra_retry', String(retries + 1));
                location.reload();
              }
              return;
            }

            let selectedCount = 0;
            const allCheckboxes = [...document.querySelectorAll('input[type="checkbox"]')];
            let foundCheckboxes = allCheckboxes.length;

            allCheckboxes.forEach((checkbox) => {
              if (checkbox.closest('thead, th')) return;

              let rowContainer = checkbox.closest('tr') || checkbox.closest('[role="row"]');
              if (!rowContainer) {
                let parent = checkbox.parentElement;
                for (let i = 0; i < 5; i++) {
                  if (parent && parent.textContent && parent.textContent.trim().length > 15) {
                    rowContainer = parent;
                    break;
                  }
                  parent = parent ? parent.parentElement : null;
                }
              }

              if (rowContainer) {
                const rowText = (rowContainer.textContent || '').toUpperCase().replace(/\s+/g, ' ');

                const matchedCode = listMonDangKy.find((monCode) => {
                  const cleanMonCode = monCode.replace(/\s+/g, ' ');
                  return rowText.includes(cleanMonCode);
                });

                if (matchedCode) {
                  if (!checkbox.checked) {
                    checkReactCheckbox(checkbox);
                    selectedCount++;
                    console.log(`%c[ĐKHP]   ✓ Chọn thành công môn: ${matchedCode}`, 'color:lime; font-weight:bold;');
                  } else {
                    selectedCount++;
                  }
                }
              }
            });

            if (Date.now() - lastLogTime > 3000) {
              console.log(`%c[ĐKHP] Đang tìm kiếm mã lớp... (hiện có ${foundCheckboxes} checkboxes trên trang)`, 'color:#aaa;');
              lastLogTime = Date.now();
            }

            // Bấm nút đăng ký nếu đã chọn được môn
            if (selectedCount > 0) {
              done = true;
              clearInterval(poll);
              console.log(`%c[ĐKHP] ✓ Đã chọn được ${selectedCount} môn. Tiến hành đăng ký...`, 'font-weight:bold; color:lime; font-size:14px;');

              setTimeout(() => {
                const registerBtn = document.querySelector('button.css-kyhdse, button.chakra-button.css-kyhdse')
                  || [...document.querySelectorAll('button.chakra-button, button')].find((btn) => {
                    const txt = (btn.textContent || '').toLowerCase();
                    return txt.includes('đăng ký') && !txt.includes('hủy');
                  });

                if (registerBtn) {
                  console.log('%c[ĐKHP] Nhấn nút ĐĂNG KÝ: ' + registerBtn.textContent.trim(), 'font-weight:bold; color:blue; font-size:14px;');
                  clickReactElement(registerBtn);

                  // Xác nhận modal
                  setTimeout(() => {
                    const confirmBtn = [...document.querySelectorAll('button, [role="dialog"] button')].find((btn) =>
                      /xác nhận|ok|đồng ý|confirm|có/i.test(btn.textContent)
                    );
                    if (confirmBtn) {
                      clickReactElement(confirmBtn);
                      console.log('%c[ĐKHP] ✓ Đã xác nhận modal!', 'font-weight:bold; color:blue;');
                    }
                    setTimeout(() => {
                      sessionStorage.removeItem('dkhp_reloaded');
                      sessionStorage.removeItem('dkhp_extra_retry');
                    }, 3000);
                  }, 1500);
                } else {
                  console.log('%c[ĐKHP] ⚠ Không tìm thấy nút đăng ký.', 'font-weight:bold; color:orange;');
                }
              }, 500);
            }
          }, 500);
        });
      }
    }, 1000);

  } else if (host.includes("oep.uit.edu.vn")
    || host.includes("student.uit.edu.vn")
    || host.includes("daa.uit.edu.vn")) {
    // OEP / STUDENT / DAA: Đăng nhập & cào dữ liệu
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