import { BookmarkManager } from './bookmark_manager.js';
import { AIService } from './ai_service.js';

export class Organizer {
    constructor({ onLog, onStatus, onProgress, config }) {
        this.onLog = onLog || console.log;
        this.onStatus = onStatus || console.log;
        this.onProgress = onProgress || ((p, m) => { }); // percentage (0-100), message
        this.bm = new BookmarkManager();
        this.config = config || {};
        this.isCancelled = false;
    }

    cancel() {
        this.isCancelled = true;
        this.onLog('操作已取消', 'warning');
        this.onStatus('cancelled', '已取消', '操作被用户取消');
    }

    async getTopLevelFolders() {
        const tree = await this.bm.getTree();
        // tree[0] is root. children are '1' (Bookmarks Bar), '2' (Other), possibly others
        const root = tree[0];
        if (!root || !root.children) return [];

        let folders = [];
        for (const node of root.children) {
            if (node.children) {
                // Add the root folder itself (e.g. Bookmarks Bar)
                folders.push({
                    id: node.id,
                    title: node.title,
                    type: 'root_folder',
                    path: node.title
                });

                // Simplified approach: List direct children of "Bookmarks Bar" and "Other Bookmarks" that are folders.
                for (const child of node.children) {
                    if (!child.url) { // is folder
                        folders.push({
                            id: child.id,
                            title: child.title,
                            parentId: node.id,
                            parentTitle: node.title,
                            path: `${node.title}/${child.title}`
                        });
                    }
                }
            }
        }
        return folders;
    }

    // New method: Analyze only
    async analyze(selectedFolderIds = null, options = {}) {
        const { checkDeadLinks = false, skipAI = false, checkDuplicates = false } = options;

        this.isCancelled = false;
        this.onStatus('scanning', '正在扫描', '获取书签数据...');
        this.onProgress(5, '正在读取书签...');
        this.onLog('正在读取 Chrome 书签...');

        // 1. Get Bookmarks
        const tree = await this.bm.getTree();
        let flatList = this.bm.flatten(tree).filter(n => n.url); // Only bookmarks

        // Filter based on selectedFolderIds if provided
        if (selectedFolderIds && selectedFolderIds.length > 0) {
            if (this.isCancelled) throw new Error('操作已取消');
            this.onLog(`只处理选中的 ${selectedFolderIds.length} 个文件夹...`);
            let newFlatList = [];
            for (const id of selectedFolderIds) {
                if (this.isCancelled) throw new Error('操作已取消');
                const subTree = await this.bm.getSubTree(id);
                const subFlat = this.bm.flatten(subTree).filter(n => n.url);
                newFlatList = newFlatList.concat(subFlat);
            }
            // Remove duplicates just in case
            flatList = [...new Map(newFlatList.map(item => [item.id, item])).values()];
        }

        this.onLog(`扫描完成，共找到 ${flatList.length} 个项目。`);
        this.onProgress(10, '书签扫描完成');

        if (this.isCancelled) throw new Error('操作已取消');

        const masterPlan = {
            folders_to_create: [],
            folders_to_rename: [],
            bookmarks_to_move: [],
            archive: [],
            dead_links: [],
            duplicates: []
        };

        // 2. Dead Link Detection
        if (checkDeadLinks) {
            this.onStatus('checking', '检测死链', '正在检测失效链接 (可能较慢)...');
            this.onLog('开始检测链接有效性...');
            const deadLinks = await this.checkDeadLinks(flatList);
            masterPlan.dead_links = deadLinks;
            this.onLog(`检测完成，发现 ${deadLinks.length} 个失效链接。`);

            if (this.isCancelled) throw new Error('操作已取消');
        }

        // 3. Duplicate Detection
        if (checkDuplicates) {
            this.onStatus('checking', '检测重复', '正在检测重复书签...');
            this.onLog('开始检测重复书签...');
            const duplicates = await this.checkDuplicates(flatList);
            masterPlan.duplicates = duplicates;
            this.onLog(`检测完成，发现 ${duplicates.length} 个重复/从属书签。`);

            if (this.isCancelled) throw new Error('操作已取消');
        }

        // 4. AI Analysis (Optional)
        // Only run AI if NOT skipped AND (we are not just doing utilities like deadlinks/duplicates OR user wants both)
        // Actually, if skipAI is true, we skip. 
        if (!skipAI) {
            this.onStatus('analyzing', '正在思考', 'AI 正在分批分析您的书签...');

            const config = await chrome.storage.sync.get(['apiProvider', 'apiEndpoint', 'apiKey', 'modelName', 'targetLanguage']);
            if (!config.apiKey) throw new Error('API Key 未配置');

            if (this.config.targetLanguage) {
                config.targetLanguage = this.config.targetLanguage;
            }

            const ai = new AIService(config);
            const BATCH_SIZE = 50;
            const chunks = [];
            for (let i = 0; i < flatList.length; i += BATCH_SIZE) {
                chunks.push(flatList.slice(i, i + BATCH_SIZE));
            }

            this.onLog(`将分 ${chunks.length} 批次进行处理，以避免超时...`);

            for (let i = 0; i < chunks.length; i++) {
                if (this.isCancelled) throw new Error('操作已取消');

                const chunk = chunks[i];
                const batchNum = i + 1;
                const progressBase = 10 + Math.floor((i / chunks.length) * 80); // 10% -> 90%

                this.onProgress(progressBase, `正在分析第 ${batchNum}/${chunks.length} 批...`);
                this.onLog(`[Batch ${batchNum}/${chunks.length}] 正在发送 ${chunk.length} 个书签...`);

                try {
                    const batchPlan = await ai.generatePlan(chunk, (msg) => this.onLog(`[Net] ${msg}`));

                    // Merge results
                    if (batchPlan.folders_to_create) masterPlan.folders_to_create.push(...batchPlan.folders_to_create);
                    if (batchPlan.folders_to_rename) masterPlan.folders_to_rename.push(...batchPlan.folders_to_rename);
                    if (batchPlan.bookmarks_to_move) masterPlan.bookmarks_to_move.push(...batchPlan.bookmarks_to_move);
                    if (batchPlan.archive) masterPlan.archive.push(...batchPlan.archive);

                    this.onLog(`[Batch ${batchNum}] 分析完成，生成 ${batchPlan.bookmarks_to_move?.length || 0} 个移动指令`);
                } catch (e) {
                    this.onLog(`[Batch ${batchNum}] ⚠️ 本批次失败: ${e.message}`, 'error');
                }
            }

            this.onLog('所有批次分析完成！');
        } else {
            this.onLog('跳过 AI 分析步骤。');
        }

        this.onProgress(100, '分析完成，请审查计划');
        this.onStatus('review', '等待审查', '请确认以下变更计划');

        // Hydrate plan with titles for UI
        const idMap = new Map();
        flatList.forEach(item => idMap.set(item.id, item));

        const hydrate = (arr, type) => {
            if (!arr) return;
            arr.forEach(item => {
                const bm = idMap.get(item.bookmark_id);
                if (bm) {
                    item.title = item.title || bm.title;
                    item.url = item.url || bm.url;
                    item.old_path = bm.path;
                    if (type === 'rename') {
                        item.old_title = bm.title;
                        item.path = bm.path;
                    }
                }
            });
        }

        hydrate(masterPlan.bookmarks_to_move);
        hydrate(masterPlan.archive);
        hydrate(masterPlan.dead_links);
        hydrate(masterPlan.duplicates);
        hydrate(masterPlan.folders_to_rename, 'rename');

        return masterPlan;
    }

