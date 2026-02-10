export class BookmarkManager {
    constructor() { }

    /**
     * Get the entire bookmark tree
     */
    async getTree() {
        return new Promise((resolve) => {
            chrome.bookmarks.getTree((tree) => {
                resolve(tree);
            });
        });
    }

    async getSubTree(id) {
        return new Promise((resolve) => {
            chrome.bookmarks.getSubTree(id, (results) => {
                resolve(results);
            });
        });
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
                currentPath = parentPath ? `${parentPath}/${node.title}` : node.title;
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
            const children = await new Promise(resolve => chrome.bookmarks.getChildren(currentParentId, resolve));
            const existing = children.find(c => c.title === part && !c.url);

            if (existing) {
                currentParentId = existing.id;
            } else {
                const newFolder = await new Promise(resolve => {
                    chrome.bookmarks.create({
                        parentId: currentParentId,
                        title: part
                    }, resolve);
                });
                currentParentId = newFolder.id;
            }
        }
        return currentParentId;
    }

    async moveBookmark(id, targetParentId) {
        if (!targetParentId) return;
        return new Promise(resolve => {
            chrome.bookmarks.move(id, { parentId: targetParentId }, resolve);
        });
    }

    async renameBookmark(id, newTitle) {
        return new Promise(resolve => {
            chrome.bookmarks.update(id, { title: newTitle }, resolve);
        });
    }

    async removeBookmark(id) {
        return new Promise(resolve => {
            chrome.bookmarks.remove(id, resolve);
        });
    }
}
