export class BookmarkManager {
    constructor() { }

    _callBookmarkApi(registerCallback) {
        return new Promise((resolve, reject) => {
            registerCallback((result) => {
                const lastError = chrome.runtime?.lastError;
                if (lastError) {
                    reject(new Error(lastError.message || String(lastError)));
                    return;
                }
                resolve(result);
            });
        });
    }

    /**
     * Get the entire bookmark tree
     */
    async getTree() {
        return this._callBookmarkApi(callback => chrome.bookmarks.getTree(callback));
    }

    async getSubTree(id) {
        return this._callBookmarkApi(callback => chrome.bookmarks.getSubTree(id, callback));
    }


    /**
     * Flatten the tree into a list of items with their full paths
     * @param {Array} nodes 
     * @param {String} parentPath 
     */
    flatten(nodes, parentPath = '') {
        let result = [];

        for (const node of nodes) {
            // Skip Root folders that we can't move (id 0, 1, 2 typically)
            // 0: Root, 1: Bookmarks Bar, 2: Other Bookmarks
            // We want to process their children, but we track path

            let currentPath = parentPath;
            if (node.title && node.id !== '0') {
                if (!node.url) {
                    currentPath = parentPath ? `${parentPath}/${node.title}` : node.title;
                } else {
                    currentPath = parentPath;
                }
            }

            const item = {
                id: node.id,
                title: node.title,
                url: node.url || null,
                is_folder: !node.url,
                parent_id: node.parentId,
                path: currentPath
            };

            // We only include actual user bookmarks/folders in the "to be processed" list
            // We exclude the root node itself (id:0)
            if (node.id !== '0') {
                result.push(item);
            }

            if (node.children) {
                result = result.concat(this.flatten(node.children, currentPath));
            }
        }
        return result;
    }

    /**
     * Find a folder by path, or ensure it exists
     * @param {String} path - e.g. "Development/Backend"
     * @param {String} rootId - ID of the root to start searching from (usually '1' for Bar or '2' for Other)
     */
    async ensureFolder(path, rootId = '1') {
        const parts = path.split('/');
        let currentParentId = rootId;

        for (const part of parts) {
            const children = await this._callBookmarkApi(
                callback => chrome.bookmarks.getChildren(currentParentId, callback)
            );
            const existing = children.find(c => c.title === part && !c.url);

            if (existing) {
                currentParentId = existing.id;
            } else {
                const newFolder = await this._callBookmarkApi(callback => {
                    chrome.bookmarks.create({
                        parentId: currentParentId,
                        title: part
                    }, callback);
                });
                currentParentId = newFolder.id;
            }
        }
        return currentParentId;
    }

    async moveBookmark(id, targetParentId) {
        if (!targetParentId) return;
        return this._callBookmarkApi(
            callback => chrome.bookmarks.move(id, { parentId: targetParentId }, callback)
        );
    }

    async renameBookmark(id, newTitle) {
        return this._callBookmarkApi(
            callback => chrome.bookmarks.update(id, { title: newTitle }, callback)
        );
    }

    async removeBookmark(id) {
        return this._callBookmarkApi(callback => chrome.bookmarks.remove(id, callback));
    }
}
