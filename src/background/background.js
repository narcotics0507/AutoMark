import { AIService } from '../lib/ai_service.js';
import { BookmarkManager } from '../lib/bookmark_manager.js';

// Listen for new bookmarks
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
    // 1. Basic checks
    if (!bookmark.url) return; // Ignore folders

    // 2. Check Settings
    const config = await chrome.storage.sync.get(['autoCategorize', 'apiProvider', 'apiEndpoint', 'apiKey', 'modelName', 'targetLanguage']);
    if (!config.autoCategorize || !config.apiKey) return;

    console.log('Auto-categorizing new bookmark:', bookmark.title);

    try {
        const ai = new AIService(config);
        const bm = new BookmarkManager();

        // 3. Get Context (Top level folders for speed?)
        // Getting full tree might be heavy? Let's get full tree but only extract paths.
        // actually flat list is fast enough for <2000 items.
        const tree = await bm.getTree();
        const flatList = bm.flatten(tree);
        const allPaths = Array.from(new Set(flatList.map(i => i.path).filter(p => p))).slice(0, 100).join(', ');

        // 4. Classify
        const targetPath = await ai.classifyBookmark(bookmark, allPaths);

        if (targetPath) {
            console.log(`AI suggested path: ${targetPath}`);
            // 5. Move
            const targetId = await bm.ensureFolder(targetPath, '1'); // '1' is bookmarks bar usually
            await bm.moveBookmark(id, targetId);
            console.log('Moved successfully.');
        }
    } catch (e) {
        console.error('Auto-categorize failed:', e);
    }
});
