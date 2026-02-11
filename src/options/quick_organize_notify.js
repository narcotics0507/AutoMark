import { BookmarkManager } from '../lib/bookmark_manager.js';

const params = new URLSearchParams(window.location.search);
const bookmarkId = params.get('id');
const targetPath = decodeURIComponent(params.get('path') || '');
const reason = decodeURIComponent(params.get('reason') || 'AI Decision');
const errorMsg = decodeURIComponent(params.get('error') || '');
const oldParentId = params.get('old');

const bmManager = new BookmarkManager();

const isSamePath = params.get('same') === 'true';

if (errorMsg) {
    // Error State
    document.body.classList.add('error-mode');
    document.querySelector('.message').textContent = '⚠️ 自动分类失败';
    document.getElementById('target-path').textContent = errorMsg;
    document.getElementById('target-path').style.color = '#d32f2f'; // Red
    document.getElementById('target-path').style.fontSize = '0.9rem';
    document.getElementById('ai-reason').style.display = 'none';

    // Hide Undo, Show Settings maybe?
    document.getElementById('btnUndo').style.display = 'none';
    document.getElementById('btnConfirm').textContent = '关闭';
} else {
    // Normal Success State
    if (isSamePath) {
        document.querySelector('.message').textContent = 'AI 建议存放于 (当前位置)';
        document.getElementById('btnUndo').style.display = 'none'; // Nothing to undo
    } else {
        document.querySelector('.message').textContent = '已自动将书签移动到';
    }
    document.getElementById('target-path').textContent = targetPath;
    document.getElementById('ai-reason').textContent = `💡 ${reason}`;
}

// Auto-close timer (5 seconds)
setTimeout(() => {
    // Error mode specific logic is handled above by checking errorMsg
    // But we might want the timer to still work (auto close error msg).
    // Yes, keep timer.

    // If error, maybe change timer color?
    if (errorMsg) {
        document.getElementById('timer-bar').style.background = '#d32f2f';
    }
}, 100);

const targetId = params.get('targetId');

// ... (existing code)

// Helper to confirm and move
async function confirmAndClose() {
    if (targetId && targetId !== oldParentId) {
        try {
            await bmManager.moveBookmark(bookmarkId, targetId);
        } catch (e) {
            console.error('Failed to enforce move:', e);
        }
    }
    window.close();
}

// Auto-close timer (5 seconds)
const autoClose = setTimeout(() => {
    confirmAndClose();
}, 5000);

// Stop timer on hover
document.body.addEventListener('mouseenter', () => clearTimeout(autoClose));

// ... (undo logic remains same)

// Confirm (Close directly)
document.getElementById('btnConfirm').onclick = () => {
    confirmAndClose();
};
