import assert from 'node:assert/strict';
import { Organizer } from '../src/lib/organizer.js';

global.chrome = { bookmarks: {} };

const organizer = new Organizer({ onLog: () => {}, onStatus: () => {}, onProgress: () => {} });
const bookmarks = [
    { id: '1', title: 'React – A JavaScript library', path: 'Bookmarks Bar' },
    { id: '2', title: 'Good title', path: 'Bookmarks Bar/Docs' }
];
const moves = [
    { bookmark_id: '1', target_folder_path: 'Development/Frontend', suggested_title: 'React 官方文档' },
    { bookmark_id: '1', target_folder_path: 'Development/Frontend', suggested_title: 'React 官方文档' },
    { bookmark_id: '2', target_folder_path: 'Docs', suggested_title: 'Good title' },
    { bookmark_id: 'missing', target_folder_path: 'Docs', suggested_title: 'Unknown' }
];

assert.deepEqual(organizer.collectBookmarkRenames(moves, bookmarks), [{
    bookmark_id: '1',
    old_title: 'React – A JavaScript library',
    new_title: 'React 官方文档',
    path: 'Bookmarks Bar'
}]);

const calls = [];
organizer.bm = {
    ensureFolder: async (path) => {
        calls.push(`folder:${path}`);
        return 'target';
    },
    moveBookmark: async (id) => calls.push(`move:${id}`),
    renameBookmark: async (id, title) => calls.push(`rename:${id}:${title}`),
    removeBookmark: async () => {}
};

await organizer.executePlanLogic({
    folders_to_create: [],
    folders_to_rename: [],
    bookmarks_to_move: [{ bookmark_id: '1', target_folder_path: 'Development/Frontend' }],
    bookmarks_to_rename: [{ bookmark_id: '1', new_title: 'React 官方文档' }],
    archive: [],
    dead_links: [],
    duplicates: []
});

assert.deepEqual(calls, [
    'folder:Development/Frontend',
    'move:1',
    'rename:1:React 官方文档'
]);

const emptyPlan = () => ({
    folders_to_create: [],
    folders_to_rename: [],
    bookmarks_to_move: [],
    bookmarks_to_rename: [],
    archive: [],
    dead_links: [],
    duplicates: []
});

const runCancelledFolderSetup = async (section, item) => {
    const setupCalls = [];
    const cancelledOrganizer = new Organizer({
        onLog: () => {},
        onStatus: () => {},
        onProgress: () => {}
    });
    cancelledOrganizer.bm = {
        ensureFolder: async path => {
            setupCalls.push(`folder:${path}`);
            return 'target';
        },
        moveBookmark: async () => setupCalls.push('move'),
        renameBookmark: async () => {},
        removeBookmark: async () => {}
    };
    cancelledOrganizer.isCancelled = true;

    let error;
    try {
        await cancelledOrganizer.executePlanLogic({ ...emptyPlan(), [section]: [item] });
    } catch (caught) {
        error = caught;
    }

    return { error, setupCalls };
};

const cancelledSetups = await Promise.all([
    runCancelledFolderSetup('archive', { bookmark_id: 'archive-1', title: 'Archive me' }),
    runCancelledFolderSetup('dead_links', { bookmark_id: 'dead-1', url: 'https://dead.example' })
]);
for (const { error, setupCalls } of cancelledSetups) {
    assert.match(error?.message || '', /操作已取消/);
    assert.deepEqual(setupCalls, [], 'cancellation must be checked before creating category folders');
}

const resilienceCalls = [];
const resilienceLogs = [];
const resilientOrganizer = new Organizer({
    onLog: message => resilienceLogs.push(message),
    onStatus: () => {},
    onProgress: () => {}
});
resilientOrganizer.bm = {
    ensureFolder: async path => {
        resilienceCalls.push(`folder:${path}`);
        throw new Error(`simulated ${path} failure`);
    },
    moveBookmark: async id => resilienceCalls.push(`move:${id}`),
    renameBookmark: async () => {},
    removeBookmark: async id => resilienceCalls.push(`remove:${id}`)
};

await resilientOrganizer.executePlanLogic({
    ...emptyPlan(),
    archive: [{ bookmark_id: 'archive-1', title: 'Archive me' }],
    dead_links: [{ bookmark_id: 'dead-1', url: 'https://dead.example' }],
    duplicates: [{ bookmark_id: 'duplicate-1', title: 'Duplicate' }]
});

assert.deepEqual(resilienceCalls, [
    'folder:Archive',
    'folder:失效链接归档',
    'remove:duplicate-1'
]);
assert(resilienceLogs.some(message => message.includes('simulated Archive failure')));
assert(resilienceLogs.some(message => message.includes('simulated 失效链接归档 failure')));

console.log('Organizer rename tests passed');
