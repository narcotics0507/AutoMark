
// Mock Chrome API
global.chrome = {
    bookmarks: {
        getTree: (cb) => {
            cb([{
                id: '0',
                title: 'Root',
                children: [
                    {
                        id: '1',
                        title: 'Bookmarks Bar',
                        children: [
                            { id: '10', title: 'Work', children: [{ id: '101', title: 'Jira', url: 'http://jira.com' }] },
                            { id: '11', title: 'Google', url: 'http://google.com' },
                            { id: '12', title: 'React Docs', url: 'http://react.dev' }
                        ]
                    },
                    {
                        id: '2',
                        title: 'Other Bookmarks',
                        children: []
                    }
                ]
            }]);
        },
        getSubTree: (id, cb) => {
            // Simple mock
            if (id === '1') {
                cb([{
                    id: '1',
                    title: 'Bookmarks Bar',
                    children: [
                        { id: '10', title: 'Work', children: [{ id: '101', title: 'Jira', url: 'http://jira.com' }] },
                        { id: '11', title: 'Google', url: 'http://google.com' },
                        { id: '12', title: 'React Docs', url: 'http://react.dev' }
                    ]
                }]);
            } else {
                cb([]);
            }
        },
        getChildren: (id, cb) => {
            console.log('[Mock] getChildren', id);
            // Return children of "Bookmarks Bar" (1) or "Work" (10)
            if (id === '1') {
                cb([
                    { id: '10', title: 'Work', parentId: '1' }, // Folder
                    { id: '11', title: 'Google', url: 'http://google.com', parentId: '1' },
                    { id: '12', title: 'React Docs', url: 'http://react.dev', parentId: '1' }
                ]);
            } else if (id === '10') {
                cb([{ id: '101', title: 'Jira', url: 'http://jira.com', parentId: '10' }]);
            } else {
                cb([]);
            }
        },
        create: (data, cb) => {
            console.log('[Mock] create', data);
            cb({ id: Math.random().toString(), ...data });
        },
        move: (id, data, cb) => {
            console.log('[Mock] move', id, data);
            if (cb) cb();
        },
        update: (id, data, cb) => {
            console.log('[Mock] update', id, data);
            if (cb) cb();
        },
        remove: (id, cb) => {
            console.log('[Mock] remove', id);
            if (cb) cb();
        }
    },
    storage: {
        sync: {
            get: (keys) => Promise.resolve({
                apiKey: 'mock-key',
                apiProvider: 'custom',
                targetLanguage: 'zh-CN'
            }) // Simplified to return promise immediately or accept logic
        }
    }
};

// Mock fetch
global.fetch = async (url, options) => {
    console.log('[Mock] fetch', url);
    return {
        ok: true,
        headers: {
            get: () => 'application/json'
        },
        json: async () => ({
            choices: [{
                message: {
                    content: JSON.stringify({
                        folders_to_create: [{ path: '前端开发', parent_path: 'Bookmarks Bar' }],
                        bookmarks_to_move: [{ bookmark_id: '12', target_folder_path: '前端开发' }]
                    })
                }
            }]
        })
    };
};
