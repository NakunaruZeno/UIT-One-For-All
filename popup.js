document.addEventListener('DOMContentLoaded', () => {
    const userInp = document.getElementById('username');
    const passInp = document.getElementById('password');
    const saveBtn = document.getElementById('btn-save');
    const tkbBtn = document.getElementById('btn-tkb');
    const statusDiv = document.getElementById('status');

    chrome.storage.local.get(['uit_user', 'uit_pass'], (res) => {
        if (res.uit_user) userInp.value = res.uit_user;
        if (res.uit_pass) passInp.value = atob(res.uit_pass); 
    });

    saveBtn.addEventListener('click', () => {
        const u = userInp.value.trim();
        const p = passInp.value.trim();
        if (u && p) {
            chrome.storage.local.set({ uit_user: u, uit_pass: btoa(p) }, () => {
                statusDiv.style.display = 'block';
                setTimeout(() => statusDiv.style.display = 'none', 2000);
            });
        }
    });

    tkbBtn.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
    });
});