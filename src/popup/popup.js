document.addEventListener('DOMContentLoaded', () => {
    const btnOpenOptions = document.getElementById('btnOpenOptions');
    const btnStart = document.getElementById('btnStart');
    const statusIcon = document.getElementById('statusIcon');
    const statusText = document.getElementById('statusText');
    const statusDesc = document.getElementById('statusDesc');
    const logArea = document.getElementById('log-area');
    const logList = document.getElementById('logList');

    // Open Options Page
    btnOpenOptions.addEventListener('click', () => {
        if (chrome.runtime.openOptionsPage) {
            chrome.runtime.openOptionsPage();
        } else {
            window.open(chrome.runtime.getURL('src/options/options.html'));
        }
    });

    // Start Organization (only if button exists)
    if (btnStart) {
        btnStart.addEventListener('click', async () => {
            // Check if API Key is set
            const { apiKey } = await chrome.storage.sync.get(['apiKey']);
            if (!apiKey) {
                alert('请先在设置页配置 API Key！');
                chrome.runtime.openOptionsPage();
                return;
            }

            // Update UI State
            updateStatus('scanning', '正在扫描书签...', '请稍候，正在读取您的书签数据。');
            btnStart.disabled = true;
            logArea.classList.remove('hidden');
            addLog('开始扫描书签...');

            try {
                const { Organizer } = await import('../../src/lib/organizer.js');
                const organizer = new Organizer({
                    onLog: addLog,
                    onStatus: updateStatus
                });

                await organizer.start();

                updateStatus('done', '整理完成！', '您可以查看 Chrome 书签栏确认结果。');
            } catch (error) {
                console.error(error);
                updateStatus('error', '发生错误', error.message);
                addLog(`Error: ${error.message}`);
            } finally {
                btnStart.disabled = false;
            }
        });
    }

    function updateStatus(state, title, desc) {
        statusText.textContent = title;
        statusDesc.textContent = desc;

        switch (state) {
            case 'scanning': statusIcon.textContent = '🔍'; break;
            case 'analyzing': statusIcon.textContent = '🧠'; break;
            case 'organizing': statusIcon.textContent = '📂'; break;
            case 'done': statusIcon.textContent = '✅'; break;
            case 'error': statusIcon.textContent = '❌'; break;
            default: statusIcon.textContent = '👋';
        }
    }

    function addLog(message) {
        const li = document.createElement('li');
        li.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logList.appendChild(li);
        logList.scrollTop = logList.scrollHeight;
    }
});
