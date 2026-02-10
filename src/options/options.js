import { AIService } from '../lib/ai_service.js';
import { Organizer } from '../lib/organizer.js';

const DEFAULTS = {
    openai: {
        endpoint: 'https://api.openai.com/v1/chat/completions',
        model: 'gpt-4o'
    },
    gemini: {
        endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
        model: 'gemini-pro'
    },
    deepseek: {
        endpoint: 'https://api.deepseek.com/chat/completions',
        model: 'deepseek-chat'
    },
    custom: {
        endpoint: '',
        model: ''
    }
};

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('btnSave').addEventListener('click', saveOptions);
document.getElementById('btnTest').addEventListener('click', testConnection);
document.getElementById('apiProvider').addEventListener('change', handleProviderChange);

// Restore Event listener for the Start button


function handleProviderChange() {
    const provider = document.getElementById('apiProvider').value;
    const defaults = DEFAULTS[provider];

    if (defaults) {
        // Only auto-fill if the fields are empty or contain values from other providers
        // To be safe and helpful, let's just populate them if they look like default values
        // Or just force update since user explicitly changed provider? 
        // Force update is better UX for switching.
        document.getElementById('apiEndpoint').value = defaults.endpoint;
        document.getElementById('modelName').value = defaults.model;
    }
}


// Configuration Logic
function restoreOptions() {
    chrome.storage.sync.get(
        {
            apiProvider: 'openai',
            apiEndpoint: 'https://api.openai.com/v1/chat/completions',
            apiKey: '',
            modelName: 'gpt-4o',
            targetLanguage: 'zh-CN',
            autoCategorize: false
        },
        (items) => {
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.value = val;
            };
            setVal('apiProvider', items.apiProvider);
            setVal('apiEndpoint', items.apiEndpoint);
            setVal('apiKey', items.apiKey);
            setVal('modelName', items.modelName);
            setVal('targetLanguage', items.targetLanguage);

            const autoCatEl = document.getElementById('autoCategorize');
            if (autoCatEl) autoCatEl.checked = items.autoCategorize;
        }
    );
}

function getConfigFromUI() {
    return {
        apiProvider: document.getElementById('apiProvider').value,
        apiEndpoint: document.getElementById('apiEndpoint').value,
        apiKey: document.getElementById('apiKey').value,
        modelName: document.getElementById('modelName').value,
        targetLanguage: document.getElementById('targetLanguage').value,
        autoCategorize: document.getElementById('autoCategorize').checked
    };
}

function saveOptions() {
    const config = getConfigFromUI();

    if (!config.apiKey) {
        showStatus('请输入 API Key', 'red');
        return;
    }

    chrome.storage.sync.set(config, () => {
        showStatus('设置已保存！', 'green');
    });
}

function showStatus(msg, color = 'black') {
    const status = document.getElementById('statusMessage');
    if (!status) return;
    status.textContent = msg;
    status.style.color = color;
    setTimeout(() => {
        status.textContent = '';
    }, 3000);
}

async function testConnection() {
    const config = getConfigFromUI();
    if (!config.apiKey) {
        showStatus('请先填入 API Key', 'red');
        return;
    }

    const btnTest = document.getElementById('btnTest');
    const originalText = btnTest.textContent;
    btnTest.textContent = '测试中...';
    btnTest.disabled = true;

    try {
        const ai = new AIService(config);
        const result = await ai.testConnection();

        if (result.success) {
            showStatus('连接成功！', 'green');
        } else {
            showStatus(`连接失败: ${result.message}`, 'red');
        }
    } catch (error) {
        showStatus(`错误: ${error.message}`, 'red');
    } finally {
        btnTest.textContent = originalText;
        btnTest.disabled = false;
    }
}

// Dashboard & Wizard Logic
let currentPlan = null;
let organizer = null;

// UI Elements
const steps = {
    welcome: document.getElementById('step-welcome'),
    select: document.getElementById('step-select'),
    analyze: document.getElementById('step-analyze'),
    review: document.getElementById('step-review'),
    execute: document.getElementById('step-execute')
};

function showStep(stepName) {
    Object.values(steps).forEach(el => el && el.classList.add('hidden'));
    if (steps[stepName]) steps[stepName].classList.remove('hidden');
}

