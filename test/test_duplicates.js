
import { Organizer } from '../src/lib/organizer.js';

// Mock BookmarkManager
class MockBookmarkManager {
    constructor(mockTree) {
        this.mockTree = mockTree;
    }

    async getTree() {
        return this.mockTree;
    }

    flatten(nodes) {
        // Simplified flatten for test
        let result = [];
        for (const node of nodes) {
            if (node.url) {
                result.push({ ...node, path: node.title });
            }
            if (node.children) {
                result = result.concat(this.flatten(node.children));
            }
        }
        return result;
    }

    async getSubTree(id) {
        // return dummy
        return [];
    }
}

// Mock chrome API
global.chrome = {
    bookings: {},
    storage: {
        sync: {
            get: () => ({})
        }
    }
};

async function runTest() {
    console.log("Starting Duplicate Detection Test...");

    const mockBookmarks = [
        // Case 1: Exact Duplicates
        { id: '1', title: 'Google', url: 'https://www.google.com/' },
        { id: '2', title: 'Google Copy', url: 'https://www.google.com/' },

        // Case 2: Root Preference
        { id: '3', title: 'GitHub', url: 'https://github.com/' },
        { id: '4', title: 'GitHub Profile', url: 'https://github.com/zhaozongxian' },
        { id: '5', title: 'GitHub Repo', url: 'https://github.com/zhaozongxian/AIBookmark' },

        // Case 3: Root Preference with multiple Roots (keep one)
        { id: '6', title: 'Baidu', url: 'https://www.baidu.com/' },
        { id: '7', title: 'Baidu Home', url: 'https://www.baidu.com/' },
        { id: '8', title: 'Baidu Search', url: 'https://www.baidu.com/s?wd=test' },

        // Case 4: No Root, but duplicates
        { id: '9', title: 'Example Page', url: 'https://example.com/page1' },
        { id: '10', title: 'Example Page Copy', url: 'https://example.com/page1' },

        // Case 6: URL Normalization Checks
        { id: '13', title: 'Example HTTP', url: 'http://example.org' },
        { id: '14', title: 'Example HTTPS', url: 'https://example.org' }, // Should be dup of 13

        { id: '15', title: 'Example WWW', url: 'https://www.test-norm.com' },
        { id: '16', title: 'Example No-WWW', url: 'https://test-norm.com' }, // Should be dup of 15

        { id: '17', title: 'Example UTM', url: 'https://marketing.com/landing?utm_source=google&utm_medium=cpc' },
        { id: '18', title: 'Example Clean', url: 'https://marketing.com/landing' }, // Should be dup of 17 (or vice versa)
    ];

    const mockTree = [{
        id: '0',
        children: mockBookmarks
    }];

    const organizer = new Organizer({
        onLog: (msg) => console.log(`[LOG] ${msg}`),
        onStatus: () => { },
        onProgress: () => { }
    });

    // Inject mock BM
    organizer.bm = new MockBookmarkManager(mockTree);

    const plan = await organizer.analyze(null, { checkDuplicates: true, skipAI: true });

    console.log("\n--- Detection Results ---");
    if (!plan.duplicates || plan.duplicates.length === 0) {
        console.log("No duplicates found (Unexpected!)");
        return;
    }

    plan.duplicates.forEach(d => {
        console.log(`[DELETE] ${d.title} (${d.url}) - Reason: ${d.reason}`);
    });

    // Verification Logic
    const toDeleteIds = plan.duplicates.map(d => d.bookmark_id);
    console.log('DELETED IDS:', toDeleteIds);
    console.log('DELETED DETAILS:', plan.duplicates.map(d => `${d.bookmark_id}:${d.reason}`).join(', '));

    // Case 1: Expect one of '1' or '2' to be deleted.
    const hasGoogleDup = toDeleteIds.includes('1') || toDeleteIds.includes('2');
    const keptGoogle = !toDeleteIds.includes('1') || !toDeleteIds.includes('2');
    console.log(`Case 1 (Exact): ${hasGoogleDup && keptGoogle ? 'PASS' : 'FAIL'}`);

    // Case 2: Expect '4' and '5' to be deleted (Root '3' exists)
    const del4 = toDeleteIds.includes('4');
    const del5 = toDeleteIds.includes('5');
    const keep3 = !toDeleteIds.includes('3');
    console.log(`Case 2 (Root Pref): ${del4 && del5 && keep3 ? 'PASS' : 'FAIL'}`);

    // Case 3: Expect one root deleted ('6' or '7') AND subpage '8' deleted.
    const del8 = toDeleteIds.includes('8');
    const hasBaiduRootDup = toDeleteIds.includes('6') || toDeleteIds.includes('7');
    console.log(`Case 3 (Multi Root): ${del8 && hasBaiduRootDup ? 'PASS' : 'FAIL'}`);

    // Case 4: Expect one of '9' or '10' deleted.
    const hasPageDup = toDeleteIds.includes('9') || toDeleteIds.includes('10');
    console.log(`Case 4 (No Root Dup): ${hasPageDup ? 'PASS' : 'FAIL'}`);

    // Case 5: Expect neither '11' nor '12' deleted.
    const del11 = toDeleteIds.includes('11');
    const del12 = toDeleteIds.includes('12');
    console.log(`Case 5 (No Dup): ${!del11 && !del12 ? 'PASS' : 'FAIL'}`);

    // Case 6: Normalization
    // 13 vs 14 (http vs https) -> One deleted
    const normProto = (toDeleteIds.includes('13') || toDeleteIds.includes('14')) && !(toDeleteIds.includes('13') && toDeleteIds.includes('14'));

    // 15 vs 16 (www vs non-www) -> One deleted
    const normWWW = (toDeleteIds.includes('15') || toDeleteIds.includes('16')) && !(toDeleteIds.includes('15') && toDeleteIds.includes('16'));

    // 17 vs 18 (utm vs clean) -> One deleted
    const normUTM = (toDeleteIds.includes('17') || toDeleteIds.includes('18')) && !(toDeleteIds.includes('17') && toDeleteIds.includes('18'));

    console.log(`Case 6a (Protocol): ${normProto ? 'PASS' : 'FAIL'}`);
    console.log(`Case 6b (WWW): ${normWWW ? 'PASS' : 'FAIL'}`);
    console.log(`Case 6c (UTM): ${normUTM ? 'PASS' : 'FAIL'}`);
}

runTest().catch(console.error);
