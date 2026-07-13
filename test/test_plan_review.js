import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSelectedPlan, getReviewCounts } from '../src/lib/plan_review.js';

const plan = {
    folders_to_create: [{ path: 'Development' }],
    folders_to_rename: [{ bookmark_id: 'f1', new_title: '开发' }],
    bookmarks_to_move: [{ bookmark_id: '1' }, { bookmark_id: '2', _ignored: true }],
    bookmarks_to_rename: [
        { bookmark_id: '1', new_title: 'React 文档' },
        { bookmark_id: '2', new_title: 'Vue 文档', _ignored: true }
    ],
    archive: [],
    dead_links: [],
    duplicates: [{ bookmark_id: '3' }]
};

assert.deepEqual(getReviewCounts(plan), { create: 1, move: 1, rename: 2 });

const selected = buildSelectedPlan(plan);
assert.equal(selected.bookmarks_to_move.length, 1);
assert.equal(selected.bookmarks_to_rename.length, 1);
assert.equal(selected.duplicates.length, 1);
assert.equal(selected.bookmarks_to_move[0].bookmark_id, '1');

const optionsJs = readFileSync(new URL('../src/options/options.js', import.meta.url), 'utf8');
assert.ok(
    /import \{ buildSelectedPlan, getReviewCounts \} from '\.\.\/\.\.\/src\/lib\/plan_review\.js';/.test(optionsJs),
    'options.js imports the plan review helpers'
);
assert.equal((optionsJs.match(/getReviewCounts\(/g) || []).length, 2);
assert.ok(
    /createGroupedSection\('优化书签标题', plan\.bookmarks_to_rename, '🏷️'/.test(optionsJs),
    'options.js renders bookmark title suggestions'
);
assert.ok(/\(item\) => item\.path \|\| 'Bookmarks'/.test(optionsJs));
assert.ok(/item\.old_title} &rarr; <b>\$\{item\.new_title}/.test(optionsJs));
assert.ok(/const finalPlan = buildSelectedPlan\(currentPlan\);/.test(optionsJs));

console.log('Plan review tests passed');
