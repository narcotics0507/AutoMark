import { AIService } from '../../src/lib/ai_service.js';
import { Organizer } from '../../src/lib/organizer.js';
import { Logger } from '../../src/lib/logger.js';
import { BookmarkExporter } from '../../src/lib/exporter.js';

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
document.getElementById('btnTest').addEventListener('click', testConnection);
document.getElementById('apiProvider').addEventListener('change', handleProviderChange);
document.getElementById('btnRefreshLogs').addEventListener('click', refreshLogs);

// Copy Logs
document.getElementById('btnCopyLogs').addEventListener('click', async () => {
    const logsEl = document.getElementById('systemLogs');
    const btn = document.getElementById('btnCopyLogs');
    if (!logsEl) return;

    try {
        await navigator.clipboard.writeText(logsEl.textContent);
        const originalText = btn.textContent;
        btn.textContent = '已复制';
        setTimeout(() => { btn.textContent = originalText; }, 1500);
    } catch (e) {
        btn.textContent = '复制失败';
        setTimeout(() => { btn.textContent = '复制日志'; }, 1500);
    }
});

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
        Logger.log('Testing API Connection...');
        const ai = new AIService(config);
        const result = await ai.testConnection();

        if (result.success) {
            showStatus('连接成功！', 'green');
            Logger.log('API Connection Test Passed', 'info');
        } else {
            showStatus(`连接失败: ${result.message}`, 'red');
            Logger.error(`API Connection Test Failed: ${result.message}`);
        }
    } catch (error) {
        showStatus(`错误: ${error.message}`, 'red');
        Logger.error(`API Connection Error: ${error.message}`);
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
            checkbox.addEventListener('change', () => {
                const total = document.querySelectorAll('#folder-list input[type="checkbox"]').length;
                const checkedCount = document.querySelectorAll('#folder-list input[type="checkbox"]:checked').length;
                const selectAll = document.getElementById('selectAllFolders');
                if (selectAll) {
                    selectAll.checked = (total === checkedCount);
                    selectAll.indeterminate = (checkedCount > 0 && checkedCount < total);
                }
            });

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
document.getElementById('btnCheckDuplicates').addEventListener('click', () => startAnalysis({ skipAI: true, checkDuplicates: true }));
document.getElementById('btnAnalyzeBack').addEventListener('click', () => showStep('select'));

// Backup Logic
document.getElementById('btnBackup').addEventListener('click', async () => {
    try {
        const btn = document.getElementById('btnBackup');
        const originText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '正在导出...';

        const exporter = new BookmarkExporter();
        await exporter.exportAndDownload();

        showStatus('书签备份已开始下载', 'green');
        btn.innerHTML = '导出成功';
        setTimeout(() => {
            btn.innerHTML = originText;
            btn.disabled = false;
        }, 2000);
    } catch (e) {
        showStatus('备份失败: ' + e.message, 'red');
        document.getElementById('btnBackup').disabled = false;
        document.getElementById('btnBackup').innerHTML = '备份书签';
    }
});

// Select All Logic
document.getElementById('selectAllFolders').addEventListener('change', (e) => {
    const checked = e.target.checked;
    const checkboxes = document.querySelectorAll('#folder-list input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = checked);
});

async function startAnalysis(options = {}) {
    const { skipAI = false, checkDuplicates = false } = options;

    // Dynamic Text Updates
    const analyzeTitle = document.getElementById('analyze-step-title');
    const reviewDesc = document.getElementById('review-step-desc');

    if (skipAI) {
        if (analyzeTitle) analyzeTitle.textContent = '2. 正在扫描...';
        if (reviewDesc) reviewDesc.textContent = '检测完成，建议进行以下更改。您可以取消勾选不想执行的操作。';
    } else {
        if (analyzeTitle) analyzeTitle.textContent = '2. AI正在分析';
        if (reviewDesc) reviewDesc.textContent = 'AI 建议进行以下更改。您可以取消勾选不想执行的操作。';
    }

    // Get selected IDs
    const checkboxes = document.querySelectorAll('#folder-list input[type="checkbox"]:checked');
    const selectedIds = Array.from(checkboxes).map(cb => cb.value);

    // Logic: 
    // - ConfirmSelection (AI Analysis): checkDeadLinks = user checkbox
    // - CheckDeadLinksOnly: checkDeadLinks = true, skipAI = true
    // - CheckDuplicates: checkDuplicates = true, skipAI = true, checkDeadLinks = false (usually)
    const userCheckDeadLinks = document.getElementById('checkDeadLinks').checked;

    let checkDeadLinks = userCheckDeadLinks;
    if (skipAI && !checkDuplicates) {
        // "Dead Links Only" button clicked
        checkDeadLinks = true;
    } else if (checkDuplicates) {
        // "Duplicates" button clicked
        // We probably don't want to force dead links check unless user checked it?
        // Let's stick to user preference or false if strictly just duplicates.
        // For simplicity, let's say if Duplicates button is clicked, we IGNORE the "Check Dead Links" checkbox to keep it focused,
        // OR we respect it. Let's respect it if checked, but don't force it.
        checkDeadLinks = userCheckDeadLinks;
    }

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

    // Contextual Status
    const statusText = skipAI ? '正在检测...' : 'AI 正在分析...';
    statusEl.textContent = statusText;

    btnStop.classList.remove('hidden');
    btnBack.classList.add('hidden');

    btnStop.onclick = () => organizer.cancel();

    organizer.onLog = (msg, type) => {
        Logger.log(`[Batch] ${msg}`, type || 'info'); // Persist log

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
        currentPlan = await organizer.analyze(selectedIds, { checkDeadLinks, skipAI, checkDuplicates });
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

    /**
     * Helper to render expanded groups (Tree-like)
     * Supports Pagination for large lists (optional)
     */
    const createGroupedSection = (title, items, icon, groupKeyFn, itemRendererHTML, usePagination = false, customRenderGroup = null) => {
        if (!items || items.length === 0) return;

        const section = document.createElement('div');
        section.className = 'plan-section';

        const header = document.createElement('h4');
        header.innerHTML = `<span style="font-size:1.2em">${icon}</span> ${title} <span style="background:#eee;padding:2px 8px;border-radius:10px;font-size:0.8em;color:#666">${items.length}</span>`;
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

        const sortedGroupNames = Object.keys(groups).sort();

        // Inner function to render a list of groups
        const renderGroupList = (groupNames) => {
            const container = document.createElement('div');

            groupNames.forEach(groupName => {
                const groupItems = groups[groupName];

                // Use Custom Group Renderer if provided (e.g. for duplicates)
                if (customRenderGroup) {
                    container.appendChild(customRenderGroup(groupName, groupItems, updateReviewCounts));
                    return;
                }

                // Default Group Renderer
                const details = document.createElement('details');
                details.className = 'plan-group-details';
                details.open = true;

                const summary = document.createElement('summary');
                const groupCb = document.createElement('input');
                groupCb.type = 'checkbox';
                const allChecked = groupItems.every(i => !i._ignored);
                groupCb.checked = allChecked;
                groupCb.onclick = (e) => e.stopPropagation();
                groupCb.onchange = (e) => {
                    const checked = e.target.checked;
                    groupItems.forEach(i => i._ignored = !checked);
                    const childCbs = details.querySelectorAll('.item-cb');
                    childCbs.forEach(cb => cb.checked = checked);
                    updateReviewCounts();
                };

                const summaryText = document.createElement('span');
                summaryText.textContent = `${groupName}`;
                summaryText.style.fontWeight = 'bold';
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
                    };
                    const textDiv = document.createElement('div');
                    textDiv.innerHTML = itemRendererHTML(item);
                    row.appendChild(cb);
                    row.appendChild(textDiv);
                    contentDiv.appendChild(row);
                });

                details.appendChild(contentDiv);
                container.appendChild(details);
            });
            return container;
        };

        // Pagination Logic
        if (usePagination && sortedGroupNames.length > 10) {
            const pageSize = 10;
            let currentPage = 1;
            const totalPages = Math.ceil(sortedGroupNames.length / pageSize);

            const contentContainer = document.createElement('div');

            // Render Page Function
            const renderPage = () => {
                contentContainer.innerHTML = '';
                const start = (currentPage - 1) * pageSize;
                const end = start + pageSize;
                const pageGroups = sortedGroupNames.slice(start, end);
                contentContainer.appendChild(renderGroupList(pageGroups));

                // Update controls text and state
                pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页 (共 ${sortedGroupNames.length} 组)`;
                btnPrev.disabled = currentPage === 1;
                btnNext.disabled = currentPage === totalPages;

                // Scroll to top of section if needed
                if (detailsEl.scrollTop > section.offsetTop) {
                    // detailsEl.scrollTop = section.offsetTop;
                }
            };

            const controls = document.createElement('div');
            controls.className = 'pagination-controls';

            const btnPrev = document.createElement('button');
            btnPrev.textContent = '上一页';
            btnPrev.onclick = () => {
                if (currentPage > 1) { currentPage--; renderPage(); }
            };

            const pageInfo = document.createElement('span');
            pageInfo.className = 'pagination-info';

            const btnNext = document.createElement('button');
            btnNext.textContent = '下一页';
            btnNext.onclick = () => {
                if (currentPage < totalPages) { currentPage++; renderPage(); }
            };

            controls.append(btnPrev, pageInfo, btnNext);

            section.appendChild(contentContainer);
            section.appendChild(controls);

            // Init
            renderPage();

        } else {
            // No pagination needed
            section.appendChild(renderGroupList(sortedGroupNames));
        }

        detailsEl.appendChild(section);
    };

    // 1. New Folders
    createGroupedSection('新建文件夹', plan.folders_to_create, '📁',
        (i) => i.path.includes('/') ? i.path.split('/')[0] : 'Top Level',
        (i) => `<span>${i.path}</span>`
    );

    // 2. Move Bookmarks
    createGroupedSection('移动书签', plan.bookmarks_to_move, '📄',
        (i) => i.target_folder_path,
        (i) => `<span>${i.title}</span> <span class="url-subtext">${i.url}</span>`
    );

    // 3. Rename
    createGroupedSection('重命名文件夹', plan.folders_to_rename, '✏️',
        (i) => 'Renames',
        (i) => `<span>${i.old_title} &rarr; <b>${i.new_title}</b></span>`
    );

    // 4. Archive
    createGroupedSection('归档/清理', plan.archive, '📦',
        (i) => i.reason || 'General',
        (i) => `<span>${i.title}</span>`
    );

    // 5. Dead Links
    createGroupedSection('失效链接', plan.dead_links, '💀',
        (i) => i.reason || 'Unknown',
        (i) => `<span class="badge badge-delete">失效</span> ${i.title || 'No Title'} <br><a href="${i.url}" target="_blank" class="url-subtext" style="color: #2196F3; text-decoration: underline;">${i.url}</a>`
    );

    // 6. Duplicates (Advanced: Radio Selection per Group)
    createGroupedSection('重复书签', plan.duplicates, '👯',
        (i) => {
            try { return new URL(i.url).hostname.replace(/^www\./, ''); } catch { return 'Others'; }
        },
        null,
        true, // Enable Pagination
        (groupName, items, updateCounts) => {
            // Pre-process: Group by Keep ID (Equivalence Sets)
            const sets = {};
            items.forEach(item => {
                const kId = item.keep_id;
                if (!sets[kId]) {
                    sets[kId] = {
                        keepItem: {
                            id: item.keep_id,
                            title: item.keep_title,
                            url: item.keep_url,
                            _ignored: true // default kept
                        },
                        duplicates: []
                    };
                }
                sets[kId].duplicates.push(item);
            });

            const container = document.createElement('div');
            container.className = 'dup-group-container';

            const header = document.createElement('div');
            header.className = 'dup-header';
            header.textContent = groupName;
            container.appendChild(header);

            Object.values(sets).forEach(set => {
                const setContainer = document.createElement('div');
                setContainer.className = 'dup-set';

                // Merge all items (Keep + Duplicates)
                const allItems = [set.keepItem, ...set.duplicates];

                // Render Radio Group
                allItems.forEach(item => {
                    const row = document.createElement('div');
                    row.className = 'dup-radio-row';
                    // Highlight if kept
                    if (item._ignored) row.classList.add('row-kept');

                    const radio = document.createElement('input');
                    radio.type = 'radio';
                    radio.name = `dup-set-${set.keepItem.id}`; // unique group name
                    radio.checked = item._ignored;

                    radio.onchange = () => {
                        // When this is selected:
                        // 1. Mark this as ignored (Keep)
                        item._ignored = true;
                        // 2. Mark all others in this set as NOT ignored (Delete)
                        allItems.forEach(other => {
                            if (other !== item) other._ignored = false;
                        });

                        // 3. Update UI classes
                        setContainer.querySelectorAll('.dup-radio-row').forEach(r => r.classList.remove('row-kept'));
                        row.classList.add('row-kept');

                        updateCounts();
                    };

                    const label = document.createElement('div');
                    label.className = 'dup-radio-label';
                    label.innerHTML = `
                        <div class="dup-title">${item.title}</div>
                        <div class="dup-url">${item.url}</div>
                        ${item === set.keepItem && item.id === set.keepItem.id ? '<span class="badge badge-keep">原保留项</span>' : ''}
                    `;

                    // Allow clicking row to select
                    row.onclick = (e) => {
                        if (e.target !== radio) radio.click();
                    };

                    row.appendChild(radio);
                    row.appendChild(label);
                    setContainer.appendChild(row);
                });

                container.appendChild(setContainer);
            });

            return container;
        }
    );

    // Update UI Text for Dead Links
    const btnExecute = document.getElementById('btnExecuteInfo');
    const stepDesc = document.getElementById('review-step-desc');

    if (plan.dead_links && plan.dead_links.length > 0) {
        btnExecute.textContent = '确认执行 (失效链接将移至归档)';
        if (stepDesc) {
            stepDesc.innerHTML = 'AI 建议进行以下更改。<br><b>注意：检测到的失效链接将被移动到 "失效链接归档" 文件夹，不会直接删除。</b>';
            stepDesc.style.color = '#d32f2f';
        }
    } else {
        btnExecute.textContent = '确认执行';
        if (stepDesc) {
            stepDesc.textContent = 'AI 建议进行以下更改。您可以取消勾选不想执行的操作。';
            stepDesc.style.color = '';
        }
    }
}

function updateReviewCounts() {
    if (!currentPlan) return;
    const count = (arr) => arr ? arr.filter(i => !i._ignored).length : 0;
    document.getElementById('count-create').textContent = count(currentPlan.folders_to_create);
    document.getElementById('count-move').textContent = count(currentPlan.bookmarks_to_move);
    document.getElementById('count-rename').textContent = count(currentPlan.folders_to_rename);

    /**
     * For duplicates, the logic is inverted:
     * items in plan.duplicates are CANDIDATES for deletion.
     * if _ignored is FALSE (default), they will be deleted.
     * if _ignored is TRUE, they are KEPT.
     * The count should show how many will be DELETED.
     * 
     * However, our new logic injects a "Virtual Keep Item" into the UI set, 
     * but that item is NOT in plan.duplicates array initially.
     * 
     * We need to be careful: 
     * plan.duplicates contains ONLY the items originally marked for deletion.
     * If user swaps and keeps a duplicate, that duplicate gets _ignored=true.
     * If user swaps and deletes the original keeper, that original keeper needs to be added to deletion list?
     * 
     * Wait, the `execute` function filters plan.duplicates by `!i._ignored`.
     * So if a duplicate is marked `_ignored=true`, it won't be deleted. Good.
     * 
     * But what if the user selects a duplicate to keep, and effectively wants to delete the ORIGINAL keeper?
     * My current logic in `organizer.js` returns a list of *deletions*.
     * The original keeper is NOT in that list.
     * 
     * CRITICAL FIX: 
     * The "Virtual Keep Item" created in the render function is just a local object.
     * If user selects a duplicate to keep, `duplicate._ignored = true`. It is saved.
     * But if user deletes the original keeper (`keepItem`), that `keepItem` is NOT in `plan.duplicates`.
     * We need to add it to `plan.duplicates` if it is marked for deletion!
     * 
     * Strategy:
     * We should modify `plan.duplicates` to include the original keepers too?
     * Or, in the `render` logic, when we create `sets[kId]`, we should push the `keepItem` into `plan.duplicates`?
     * 
     * Let's do this: 
     * When `renderReview` runs, we iterate duplicates and inject the keep items into `plan.duplicates` array if not present.
     * Then rendering just works from `plan.duplicates`.
     * 
     * But `renderReview` might run multiple times? No, usually called once after analysis.
     * Let's add a pre-processing step inside `renderReview` or just inside the duplicate section.
     */

    // Duplicates Count
    // We need to count items in plan.duplicates where _ignored is false.
    // AND we need to make sure the original keeper is in plan.duplicates if it's now deleted.
}

// ... (Pre-processing needed, but let's stick to the render replacement first, 
// and handling the "Swap" logic carefully by pushing to plan)

document.getElementById('btnCancelReview').addEventListener('click', () => {
    // currentPlan = null; // Keep it?
    showStep('welcome'); // Or select?
});

document.getElementById('btnExecuteInfo').addEventListener('click', async () => {
    if (!currentPlan) return;

    // Auto Backup Check
    const chkBackup = document.getElementById('chkAutoBackup');
    if (chkBackup && chkBackup.checked) {
        try {
            const btnExecute = document.getElementById('btnExecuteInfo');
            btnExecute.disabled = true;
            btnExecute.textContent = '正在备份书签...';

            showStatus('正在执行自动备份...', 'blue');
            const exporter = new BookmarkExporter();
            await exporter.exportAndDownload();
            showStatus('备份已下载，准备开始整理...', 'green');

            // Short delay to let user see feedback
            await new Promise(r => setTimeout(r, 1000));
        } catch (e) {
            console.error('Auto backup failed:', e);
            if (!confirm(`自动备份失败 (${e.message})。是否仍要继续执行整理？`)) {
                document.getElementById('btnExecuteInfo').disabled = false;
                document.getElementById('btnExecuteInfo').textContent = '确认执行';
                return;
            }
        }
    }

    // Special handling for duplicates:
    // If we introduced new items (swapped keepers) into the UI flow, we need to ensure they are in the plan.
    // The safest way with the "Virtual Item" approach in render is:
    // The `set.keepItem` object in render scope is NOT in `plan.duplicates`.
    // We need to collect ALL items from the UI that are marked for deletion?
    // Or we modify `plan.duplicates` in place during render?

    // BETTER APPROACH for `renderReview` above: 
    // When constructing `sets`, check if `keepItem` is already in `plan.duplicates` (it won't be).
    // Push it to `plan.duplicates` BUT with `_ignored: true` (default kept).
    // This way, it is part of the state. If user flips it, `_ignored` becomes false -> deleted.
    // We need to prevent double pushing if rerendered.
    // We can check a flag `_injected`?

    // Let's modify the PREVIOUS replace block to include this logic!

    const finalPlan = {
        folders_to_create: currentPlan.folders_to_create?.filter(i => !i._ignored) || [],
        folders_to_rename: currentPlan.folders_to_rename?.filter(i => !i._ignored) || [],
        bookmarks_to_move: currentPlan.bookmarks_to_move?.filter(i => !i._ignored) || [],
        archive: currentPlan.archive?.filter(i => !i._ignored) || [],
        dead_links: currentPlan.dead_links?.filter(i => !i._ignored) || [],
        duplicates: currentPlan.duplicates?.filter(i => !i._ignored) || []
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
        Logger.log(`[Exec] ${msg}`, type || 'info'); // Persist log

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

// Logs Logic
async function refreshLogs() {
    const container = document.getElementById('systemLogs');
    if (!container) return;

    try {
        const data = await chrome.storage.local.get('systemLogs');
        renderLogs(data.systemLogs);
    } catch (e) {
        container.textContent = '读取日志失败: ' + e.message;
    }
}

function renderLogs(logs) {
    const container = document.getElementById('systemLogs');
    if (!container) return;

    if (logs && logs.length > 0) {
        container.innerHTML = logs.map(l => `<div style="border-bottom:1px solid #eee; padding:2px;">${l}</div>`).join('');
    } else {
        container.innerHTML = '<div style="text-align: center;">暂无日志 (No Logs)</div>';
    }
}

// Auto-refresh via Storage Listener
chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes.systemLogs) {
        renderLogs(changes.systemLogs.newValue);
    }
});

// Fallback Polling (Every 2 seconds) to ensure updates even if listener misses
setInterval(refreshLogs, 2000);

// Initial load
refreshLogs();

// Initial load
refreshLogs();
