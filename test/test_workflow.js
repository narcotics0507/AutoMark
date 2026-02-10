
import './mock_env.js';
import { Organizer } from '../src/lib/organizer.js';

async function runTest() {
    console.log('--- Starting Integration Test ---');

    // 1. Init
    const organizer = new Organizer({
        onLog: (msg) => console.log('[Log]', msg),
        onStatus: (s, t, d) => console.log('[Status]', t, d),
        onProgress: (p, m) => console.log('[Progress]', p, m),
        config: { targetLanguage: 'zh-CN' }
    });

    // 2. Mock UI Selection (Select "Bookmarks Bar", id 1)
    console.log('\n--- Step 1: Get Folders ---');
    const folders = await organizer.getTopLevelFolders();
    console.log('Top Level Folders:', folders.map(f => f.title));

    // 3. Analyze
    console.log('\n--- Step 2: Analyze ---');
    const plan = await organizer.analyze(['1']);
    console.log('Generated Plan:', JSON.stringify(plan, null, 2));

    // 4. Verify Plan Content (Mock AI returns static plan)
    if (plan.folders_to_create[0].path === '前端开发') {
        console.log('✅ Plan contains expected Chinese folder');
    } else {
        console.error('❌ Plan missing expected folder');
    }

    // 5. Execute
    console.log('\n--- Step 3: Execute ---');
    await organizer.execute(plan);
    console.log('✅ Execution completed');
}

runTest().catch(e => console.error('TEST FAILED:', e.message));
