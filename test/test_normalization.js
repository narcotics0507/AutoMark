
import { Organizer } from '../src/lib/organizer.js';
import fs from 'fs';

// Mock BookmarkManager
class MockBookmarkManager {
    constructor(mockTree) { this.mockTree = mockTree; }
    async getTree() { return this.mockTree; }
    flatten(nodes) { return nodes; } // Simplified
    async getSubTree() { return []; }
}

global.chrome = { bookings: {}, storage: { sync: { get: () => ({}) } } };

async function run() {
    const mocks = [
        { id: '1', title: 'HTTP', url: 'http://a.com' },
        { id: '2', title: 'HTTPS', url: 'https://a.com' }, // Dup of 1
        { id: '3', title: 'WWW', url: 'https://www.b.com' },
        { id: '4', title: 'Non-WWW', url: 'https://b.com' }, // Dup of 3
        { id: '5', title: 'UTM', url: 'https://c.com/p?utm_a=1' },
        { id: '6', title: 'Clean', url: 'https://c.com/p' }, // Dup of 5
        { id: '7', title: 'Unique', url: 'https://d.com' }
    ];

    const organizer = new Organizer({ onLog: () => { }, onStatus: () => { }, onProgress: () => { } });
    organizer.bm = new MockBookmarkManager([{ children: mocks }]);

    // Direct call to checkDuplicates bypassing analyze setup
    const dups = await organizer.checkDuplicates(mocks);

    const deletedIds = dups.map(d => d.bookmark_id).sort();

    let report = `Deleted IDs: ${deletedIds.join(', ')}\n`;

    // Checks
    // 1 vs 2: One deleted
    const c1 = deletedIds.includes('1') !== deletedIds.includes('2');
    // 3 vs 4: One deleted
    const c2 = deletedIds.includes('3') !== deletedIds.includes('4');
    // 5 vs 6: One deleted
    const c3 = deletedIds.includes('5') !== deletedIds.includes('6');
    // 7: Not deleted
    const c4 = !deletedIds.includes('7');

    report += `Protocol Check: ${c1 ? 'PASS' : 'FAIL'}\n`;
    report += `WWW Check: ${c2 ? 'PASS' : 'FAIL'}\n`;
    report += `UTM Check: ${c3 ? 'PASS' : 'FAIL'}\n`;
    report += `Unique Check: ${c4 ? 'PASS' : 'FAIL'}\n`;

    fs.writeFileSync('test/result.txt', report);
    console.log('Done');
}
run();
