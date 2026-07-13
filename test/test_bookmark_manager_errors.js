import assert from 'node:assert/strict';
import { BookmarkManager } from '../src/lib/bookmark_manager.js';

const manager = new BookmarkManager();

const failCallback = (callback, message, result) => {
    chrome.runtime.lastError = { message };
    callback(result);
    delete chrome.runtime.lastError;
};

const installBookmarksMock = overrides => {
    global.chrome = {
        runtime: {},
        bookmarks: {
            getTree: callback => callback([]),
            getSubTree: (_id, callback) => callback([]),
            getChildren: (_id, callback) => callback([]),
            create: (_details, callback) => callback({ id: 'created-folder' }),
            move: (_id, _destination, callback) => callback({ id: 'moved' }),
            update: (_id, _changes, callback) => callback({ id: 'updated' }),
            remove: (_id, callback) => callback(),
            ...overrides
        }
    };
};

const mutationFailures = [
    {
        name: 'move',
        install: () => installBookmarksMock({
            move: (_id, _destination, done) => failCallback(done, 'move failed')
        }),
        run: () => manager.moveBookmark('bookmark-1', 'folder-1')
    },
    {
        name: 'rename',
        install: () => installBookmarksMock({
            update: (_id, _changes, done) => failCallback(done, 'rename failed')
        }),
        run: () => manager.renameBookmark('bookmark-1', 'New title')
    },
    {
        name: 'remove',
        install: () => installBookmarksMock({
            remove: (_id, done) => failCallback(done, 'remove failed')
        }),
        run: () => manager.removeBookmark('bookmark-1')
    }
];

for (const scenario of mutationFailures) {
    scenario.install();
    await assert.rejects(scenario.run, new RegExp(`${scenario.name} failed`));
}

installBookmarksMock({
    getChildren: (_id, done) => failCallback(done, 'folder lookup failed')
});
await assert.rejects(() => manager.ensureFolder('Archive'), /folder lookup failed/);

installBookmarksMock({
    create: (_details, done) => failCallback(done, 'folder creation failed')
});
await assert.rejects(() => manager.ensureFolder('Archive'), /folder creation failed/);

installBookmarksMock({
    getTree: done => failCallback(done, 'tree read failed')
});
await assert.rejects(() => manager.getTree(), /tree read failed/);

installBookmarksMock({
    getSubTree: (_id, done) => failCallback(done, 'subtree read failed')
});
await assert.rejects(() => manager.getSubTree('folder-1'), /subtree read failed/);

console.log('Bookmark manager error propagation tests passed');
