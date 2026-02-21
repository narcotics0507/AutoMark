import { AIService } from '../lib/ai_service.js';
import { BookmarkManager } from '../lib/bookmark_manager.js';
import { Logger } from '../lib/logger.js';

console.log('[Background] Service Worker Starting...');
Logger.log('Service Worker Initialized');

// Force refresh toolbar icon (bypass Chrome icon cache)
chrome.action.setIcon({
    path: {
        "16": "src/assets/icons/icon16.png",
        "32": "src/assets/icons/icon32.png",
        "48": "src/assets/icons/icon48.png",
        "128": "src/assets/icons/icon128.png"
    }
});

// Listen for new bookmarks
// Undo/Correction Data Store
const undoMap = new Map(); // <notificationId, { bookmarkId, originalParentId, movedToId }>

// Smart Debounce Queue: <bookmarkId, { timeoutId, startTime }>
const processingQueue = new Map();
const DEBOUNCE_DELAY = 4000; // 4 seconds

// Cache for folder structure to speed up AI context
let folderCache = null;
let lastCacheTime = 0;
const CACHE_TTL = 1000 * 60 * 5; // 5 minutes cache

async function getFolderContext(bm) {
    const now = Date.now();
    if (folderCache && (now - lastCacheTime < CACHE_TTL)) {
        return folderCache;
    }

    const tree = await bm.getTree();
    const flatList = bm.flatten(tree);
    const allPaths = Array.from(new Set(flatList.map(i => i.path).filter(p => p))).join(', ');

    folderCache = allPaths;
    lastCacheTime = now;
    return allPaths;
}

// Core Processing Logic (Extracted)
// Helper to determine notification position based on active window
async function getNotificationPosition(width, height) {
    let left = 100;
    let top = 100;
    try {
        const win = await new Promise(resolve => {
            chrome.windows.getLastFocused({}, (window) => {
                if (chrome.runtime.lastError) {
                    resolve(null);
                } else {
                    resolve(window);
                }
            });
        });

        if (win && win.left !== undefined) {
            // Position top-right of the active window
            left = win.left + win.width - width - 20;
            top = win.top + 20;
        }
    } catch (e) {
        Logger.error(`Failed to get last focused window: ${e.message}`);
    }
    return { left, top };
}

async function processBookmark(id) {
    // Remove from queue processing
    processingQueue.delete(id);

    try {
        // Fetch latest bookmark data (title/url might have changed during debounce)
        const [bookmark] = await new Promise(r => chrome.bookmarks.get(id, r));
        if (!bookmark || !bookmark.url) return;

        // 2. Check Settings
        const config = await chrome.storage.sync.get(['autoCategorize', 'apiProvider', 'apiEndpoint', 'apiKey', 'modelName', 'targetLanguage']);
        if (!config.autoCategorize || !config.apiKey) return;

        Logger.log(`Processing bookmark after debounce: ${bookmark.title}`);

        const ai = new AIService(config);
        const bm = new BookmarkManager();

        // 3. Get Context (Optimized)
        const allPaths = await getFolderContext(bm);
        Logger.log(`Context loaded. Paths length: ${allPaths.length}`);

        // 4. Classify
        const result = await ai.classifyBookmark(bookmark, allPaths);
        Logger.log(`AI suggestion: ${JSON.stringify(result)}`);

        if (result && result.path) {
            let targetPath = result.path;
            const originalParentId = bookmark.parentId;

            // Handle Root Folders in Path
            const [barNode] = await new Promise(r => chrome.bookmarks.get('1', r));
            const [otherNode] = await new Promise(r => chrome.bookmarks.get('2', r));

            let rootId = '1'; // Default
            let relativePath = targetPath;

            if (targetPath.startsWith(barNode.title)) {
                rootId = '1';
                if (targetPath === barNode.title) {
                    relativePath = '';
                } else if (targetPath.startsWith(barNode.title + '/')) {
                    relativePath = targetPath.substring(barNode.title.length + 1);
                }
            } else if (targetPath.startsWith(otherNode.title)) {
                rootId = '2';
                if (targetPath === otherNode.title) {
                    relativePath = '';
                } else if (targetPath.startsWith(otherNode.title + '/')) {
                    relativePath = targetPath.substring(otherNode.title.length + 1);
                }
            }

            // 5. Move
            let targetId = rootId;
            if (relativePath) {
                targetId = await bm.ensureFolder(relativePath, rootId);
            }
            let isSamePath = false;
            // Re-check parent in case user moved it at the very last millisecond
            const [currentBm] = await new Promise(r => chrome.bookmarks.get(id, r));
            if (currentBm.parentId !== originalParentId) {
                if (currentBm.parentId === targetId) {
                    Logger.log('Bookmark already moved to target during processing. Notifying user.');
                    isSamePath = true;
                } else {
                    Logger.log(`Bookmark moved externally during processing (from ${originalParentId} to ${currentBm.parentId}). Aborting move.`);
                    return;
                }
            }

            if (targetId === originalParentId) {
                Logger.log('Target is same as current. No move, but notifying user.');
                isSamePath = true;
            } else {
                await bm.moveBookmark(id, targetId);
                Logger.log(`Moved to ${targetPath} (ID: ${targetId})`);
            }

            // 6. Notify User
            const width = 450;
            const height = 420; // Compact height with internal scrolling
            let notifyUrl = `src/options/quick_organize_notify.html?id=${id}&path=${encodeURIComponent(targetPath)}&old=${originalParentId}&same=${isSamePath}&targetId=${targetId}`;

            // Pass original title and suggested title (Truncate to avoid URL limits)
            const safeTitle = bookmark.title.length > 100 ? bookmark.title.substring(0, 100) + '...' : bookmark.title;
            notifyUrl += `&msg=${encodeURIComponent(safeTitle)}`;
            if (result.suggested_title) {
                notifyUrl += `&suggestion=${encodeURIComponent(result.suggested_title)}`;
            }

            const pos = await getNotificationPosition(width, height);
            chrome.windows.create({
                url: notifyUrl,
                type: 'popup',
                width: width,
                height: height,
                left: pos.left,
                top: pos.top,
                focused: true
            });
        } else {
            Logger.log('AI returned no path.');
        }
    } catch (e) {
        Logger.error(`Auto-categorize failed: ${e.message}`);
        try {
            const width = 450;
            const height = 200;
            const pos = await getNotificationPosition(width, height);
            chrome.windows.create({
                url: `src/options/quick_organize_notify.html?error=${encodeURIComponent(e.message)}&id=${id}`,
                type: 'popup',
                width: width,
                height: height,
                left: pos.left,
                top: pos.top,
                focused: true
            });
        } catch (winErr) { }
    }
}

