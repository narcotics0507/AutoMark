
import './mock_env.js';
import { Organizer } from '../src/lib/organizer.js';

// Override global.fetch to simulate dead links
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
    console.log('[Test fetch]', url);
    if (url === 'http://jira.com') {
        // Simulate checking checking (HEAD/GET)
        if (options.method === 'GET') {
            return { ok: true, status: 200 };
        }
    }
    if (url === 'http://google.com') {
        return { ok: true, status: 200 };
    }
    if (url === 'http://react.dev') {
        // Simulate Dead Link (Timeout or Error)
        throw new Error('Network Error');
    }

    // Fallback to original mock for other things (like AI if we were using it, but we are skipping)
    return originalFetch(url, options);
};

async function runTest() {
    console.log('--- Starting Dead Link Standalone Mode Test ---');

    const organizer = new Organizer({
        onLog: (msg) => console.log('[Log]', msg),
        onProgress: (p, m) => console.log('[Progress]', p, m),
        config: { targetLanguage: 'zh-CN' }
    });

    console.log('\n--- Step 1: Analyze with skipAI=true, checkDeadLinks=true ---');
    // Selecting folder '1' which has Jira, Google, React Docs
    const plan = await organizer.analyze(['1'], { checkDeadLinks: true, skipAI: true });

    console.log('Generated Plan:', JSON.stringify(plan, null, 2));

    // Assertions
    let passed = true;

    if (plan.folders_to_create.length !== 0) {
        console.error('❌ Expected 0 folders to create, got ' + plan.folders_to_create.length);
        passed = false;
    }

    if (plan.bookmarks_to_move.length !== 0) {
        console.error('❌ Expected 0 bookmarks to move, got ' + plan.bookmarks_to_move.length);
        passed = false;
    }

    if (plan.dead_links.length !== 1) {
        console.error('❌ Expected 1 dead link, got ' + plan.dead_links.length);
        passed = false;
    } else {
        const dead = plan.dead_links[0];
        if (dead.url === 'http://react.dev') {
            console.log('✅ Correctly identified dead link: ' + dead.url);
        } else {
            console.error('❌ Wrong dead link identified: ' + dead.url);
            passed = false;
        }
    }

    if (passed) {
        console.log('✅ TEST PASSED');
    } else {
        console.error('❌ TEST FAILED');
        process.exit(1);
    }
}

runTest().catch(e => {
    console.error('TEST ERROR:', e);
    process.exit(1);
});