    async checkDuplicates(bookmarks) {
        const toDelete = [];

        // Helper to normalize URL for comparison
        const normalize = (urlString) => {
            try {
                const u = new URL(urlString);
                // 1. Ignore protocol (http vs https) - just use https for key
                // 2. Ignore www prefix in hostname
                let host = u.hostname.replace(/^www\./, '');

                // 3. Remove UTM parameters and other common tracking
                // We recreate the search params
                const params = new URLSearchParams(u.search);
                const keys = Array.from(params.keys());
                keys.forEach(key => {
                    if (key.startsWith('utm_') || key === 'fbclid' || key === 'gclid') {
                        params.delete(key);
                    }
                });

                // Reconstruct
                // Note: we don't change the actual bookmark URL, just the key for comparison
                return `${host}${u.pathname}${params.toString() ? '?' + params.toString() : ''}${u.hash}`;
            } catch (e) {
                return urlString; // Fallback
            }
        };

        // Group by Normalized Host
        const byHost = {};
        for (const bm of bookmarks) {
            try {
                const url = new URL(bm.url);
                // Use normalized host for grouping too
                const host = url.hostname.replace(/^www\./, '');
                if (!byHost[host]) byHost[host] = [];
                byHost[host].push({ ...bm, parsedUrl: url, normalizedKey: normalize(bm.url) });
            } catch (e) {
                // Ignore invalid URLs
            }
        }

        for (const host in byHost) {
            const group = byHost[host];
            if (group.length < 2) continue;

            // Find Root bookmarks
            // Root criteria: pathname is '/' or empty, and no query/hash (mostly)
            const isRoot = (item) => {
                const p = item.parsedUrl.pathname;
                return (p === '/' || p === '') && item.parsedUrl.search === '' && item.parsedUrl.hash === '';
            };

            const roots = group.filter(isRoot);

            if (roots.length > 0) {
                // Case 1: Root exits.
                // Keep ONE root (prefer https if available, or just first).
                // Mark ALL others in this group as duplicates.

                const keeper = roots[0];

                // All other items in group are duplicates
                for (const item of group) {
                    if (item.id === keeper.id) continue;

                    let reason = 'Duplicate Subpage';
                    if (isRoot(item)) reason = 'Duplicate Root';

                    toDelete.push({
                        bookmark_id: item.id,
                        title: item.title,
                        url: item.url,
                        reason: reason,
                        keep_id: keeper.id,
                        keep_title: keeper.title,
                        keep_url: keeper.url // Added for UI
                    });
                }
            } else {
                // Case 2: No Root exists. Group by Normalized URL Key.
                const byKey = {};
                for (const item of group) {
                    const key = item.normalizedKey;
                    if (!byKey[key]) byKey[key] = [];
                    byKey[key].push(item);
                }

                for (const key in byKey) {
                    const exacts = byKey[key];
                    if (exacts.length > 1) {
                        // Keep first, delete rest
                        const keeper = exacts[0];
                        for (let i = 1; i < exacts.length; i++) {
                            toDelete.push({
                                bookmark_id: exacts[i].id,
                                title: exacts[i].title,
                                url: exacts[i].url,
                                reason: 'Exact/Normalized Duplicate',
                                keep_id: keeper.id,
                                keep_title: keeper.title,
                                keep_url: keeper.url // Added for UI
                            });
                        }
                    }
                }
            }
        }
        return toDelete;
    }

