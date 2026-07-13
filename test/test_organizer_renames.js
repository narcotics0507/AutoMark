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

console.log('Organizer rename tests passed');
