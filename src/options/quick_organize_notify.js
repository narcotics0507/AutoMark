// Standalone script - No imports

// --- Helpers ---
const safeDecode = (str) => {
    if (!str) return '';
    try {
        return decodeURIComponent(str);
    } catch (e) {
        console.error('URI Decode Error:', e);
        return str;
    }
};

// Flatten bookmark tree with pretty prefixes
function flattenFolders(nodes, depth = 0, output = []) {
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        // Skip root '0' but process kids.
        if (!node.url) {
            if (node.id !== '0') {
                output.push({
                    id: node.id,
                    title: node.title,
                    depth: depth
                });
            }

            if (node.children && node.children.length > 0) {
                // If root '0', depth stays 0 for kids (Bar/Other)
                const nextDepth = node.id === '0' ? 0 : depth + 1;
                flattenFolders(node.children, nextDepth, output);
            }
        }
    }
    return output;
}

let selectedFolderId = null;

// Render Tree to Div
function renderTree(folders, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    folders.forEach(f => {
        const item = document.createElement('div');
        item.className = 'tree-item';
        item.dataset.id = f.id;
        item.dataset.title = f.title;

        // Indent & Icon
        const indent = f.depth * 20; // 20px per level
        item.style.paddingLeft = `${indent + 8}px`; // Base padding 8px

        const icon = document.createElement('span');
        icon.className = 'tree-icon';
        icon.textContent = '📂';

        const text = document.createElement('span');
        text.className = 'tree-text';
        text.textContent = f.title === '' ? '根目录' : f.title;

        item.appendChild(icon);
        item.appendChild(text);

        // Selection Handler
        item.onclick = () => {
            // Clear previous
            const prev = container.querySelector('.selected');
            if (prev) prev.classList.remove('selected');

            // Select current
            item.classList.add('selected');
            selectedFolderId = f.id;
        };

        container.appendChild(item);
    });
}

// --- State ---
const params = new URLSearchParams(window.location.search);
const bookmarkId = params.get('id');
// targetPath/targetId might change if user modifies it
let targetPath = safeDecode(params.get('path'));
let targetId = params.get('targetId');

const msg = safeDecode(params.get('msg')); // Original Title
const suggestion = safeDecode(params.get('suggestion')); // AI Suggestion
const reason = safeDecode(params.get('reason') || 'AI Decision');
const errorMsg = safeDecode(params.get('error'));
const oldParentId = params.get('old');
const warningMsg = safeDecode(params.get('warning'));
const isSamePath = params.get('same') === 'true';

let autoCloseTimer = null;

// --- Init ---
function init() {
    if (warningMsg) {
        // Warning Mode (Import Guard)
        document.body.classList.add('warning-mode'); // You might need to add css for this, or just inline style
        document.querySelector('.message').textContent = '⚠️ 自动整理已暂停';

        const pathEl = document.getElementById('target-path');
        pathEl.textContent = warningMsg;
        pathEl.style.color = '#ff9f0a'; // Apple Orange
        pathEl.style.fontSize = '0.9rem';
        pathEl.style.fontWeight = 'normal';

        // Hide unrelated elements
        document.getElementById('title-section').style.display = 'none';
        document.getElementById('ai-reason').style.display = 'none';

        // Hide Actions except one closing button
        document.getElementById('btnUndo').style.display = 'none';
        document.getElementById('btnChange').style.display = 'none';

        const btnConfirm = document.getElementById('btnConfirm');
        btnConfirm.textContent = '知道了';
        btnConfirm.style.background = '#0071e3';
        btnConfirm.onclick = () => window.close();

        // Auto close after 5s?
        startTimer(); // reuse timer to close automatically
        return;
    }

    if (errorMsg) {
        // Error State
        document.body.classList.add('error-mode');
        document.querySelector('.message').textContent = '⚠️ 自动分类失败';
        document.getElementById('target-path').textContent = errorMsg || '未知错误';
        document.getElementById('target-path').style.color = '#d32f2f';
        document.getElementById('ai-reason').style.display = 'none';

        document.getElementById('btnUndo').style.display = 'none';
        document.getElementById('btnChange').style.display = 'none';
        document.getElementById('btnConfirm').textContent = '关闭';
    } else {
        // Success State
        if (isSamePath) {
            document.querySelector('.message').textContent = 'AI 建议存放于 (当前位置)';
            document.getElementById('btnUndo').style.display = 'none';
        }

        updateUI();
        document.getElementById('ai-reason').textContent = `💡 ${reason}`;

        // Populate Title UI
        if (msg) {
            const input = document.getElementById('bookmark-title');
            input.value = msg;

            // Suggestion
            if (suggestion && suggestion !== msg) {
                const suggestionDiv = document.getElementById('ai-suggestion');
                const suggestionText = document.getElementById('suggestion-text');
                suggestionDiv.style.display = 'block';
                suggestionText.textContent = suggestion;

                suggestionDiv.onclick = () => {
                    input.value = suggestion;
                    input.style.borderColor = '#0071e3';
                    stopTimer();
                };
            }
            input.onfocus = stopTimer;
        }
    }

    startTimer();
}