document.getElementById('btnStartWizard').addEventListener('click', async () => {
    // Check Config first
    const config = getConfigFromUI();
    if (!config.apiKey) {
        showStatus('请先在左侧填入 API Key 并保存', 'red');
        return;
    }

    // Init Organizer
    organizer = new Organizer({
        config: config,
        onLog: (msg) => console.log(msg), // Simplify log for now? Or pipe to mini-log
        onStatus: (s, t, d) => { },
        onProgress: (p, m) => { }
    });

    // Load folders
    showStep('select');
    const listEl = document.getElementById('folder-list');
    listEl.innerHTML = '<div class="loading-spinner">正在读取文件夹结构...</div>';

    try {
        const folders = await organizer.getTopLevelFolders();
        listEl.innerHTML = '';

        if (folders.length === 0) {
            listEl.innerHTML = '<div style="padding:10px">没有找到可整理的文件夹 (例如书签栏、其他书签)</div>';
        }

        folders.forEach(f => {
            const div = document.createElement('div');
            div.className = 'folder-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `folder-${f.id}`;
            checkbox.value = f.id;
            checkbox.checked = true; // Default checked

            const label = document.createElement('label');
            label.htmlFor = `folder-${f.id}`;
            label.textContent = f.path; // e.g. "Bookmarks Bar"

            div.appendChild(checkbox);
            div.appendChild(label);
            listEl.appendChild(div);
        });
    } catch (e) {
        listEl.innerHTML = `<div style="color:red">读取失败: ${e.message}</div>`;
    }
});

document.getElementById('btnBackToWelcome').addEventListener('click', () => {
    showStep('welcome');
});

// Bind Buttons
document.getElementById('btnConfirmSelection').addEventListener('click', () => startAnalysis({ skipAI: false }));
document.getElementById('btnCheckDeadLinksOnly').addEventListener('click', () => startAnalysis({ skipAI: true }));
document.getElementById('btnAnalyzeBack').addEventListener('click', () => showStep('select'));

