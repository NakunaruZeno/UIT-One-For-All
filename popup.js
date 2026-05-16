// ==========================================
// MODULE BẢO MẬT: MÃ HÓA AES-GCM 256-BIT
// ==========================================
function bufferToBase64(buf) {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return window.btoa(binary);
}

function base64ToBuffer(base64) {
    const binary_string = window.atob(base64);
    const bytes = new Uint8Array(binary_string.length);
    for (let i = 0; i < binary_string.length; i++) bytes[i] = binary_string.charCodeAt(i);
    return bytes.buffer;
}

async function getOrCreateKey() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['aes_key'], async (res) => {
            if (res.aes_key) {
                const key = await crypto.subtle.importKey("jwk", res.aes_key, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
                resolve(key);
            } else {
                const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
                const jwk = await crypto.subtle.exportKey("jwk", key);
                chrome.storage.local.set({ aes_key: jwk }, () => resolve(key));
            }
        });
    });
}

async function encryptPassword(password) {
    const key = await getOrCreateKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(password);
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, encoded);
    return { cipher: bufferToBase64(encrypted), iv: bufferToBase64(iv) };
}

// ==========================================
// XỬ LÝ GIAO DIỆN POPUP
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const userInp = document.getElementById('username');
    const passInp = document.getElementById('password');
    const intervalInp = document.getElementById('sync-interval');
    const saveBtn = document.getElementById('btn-save');
    const syncBtn = document.getElementById('btn-sync');
    const tkbBtn = document.getElementById('btn-tkb');
    const statusDiv = document.getElementById('status');

    // Nạp dữ liệu cấu hình cũ (Không hiển thị mật khẩu ra ngoài để bảo mật)
    chrome.storage.local.get(['uit_user', 'sync_interval', 'uit_pass_cipher'], (res) => {
        if (res.uit_user) userInp.value = res.uit_user;
        if (res.uit_pass_cipher) passInp.placeholder = "******** (Đã mã hóa an toàn)";
        intervalInp.value = res.sync_interval || 3;
    });

    saveBtn.addEventListener('click', async () => {
        const u = userInp.value.trim();
        const p = passInp.value.trim();
        const interval = parseInt(intervalInp.value) || 3;
        
        if (u) {
            let dataToSave = { uit_user: u, sync_interval: interval };
            
            // Nếu người dùng có nhập mật khẩu mới thì mới mã hóa và lưu
            if (p) {
                const encryptedData = await encryptPassword(p);
                dataToSave.uit_pass_cipher = encryptedData.cipher;
                dataToSave.uit_pass_iv = encryptedData.iv;
                
                // Xóa mật khẩu Base64 cũ (nếu có) để dọn dẹp
                chrome.storage.local.remove(['uit_pass']); 
            }

            chrome.storage.local.set(dataToSave, () => {
                chrome.runtime.sendMessage({ action: "updateAlarm", interval: interval });
                statusDiv.innerText = "Đã lưu & mã hóa an toàn!";
                statusDiv.style.color = "#a6e3a1";
                statusDiv.style.display = 'block';
                setTimeout(() => statusDiv.style.display = 'none', 2000);
            });
        }
    });

    syncBtn.addEventListener('click', () => {
        const u = userInp.value.trim();
        if (!u) {
            statusDiv.innerText = "Vui lòng Lưu tài khoản trước!";
            statusDiv.style.color = "#f38ba8";
            statusDiv.style.display = 'block';
            setTimeout(() => statusDiv.style.display = 'none', 2000);
            return;
        }

        chrome.runtime.sendMessage({ action: "forceSync" });
        statusDiv.innerText = "Đang đồng bộ ngầm...";
        statusDiv.style.color = "#fab387";
        statusDiv.style.display = 'block';
        setTimeout(() => statusDiv.style.display = 'none', 3000);
    });

    tkbBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    });
});