function updateUI() {
    document.getElementById('target-path').textContent = targetPath || '未知路径';
}

// --- Timer ---
function startTimer() {
    autoCloseTimer = setTimeout(() => handleConfirm(), 6000); // 6s for more time
}

function stopTimer() {
    if (autoCloseTimer) {
        clearTimeout(autoCloseTimer);
        autoCloseTimer = null;
    }
    const timerBar = document.getElementById('timer-bar');
    if (timerBar) {
        timerBar.style.width = '0';
        timerBar.style.transition = 'none';
    }
}

document.body.addEventListener('mouseenter', stopTimer);

// --- Actions ---

// 1. Modify Folder Flow
async function handleModifyFolder() {
    stopTimer();
    document.getElementById('main-view').style.display = 'none';
    document.getElementById('folder-view').style.display = 'flex';

    const container = document.getElementById('folder-tree');
    if (container.children.length === 0) {
        const tree = await new Promise(r => chrome.bookmarks.getTree(r));
        const folders = flattenFolders(tree);
        renderTree(folders, 'folder-tree');
    }

    // Highlight current
    if (targetId) {
        // Find div with dataset.id
        const current = container.querySelector(`.tree-item[data-id="${targetId}"]`);
        if (current) {
            current.classList.add('selected');
            selectedFolderId = targetId;
            current.scrollIntoView({ block: 'center' });
        }
    }
}

function handleCancelFolder() {
    document.getElementById('folder-view').style.display = 'none';
    document.getElementById('main-view').style.display = 'flex';
}

async function handleSaveFolder() {
    if (selectedFolderId) {
        targetId = selectedFolderId;
        const container = document.getElementById('folder-tree');
        const selectedEl = container.querySelector('.selected');
        const selectedText = selectedEl ? selectedEl.dataset.title : '';

        targetPath = `.../${selectedText}`;
        updateUI();
    }

    document.getElementById('folder-view').style.display = 'none';
    document.getElementById('main-view').style.display = 'flex';
}

// 2. Main Actions
async function handleConfirm() {
    // Rename
    const newTitle = document.getElementById('bookmark-title').value;
    if (newTitle && newTitle !== msg) {
        try {
            await new Promise(r => chrome.bookmarks.update(bookmarkId, { title: newTitle }, r));
        } catch (e) {
            console.error('Rename failed:', e);
        }
    }

    // Move
    if (targetId) {
        try {
            await new Promise(r => chrome.bookmarks.move(bookmarkId, { parentId: targetId }, r));
        } catch (e) { console.error('Move failed:', e); }
    }

    window.close();
}

async function handleUndo() {
    if (oldParentId) {
        try {
            await new Promise(r => chrome.bookmarks.move(bookmarkId, { parentId: oldParentId }, r));
        } catch (e) { console.error('Undo failed:', e); }
    }
    window.close();
}

// Bindings
document.getElementById('btnConfirm').onclick = handleConfirm;
document.getElementById('btnUndo').onclick = handleUndo;
document.getElementById('btnChange').onclick = handleModifyFolder;

document.getElementById('btnCancelFolder').onclick = handleCancelFolder;
document.getElementById('btnSaveFolder').onclick = handleSaveFolder;

// Init
init();