async function startAnalysis(options = {}) {
    const { skipAI = false } = options;

    // Get selected IDs
    const checkboxes = document.querySelectorAll('#folder-list input[type="checkbox"]:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);

    // Logic: 
    // - ConfirmSelection (AI Analysis): checkDeadLinks = user checkbox
    // - CheckDeadLinksOnly: checkDeadLinks = true, skipAI = true
    const userCheckDeadLinks = document.getElementById('checkDeadLinks').checked;
    const checkDeadLinks = skipAI ? true : userCheckDeadLinks;

    if (selectedIds.length === 0) {
        alert('请至少选择一个文件夹！');
        return;
    }

    showStep('analyze');

    // Bind UI for analysis
    const logEl = document.getElementById('analyze-log');
    const fillEl = document.getElementById('analyze-fill');
    const pctEl = document.getElementById('analyze-percent');
    const statusEl = document.getElementById('analyze-status');
    const btnStop = document.getElementById('btnStopAnalyze');
    const btnBack = document.getElementById('btnAnalyzeBack');

    // Reset UI
    logEl.innerHTML = '';
    fillEl.style.width = '0%';
    pctEl.textContent = '0%';
    statusEl.textContent = '准备开始...';
    btnStop.classList.remove('hidden');
    btnBack.classList.add('hidden');

    btnStop.onclick = () => organizer.cancel();

    organizer.onLog = (msg, type) => {
        const span = document.createElement('div');
        span.textContent = `> ${msg}`;
        if (type === 'error') span.style.color = 'red';
        if (type === 'warning') span.style.color = 'orange'; // Added warning support
        logEl.appendChild(span);
        logEl.scrollTop = logEl.scrollHeight;
    };

    organizer.onProgress = (pct, msg) => {
        fillEl.style.width = `${pct}%`;
        pctEl.textContent = `${pct}%`;
        if (msg) statusEl.textContent = msg;
    };

    organizer.onStatus = (status, title, desc) => {
        // handle status updates explicitly if needed
        if (status === 'cancelled') {
            statusEl.textContent = '已取消';
            statusEl.style.color = 'orange';
        }
    };

    try {
        currentPlan = await organizer.analyze(selectedIds, { checkDeadLinks, skipAI });
        if (!organizer.isCancelled) {
            renderReview(currentPlan);
            showStep('review');
        }
    } catch (e) {
        btnStop.classList.add('hidden');
        btnBack.classList.remove('hidden');

        if (e.message.includes('取消')) {
            statusEl.textContent = '操作已取消';
            statusEl.style.color = 'orange';
            organizer.onLog('用户已中止操作。', 'warning');
        } else {
            organizer.onLog(`Error: ${e.message}`, 'error');
            statusEl.textContent = '分析出错';
            statusEl.style.color = 'red';
        }
    }
}

function renderReview(plan) {
    const detailsEl = document.getElementById('plan-details');
    detailsEl.innerHTML = '';

    // Counts
    const gets = (arr) => arr ? arr.length : 0;
    document.getElementById('count-create').textContent = gets(plan.folders_to_create);
    document.getElementById('count-move').textContent = gets(plan.bookmarks_to_move);
    document.getElementById('count-rename').textContent = gets(plan.folders_to_rename);

    // Helper to render expanded groups (Tree-like)
    const createGroupedSection = (title, items, icon, groupKeyFn, itemRenderer) => {
        if (!items || items.length === 0) return;

        const section = document.createElement('div');
        section.className = 'plan-section';

        const header = document.createElement('h4');
        header.textContent = `${icon} ${title} (${items.length})`;
        header.style.margin = '10px 0 5px 0';
        section.appendChild(header);

        // Group items
        const groups = {};
        const miscItems = [];

        items.forEach(item => {
            const key = groupKeyFn(item);
            if (key) {
                if (!groups[key]) groups[key] = [];
                groups[key].push(item);
            } else {
                miscItems.push(item);
            }
        });

        // Render Groups
        Object.keys(groups).sort().forEach(groupName => {
            const groupItems = groups[groupName];
            const details = document.createElement('details');
            details.className = 'plan-group-details';

            const summary = document.createElement('summary');

            // Group Checkbox
            const groupCb = document.createElement('input');
            groupCb.type = 'checkbox';
            const allChecked = groupItems.every(i => !i._ignored);
            groupCb.checked = allChecked;
            groupCb.onclick = (e) => {
                // Prevent toggling details
                e.stopPropagation();
            };
            groupCb.onchange = (e) => {
                const checked = e.target.checked;
                groupItems.forEach(i => i._ignored = !checked);
                // Rerender group items checks? Or just update plan state? 
                // We need to visually update children checkboxes.
                const childCbs = details.querySelectorAll('.item-cb');
                childCbs.forEach(cb => cb.checked = checked);
                updateReviewCounts();
            };

            const summaryText = document.createElement('span');
            summaryText.textContent = `${groupName} (${groupItems.length})`;

            summary.appendChild(groupCb);
            summary.appendChild(summaryText);
            details.appendChild(summary);

            const contentDiv = document.createElement('div');
            contentDiv.className = 'group-content';

            groupItems.forEach(item => {
                const row = document.createElement('div');
                row.className = 'plan-item';

                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.className = 'item-cb';
                cb.checked = !item._ignored;
                cb.onchange = (e) => {
                    item._ignored = !e.target.checked;
                    updateReviewCounts();
                    // Update group checkbox state? (Optional polish)
                };

                const text = document.createElement('span');
                text.textContent = itemRenderer(item);
                text.title = item.title || ''; // Tooltip

                row.appendChild(cb);
                row.appendChild(text);
                contentDiv.appendChild(row);
            });

            details.appendChild(contentDiv);
            section.appendChild(details);
        });

        // Render Misc Items
        if (miscItems.length > 0) {
            // ... similar logic for flat list if needed, or put in "Others" group
        }

        detailsEl.appendChild(section);
    };

    // 1. New Folders: List is fine, or group by parent? 
    // Usually they are flat paths "A/B", "A/C". Group by "A"?
    // For now, let's just list them but use the new container style.
    createGroupedSection('新建文件夹', plan.folders_to_create, '📁',
        (i) => i.path.includes('/') ? i.path.split('/')[0] : 'Top Level',
        (i) => i.path
    );

    // 2. Move Bookmarks: Group by Target Folder
    createGroupedSection('移动书签', plan.bookmarks_to_move, '📄',
        (i) => i.target_folder_path,
        (i) => i.title || `ID:${i.bookmark_id}` // Use Title!
    );

    // 3. Rename: Group by ... parent path?
    createGroupedSection('重命名文件夹', plan.folders_to_rename, '✏️',
        (i) => 'Renames',
        (i) => `${i.old_title || i.bookmark_id} -> ${i.new_title}`
    );

    // 4. Archive
    createGroupedSection('归档/清理', plan.archive, '📦',
        (i) => i.reason || 'General',
        (i) => `${i.title}`
    );

    // 5. Dead Links
    createGroupedSection('失效链接', plan.dead_links, '💀',
        (i) => i.reason || 'Unknown',
        (i) => `${i.title || i.url} (${i.url})`
    );
}

function updateReviewCounts() {
    if (!currentPlan) return;
    const count = (arr) => arr ? arr.filter(i => !i._ignored).length : 0;
    document.getElementById('count-create').textContent = count(currentPlan.folders_to_create);
    document.getElementById('count-move').textContent = count(currentPlan.bookmarks_to_move);
    document.getElementById('count-rename').textContent = count(currentPlan.folders_to_rename);
    // Add dead link count if we had a UI element for it in summary... 
    // We don't have a specific summary box for dead links in HTML yet, 
    // but we can add one dynamically or just ignore for now in summary counts.
    // Let's rely on the list view.
}


document.getElementById('btnCancelReview').addEventListener('click', () => {
    // currentPlan = null; // Keep it?
    showStep('welcome'); // Or select?
});

document.getElementById('btnExecuteInfo').addEventListener('click', async () => {
    if (!currentPlan) return;

    // Filter ignored items
    const finalPlan = {
        folders_to_create: currentPlan.folders_to_create?.filter(i => !i._ignored) || [],
        folders_to_rename: currentPlan.folders_to_rename?.filter(i => !i._ignored) || [],
        bookmarks_to_move: currentPlan.bookmarks_to_move?.filter(i => !i._ignored) || [],
        archive: currentPlan.archive?.filter(i => !i._ignored) || [],
        dead_links: currentPlan.dead_links?.filter(i => !i._ignored) || []
    };

    showStep('execute');

    const logEl = document.getElementById('exec-log');
    const fillEl = document.getElementById('exec-fill');
    const pctEl = document.getElementById('exec-percent');
    const statusEl = document.getElementById('exec-status');
    const btnStop = document.getElementById('btnStopExecute');
    const doneActions = document.getElementById('exec-done-actions');

    logEl.innerHTML = '';
    doneActions.classList.add('hidden');
    btnStop.classList.remove('hidden');
    btnStop.disabled = false;
    btnStop.onclick = () => organizer.cancel();

    organizer.onLog = (msg, type) => {
        const span = document.createElement('div');
        span.textContent = `> ${msg}`;
        if (type === 'error') span.style.color = 'red';
        if (type === 'warning') span.style.color = 'orange';
        logEl.appendChild(span);
        logEl.scrollTop = logEl.scrollHeight;
    };

    organizer.onProgress = (pct, msg) => {
        fillEl.style.width = `${pct}%`;
        pctEl.textContent = `${pct}%`;
        if (msg) statusEl.textContent = msg;
    };

    organizer.onStatus = (status, title, desc) => {
        if (status === 'cancelled') {
            statusEl.textContent = '已取消';
            statusEl.style.color = 'orange';
        }
    };

    try {
        await organizer.execute(finalPlan);
        if (!organizer.isCancelled) {
            doneActions.classList.remove('hidden');
            btnStop.classList.add('hidden'); // Hide stop when done
        }
    } catch (e) {
        if (e.message.includes('取消')) {
            statusEl.textContent = '执行已中止';
            statusEl.style.color = 'orange';
            // Show done actions anyway to allow finish/return
            doneActions.classList.remove('hidden');
        } else {
            organizer.onLog(`Execution Error: ${e.message}`, 'error');
        }
    }
});

document.getElementById('btnFinish').addEventListener('click', () => {
    showStep('welcome');
    document.getElementById('exec-done-actions').classList.add('hidden');
    // Reload?
});

