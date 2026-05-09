let currentViewDate = new Date(); 

function getMonday(d) {
    d = new Date(d);
    var day = d.getDay(), diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-prev').addEventListener('click', () => changeWeek(-7));
    document.getElementById('btn-next').addEventListener('click', () => changeWeek(7));
    
    document.getElementById('btn-clear-alerts').addEventListener('click', () => {
        chrome.storage.local.set({ tkb_alerts: [] });
        document.getElementById('alert-container').style.display = 'none';
    });

    renderTKB();
    renderAlerts();
});

function changeWeek(days) {
    currentViewDate.setDate(currentViewDate.getDate() + days);
    renderTKB();
}

function renderAlerts() {
    chrome.storage.local.get(['tkb_alerts'], (res) => {
        if (res.tkb_alerts && res.tkb_alerts.length > 0) {
            document.getElementById('alert-container').style.display = 'block';
            const ul = document.getElementById('alert-list');
            ul.innerHTML = '';
            res.tkb_alerts.forEach(alert => {
                ul.innerHTML += `<li><a href="${alert.link}" target="_blank">${alert.title}</a> (${alert.courseName})</li>`;
            });
        }
    });
}

function renderTKB() {
    const monday = getMonday(currentViewDate);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const formatDate = (date) => `${date.getDate().toString().padStart(2,'0')}/${(date.getMonth()+1).toString().padStart(2,'0')}/${date.getFullYear()}`;
    document.getElementById('week-display').innerText = `Tuần: ${formatDate(monday)} -> ${formatDate(sunday)}`;

    chrome.storage.local.get(['saved_tkb_ics'], (res) => {
        const events = res.saved_tkb_ics || [];
        const container = document.getElementById('dynamic-classes');
        container.innerHTML = ''; 

        events.forEach(ev => {
            const evStart = new Date(ev.startDate);
            const evUntil = new Date(ev.untilDate);
            const evMonday = getMonday(evStart);
            
            const diffTime = monday.getTime() - evMonday.getTime();
            const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));

            if (diffWeeks >= 0 && monday <= evUntil && (diffWeeks % ev.interval === 0)) {
                
                if (!ev.isMakeup && !ev.isCancelled) {
                    const eventDate = new Date(monday);
                    eventDate.setDate(monday.getDate() + (ev.dayOfWeek === 8 ? 6 : ev.dayOfWeek - 2));
                    const eventDateStr = `${eventDate.getFullYear()}-${(eventDate.getMonth()+1).toString().padStart(2,'0')}-${eventDate.getDate().toString().padStart(2,'0')}`;

                    const baseEvTitle = ev.title.split('(')[0].trim();
                    const isCancelledToday = events.some(c => 
                        c.isCancelled && 
                        c.startDate === eventDateStr && 
                        c.title.includes(baseEvTitle)
                    );
                    
                    if (isCancelledToday) return; 
                }

                let cardClass = 'class-card';
                if (ev.isMakeup) cardClass += ' makeup-card';
                else if (ev.isCancelled) cardClass += ' cancelled-card';
                else if (ev.title.includes('.1') || ev.fullDesc.includes('HT1') || ev.fullDesc.includes('TH')) cardClass += ' ht1-card';

                const parts = ev.title.split(' - ');
                const courseName = parts[0];
                const room = parts.length > 1 ? parts[1] : (ev.fullDesc.includes('Phòng:') ? ev.fullDesc : "");

                const gridCol = ev.dayOfWeek; 
                let startRow = ev.startTiet + 1;
                if (ev.startTiet === 0) startRow = 11; 
                
                container.innerHTML += `
                    <div class="${cardClass}" style="grid-column: ${gridCol}; grid-row: ${startRow} / span ${ev.spanTiet}; z-index: 10;">
                        <div class="class-title">${courseName}</div>
                        <div class="class-room">${room}</div>
                        <div style="margin-top: 4px; font-size: 0.8em;">${ev.teacher}</div>
                    </div>
                `;
            }
        });
    });
}