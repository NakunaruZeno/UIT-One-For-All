document.addEventListener('DOMContentLoaded', () => {
    const userInp = document.getElementById('username');
    const passInp = document.getElementById('password');
    const intervalInp = document.getElementById('sync-interval');
    const saveBtn = document.getElementById('btn-save');
    const syncBtn = document.getElementById('btn-sync');
    const tkbBtn = document.getElementById('btn-tkb');
    const statusDiv = document.getElementById('status');

    chrome.storage.local.get(['uit_user', 'uit_pass', 'sync_interval'], (res) => {
        if (res.uit_user) userInp.value = res.uit_user;
        if (res.uit_pass) passInp.value = atob(res.uit_pass); 
        intervalInp.value = res.sync_interval || 3;
    });

    saveBtn.addEventListener('click', () => {
        const u = userInp.value.trim();
        const p = passInp.value.trim();
        const interval = parseInt(intervalInp.value) || 3;
        
        if (u && p) {
            chrome.storage.local.set({ uit_user: u, uit_pass: btoa(p), sync_interval: interval }, () => {
                // Báo cho background cập nhật lại báo thức
                chrome.runtime.sendMessage({ action: "updateAlarm", interval: interval });
                statusDiv.innerText = "Đã lưu cài đặt!";
                statusDiv.style.color = "#a6e3a1";
                statusDiv.style.display = 'block';
                setTimeout(() => statusDiv.style.display = 'none', 2000);
            });
        }
    });

    syncBtn.addEventListener('click', () => {
        const u = userInp.value.trim();
        const p = passInp.value.trim();
        if (!u || !p) {
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

    // Đã đổi lại thành mở Tab mới thay vì mở cửa sổ Window
    tkbBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    });
});