// Import Guard State
const IMPORT_THRESHOLD = 5; // Max bookmarks allowed in window
const IMPORT_WINDOW = 2000; // 2 seconds window
const IMPORT_PAUSE_DURATION = 10000; // Pause for 10 seconds after last import event
let creationTimestamps = [];
let isImporting = false;
let importTimeout = null;

// 1. On Created -> Start Timer
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
    if (!bookmark.url) return; // Ignore folders immediately

    // --- IMPORT GUARD START ---
    const now = Date.now();
    creationTimestamps.push(now);
    // Keep only timestamps within the window
    creationTimestamps = creationTimestamps.filter(t => now - t < IMPORT_WINDOW);

    if (creationTimestamps.length > IMPORT_THRESHOLD) {
        // Threshold exceeded: Enter/Extend Import Mode
        if (!isImporting) {
            isImporting = true;
            Logger.log(`[ImportGuard] Rapid creation detected (${creationTimestamps.length} in ${IMPORT_WINDOW}ms). Pausing auto-categorize.`);

            // Clear any pending single-bookmark processing to save resources
            processingQueue.forEach((item, key) => {
                clearTimeout(item.timeoutId);
                processingQueue.delete(key);
            });

            // Notify User via Popup Window (Consistent with other UIs)
            try {
                const width = 450;
                const height = 200; // Small height for warning
                // Reuse getNotificationPosition if possible, or duplicate logic if scope issue
                // Since getNotificationPosition is defined above in the same file, we can call it.
                // Note: getNotificationPosition is likely not hoisted if defined as const/let, but here it is function so it's fine?
                // Wait, it's defined as async function getNotificationPosition... earlier in file. Yes.

                // We need to call it async
                getNotificationPosition(width, height).then(pos => {
                    chrome.windows.create({
                        url: 'src/options/quick_organize_notify.html?warning=' + encodeURIComponent('检测到批量导入书签，为保护书签结构，自动分类功能已暂停 10 秒。'),
                        type: 'popup',
                        width: width,
                        height: height,
                        left: pos.left,
                        top: pos.top,
                        focused: true
                    });
                });

            } catch (e) {
                Logger.error(`Failed to open warning popup: ${e.message}`);
            }
        }

        // Reset/Extend the pause timer
        if (importTimeout) clearTimeout(importTimeout);
        importTimeout = setTimeout(() => {
            isImporting = false;
            creationTimestamps = []; // Reset history
            Logger.log('[ImportGuard] Import activity stopped. Resuming normal operation.');
            // No need to clear notification since we used a popup that auto-closes or user closes
        }, IMPORT_PAUSE_DURATION);

        return; // EXIT IMMEDIATELY - Do not queue for processing
    }

    if (isImporting) {
        // Still in import mode (within the pause duration), just extend timer and exit
        if (importTimeout) clearTimeout(importTimeout);
        importTimeout = setTimeout(() => {
            isImporting = false;
            creationTimestamps = [];
            Logger.log('[ImportGuard] Import activity stopped. Resuming normal operation.');

        }, IMPORT_PAUSE_DURATION);
        return;
    }
    // --- IMPORT GUARD END ---

    // Check settings early to avoid setting timers unnecessarily?

    // Quick check logic to avoid checking storage for EVERY bookmark if we can cache it? 
    // For now, let's just stick to the debounce logic which is robust.

    Logger.log(`New bookmark created: ${bookmark.title}. Waiting ${DEBOUNCE_DELAY}ms...`);

    const timeoutId = setTimeout(() => processBookmark(id), DEBOUNCE_DELAY);
    processingQueue.set(id, { timeoutId, startTime: Date.now() });
});



// 3. On Moved -> Cancel Timer (User manually filed it)
// 3. On Moved -> Reset Timer (User might be organizing, let's wait until they settle)
chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
    if (processingQueue.has(id)) {
        const item = processingQueue.get(id);
        clearTimeout(item.timeoutId);

        // Reset timer
        Logger.log(`Bookmark ${id} moved. Resetting timer...`);
        const timeoutId = setTimeout(() => processBookmark(id), DEBOUNCE_DELAY);
        processingQueue.set(id, { timeoutId, startTime: Date.now() });
    }
});

// 4. On Removed -> Cancel Timer
chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
    if (processingQueue.has(id)) {
        const item = processingQueue.get(id);
        clearTimeout(item.timeoutId);
        processingQueue.delete(id);
    }
});