    async checkDeadLinks(bookmarks) {
        const dead = [];
        const CONCURRENT_LIMIT = 5;
        let processed = 0;

        const checkUrl = async (bm) => {
            if (this.isCancelled) return;
            try {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), 8000); // 8s timeout

                await fetch(bm.url, {
                    method: 'GET',
                    signal: controller.signal,
                    mode: 'no-cors'
                });
                clearTimeout(id);
            } catch (e) {
                if (e.name === 'AbortError') {
                    dead.push({ bookmark_id: bm.id, url: bm.url, title: bm.title, reason: 'Timeout' });
                } else {
                    dead.push({ bookmark_id: bm.id, url: bm.url, title: bm.title, reason: 'Network Error' });
                }
            } finally {
                processed++;
                const pct = Math.floor((processed / bookmarks.length) * 100);
                if (processed % 5 === 0) this.onProgress(pct, `检测链接 ${processed}/${bookmarks.length}`);
            }
        };

        for (let i = 0; i < bookmarks.length; i += CONCURRENT_LIMIT) {
            if (this.isCancelled) break;
            const chunk = bookmarks.slice(i, i + CONCURRENT_LIMIT);
            await Promise.all(chunk.map(checkUrl));
        }

        return dead;
    }

    async execute(plan) {
        this.isCancelled = false;
        this.onStatus('organizing', '正在整理', '正在执行整理计划...');
        this.onProgress(0, '开始执行...');

        await this.executePlanLogic(plan);

        if (this.isCancelled) throw new Error('操作已取消');

        // Cleanup empty folders
        this.onLog('[cleanup] 清理空文件夹...');
        await this.cleanupEmptyFolders();

        this.onProgress(100, '整理完成！');
        this.onStatus('idle', '就绪', '所有操作已完成');
    }

    async cleanupEmptyFolders() {
        // Refresh tree
        const tree = await this.bm.getTree();
        let removedCount = 0;

        // Recursive function to check and remove empty folders
        const checkAndRemove = async (node) => {
            if (this.isCancelled) return false;

            // Skip root nodes (0, 1, 2)
            if (node.id === '0' || node.id === '1' || node.id === '2') {
                if (node.children) {
                    for (const child of node.children) {
                        await checkAndRemove(child);
                        if (this.isCancelled) return false;
                    }
                }
                return false;
            }

            // If it's a bookmark (url exists), it's not empty
            if (node.url) {
                return false;
            }

            // It's a folder. Check children first.
            if (node.children && node.children.length > 0) {
                let contentCount = 0;
                for (const child of node.children) {
                    if (this.isCancelled) return false;
                    const isRemoved = await checkAndRemove(child);
                    if (!isRemoved) {
                        contentCount++;
                    }
                }

                if (contentCount === 0) {
                    if (!this.isCancelled) {
                        await this.bm.removeBookmark(node.id);
                        removedCount++;
                    }
                    return true;
                }
                return false;
            } else {
                // It's a folder and has no children
                if (!this.isCancelled) {
                    await this.bm.removeBookmark(node.id);
                    removedCount++;
                }
                return true;
            }
        };

        if (tree && tree[0]) {
            await checkAndRemove(tree[0]);
        }
        return removedCount;
    }

    async executePlanLogic(plan) {
        const gets = (arr) => arr ? arr.length : 0;
        const totalOps = gets(plan.folders_to_create) + gets(plan.folders_to_rename) + gets(plan.bookmarks_to_move) + gets(plan.archive) + gets(plan.dead_links) + gets(plan.duplicates);
        let completedOps = 0;

        const updateProgress = (msg) => {
            completedOps++;
            const pct = Math.floor((completedOps / totalOps) * 100);
            this.onProgress(pct, msg);
        };

        // 4.1 Create Folders
        if (plan.folders_to_create) {
            this.onLog(`[mkdir] 需要创建 ${plan.folders_to_create.length} 个新文件夹`);
            for (const folder of plan.folders_to_create) {
                if (this.isCancelled) throw new Error('操作已取消');
                try {
                    await this.bm.ensureFolder(folder.path, '1');
                    this.onLog(`  + 创建: ${folder.path}`);
                } catch (e) {
                    this.onLog(`  ! 创建失败 ${folder.path}: ${e.message}`);
                }
                updateProgress(`创建文件夹: ${folder.path}`);
            }
        }

        // 4.2 Rename Folders
        if (plan.folders_to_rename) {
            this.onLog(`[rename] 需要重命名 ${plan.folders_to_rename.length} 个文件夹`);
            for (const item of plan.folders_to_rename) {
                if (this.isCancelled) throw new Error('操作已取消');
                try {
                    await this.bm.renameBookmark(item.bookmark_id, item.new_title);
                    this.onLog(`  > 重命名: ID ${item.bookmark_id} -> ${item.new_title}`);
                } catch (e) {
                    this.onLog(`  ! 重命名失败 ID ${item.bookmark_id}: ${e.message}`);
                }
                updateProgress(`重命名: ${item.new_title}`);
            }
        }

        // 4.3 Move Bookmarks
        if (plan.bookmarks_to_move) {
            this.onLog(`[move] 需要移动 ${plan.bookmarks_to_move.length} 个书签`);
            for (const move of plan.bookmarks_to_move) {
                if (this.isCancelled) throw new Error('操作已取消');
                try {
                    const targetId = await this.bm.ensureFolder(move.target_folder_path, '1');
                    await this.bm.moveBookmark(move.bookmark_id, targetId);
                } catch (e) {
                    this.onLog(`  ! 移动失败 ID ${move.bookmark_id}: ${e.message}`);
                }
                updateProgress('移动书签...');
            }
        }

        // 4.4 Archive
        if (plan.archive) {
            this.onLog(`[archive] 建议归档/删除 ${plan.archive.length} 个书签`);
            const archiveId = await this.bm.ensureFolder('Archive', '1');

            for (const item of plan.archive) {
                if (this.isCancelled) throw new Error('操作已取消');
                try {
                    await this.bm.moveBookmark(item.bookmark_id, archiveId);
                    this.onLog(`  x 归档: ${item.title}`);
                } catch (e) {
                    this.onLog(`  ! 归档失败 ${item.bookmark_id}: ${e.message}`);
                }
                updateProgress(`归档: ${item.title}`);
            }
        }

        // 4.5 Dead Links
        if (plan.dead_links) {
            this.onLog(`[dead] 建议移除 ${plan.dead_links.length} 个失效链接`);
            for (const item of plan.dead_links) {
                if (this.isCancelled) throw new Error('操作已取消');
                try {
                    await this.bm.removeBookmark(item.bookmark_id);
                    this.onLog(`  x 移除: ${item.url} (${item.reason})`);
                } catch (e) {
                    this.onLog(`  ! 移除失效链接失败 ${item.bookmark_id}: ${e.message}`);
                }
                updateProgress(`移除失效链接...`);
            }
        }

        // 4.6 Duplicates
        if (plan.duplicates) {
            this.onLog(`[dup] 建议移除 ${plan.duplicates.length} 个重复书签`);
            for (const item of plan.duplicates) {
                if (this.isCancelled) throw new Error('操作已取消');
                try {
                    await this.bm.removeBookmark(item.bookmark_id);
                    this.onLog(`  x 移除重复: ${item.title} (保留: ${item.keep_title || 'Unknown'})`);
                } catch (e) {
                    this.onLog(`  ! 移除重复失败 ${item.bookmark_id}: ${e.message}`);
                }
                updateProgress(`移除重复书签...`);
            }
        }
    }
}
