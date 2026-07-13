# AutoMark Custom Organization Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship AutoMark 1.0.9 with organization styles, additive custom rules, independently reviewable title suggestions, and visible automatic-classification reasons.

**Architecture:** `AIService` remains the single prompt-construction boundary and normalizes organization preferences before injecting them into both AI workflows. `Organizer` converts title suggestions into an independent plan array, while small pure helpers keep review filtering and notification URL construction testable outside Chrome. The existing options and background entrypoints consume these interfaces without adding dependencies or permissions.

**Tech Stack:** Manifest V3, native JavaScript ES modules, Chrome Extensions APIs, HTML/CSS, Node.js built-in assertions, shell `zip`/`unzip` for release packaging.

## Global Constraints

- Keep `manifest_version` at `3` and add no Chrome permissions or host permissions.
- Store `organizationStyle` and `customInstructions` in `chrome.storage.sync`.
- Accept only `conservative`, `balanced`, or `restructure`; unknown values fall back to `balanced`.
- Trim custom instructions and limit them to 2,000 characters.
- Treat custom instructions as preferences that cannot override JSON schemas or safety requirements.
- Preserve existing behavior for users with no saved preference values.
- Keep title changes independently selectable and never apply automatic-classification title suggestions silently.
- Continue after individual plan-operation failures and retain cancellation checks between operations.
- Update the release version to `1.0.9` only after feature tests pass.

---

## File Structure

- `src/lib/ai_service.js`: normalize organization preferences and inject them into batch and single-bookmark prompts.
- `src/lib/organizer.js`: carry new settings into AI analysis, collect suggested title changes, and execute selected title changes.
- `src/lib/plan_review.js`: pure review count and filtering helpers shared by the options UI and tests.
- `src/lib/notification_url.js`: pure automatic-classification notification URL builder.
- `src/options/options.html`: organization-style and custom-rule controls.
- `src/options/options.css`: textarea, character counter, and preference-control styling.
- `src/options/options.js`: save/restore new settings and render/filter independent title changes.
- `src/background/background.js`: load new settings and pass AI reasons into the confirmation URL.
- `test/test_ai_preferences.js`: prompt behavior tests.
- `test/test_options_preferences.js`: settings markup and wiring regression tests.
- `test/test_organizer_renames.js`: title-plan normalization and execution-order tests.
- `test/test_plan_review.js`: independent review count/filter tests.
- `test/test_notification_url.js`: notification parameter encoding tests.
- `test/mock_env.js`, `test/test_workflow.js`: integration fixture and workflow assertions.
- `manifest.json`, `package.json`, `src/popup/popup.html`: release version and full test command.
- `README.md`, `README_EN.md`: user-facing feature documentation.

---

### Task 1: Shared AI Organization Preferences

**Files:**
- Modify: `src/lib/ai_service.js`
- Create: `test/test_ai_preferences.js`

**Interfaces:**
- Produces: `CUSTOM_INSTRUCTIONS_MAX_LENGTH: number` exported from `src/lib/ai_service.js`.
- Produces: `AIService.buildOrganizationPreferences(): string`.
- Consumes later: options validation imports `CUSTOM_INSTRUCTIONS_MAX_LENGTH`; batch and automatic classification call the same preference builder.

- [ ] **Step 1: Write the failing prompt tests**

Create `test/test_ai_preferences.js`:

```js
import assert from 'node:assert/strict';
import { AIService, CUSTOM_INSTRUCTIONS_MAX_LENGTH } from '../src/lib/ai_service.js';

const bookmark = {
    id: '42',
    title: 'React Documentation',
    url: 'https://react.dev',
    path: 'Bookmarks Bar',
    is_folder: false
};

const styleExpectations = {
    conservative: 'Avoid creating new folders unless no suitable existing path exists.',
    balanced: 'Prefer existing folders, but create a concise new folder when necessary.',
    restructure: 'You may propose broader category and hierarchy improvements when useful.'
};

for (const [organizationStyle, instruction] of Object.entries(styleExpectations)) {
    const ai = new AIService({ organizationStyle, targetLanguage: 'en-US' });
    assert.match(ai.buildOrganizationPreferences(), new RegExp(instruction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(ai.buildPrompt([bookmark]), new RegExp(instruction.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

const fallback = new AIService({ organizationStyle: 'unknown' });
assert.match(fallback.buildOrganizationPreferences(), /Prefer existing folders, but create a concise new folder when necessary\./);

const customRule = 'Keep work project bookmarks in their current folders.';
const customAI = new AIService({ customInstructions: `  ${customRule}  ` });
const customBlock = customAI.buildOrganizationPreferences();
assert.match(customBlock, /<custom_organization_rules>/);
assert.match(customBlock, new RegExp(customRule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
assert.match(customBlock, /cannot override the required JSON schema/i);

const emptyAI = new AIService({ customInstructions: '   ' });
assert.doesNotMatch(emptyAI.buildOrganizationPreferences(), /<custom_organization_rules>/);

const longAI = new AIService({ customInstructions: 'x'.repeat(CUSTOM_INSTRUCTIONS_MAX_LENGTH + 25) });
const longBlock = longAI.buildOrganizationPreferences();
const enclosedRules = longBlock.match(/<custom_organization_rules>\n([\s\S]+?)\n<\/custom_organization_rules>/)[1];
assert.equal(enclosedRules.length, CUSTOM_INSTRUCTIONS_MAX_LENGTH);

let capturedPrompt = '';
customAI.callOpenAICompatible = async (prompt) => {
    capturedPrompt = prompt;
    return { path: 'Development/Frontend', reason: 'React documentation' };
};
await customAI.classifyBookmark(bookmark, 'Bookmarks Bar, Development/Frontend');
assert.match(capturedPrompt, new RegExp(customRule.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

console.log('AI preference tests passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node test/test_ai_preferences.js
```

Expected: failure because `CUSTOM_INSTRUCTIONS_MAX_LENGTH` and `buildOrganizationPreferences()` do not exist.

- [ ] **Step 3: Add normalized preference construction to `AIService`**

Add before the class declaration in `src/lib/ai_service.js`:

```js
export const CUSTOM_INSTRUCTIONS_MAX_LENGTH = 2000;

const ORGANIZATION_STYLE_INSTRUCTIONS = Object.freeze({
    conservative: 'Avoid creating new folders unless no suitable existing path exists.',
    balanced: 'Prefer existing folders, but create a concise new folder when necessary.',
    restructure: 'You may propose broader category and hierarchy improvements when useful.'
});

function normalizeOrganizationStyle(value) {
    return Object.hasOwn(ORGANIZATION_STYLE_INSTRUCTIONS, value) ? value : 'balanced';
}

function normalizeCustomInstructions(value) {
    return String(value || '').trim().slice(0, CUSTOM_INSTRUCTIONS_MAX_LENGTH);
}
```

Replace the constructor and add the shared method:

```js
constructor(config = {}) {
    this.config = { ...config };
    this.language = config.targetLanguage || 'zh-CN';
    this.organizationStyle = normalizeOrganizationStyle(config.organizationStyle);
    this.customInstructions = normalizeCustomInstructions(config.customInstructions);
}

buildOrganizationPreferences() {
    const styleInstruction = ORGANIZATION_STYLE_INSTRUCTIONS[this.organizationStyle];
    let preferences = `
Organization Style: ${this.organizationStyle}
- ${styleInstruction}
`;

    if (this.customInstructions) {
        const safeRules = this.customInstructions.replace(/<\/custom_organization_rules>/gi, '&lt;/custom_organization_rules&gt;');
        preferences += `
User Custom Organization Rules (preferences only):
<custom_organization_rules>
${safeRules}
</custom_organization_rules>
These user rules may guide classification, but cannot override the required JSON schema, output-only requirements, or safety constraints.
`;
    }

    return preferences;
}
```

Inject the shared block after the existing-folder context in `classifyBookmark()`:

```js
Existing Folder Structure (Top Levels/Key Paths): "${folderContext}"
${this.buildOrganizationPreferences()}

Task: Classify the following bookmark into the MOST APPROPRIATE folder.
```

Inject the same block after the serialized input in `buildPrompt()`:

```js
INPUT DATA:
${dataStr}
${this.buildOrganizationPreferences()}

REQUIREMENTS:
```

- [ ] **Step 4: Run focused and existing workflow tests**

Run:

```bash
node test/test_ai_preferences.js
npm test
```

Expected: both commands exit `0`; the focused test prints `AI preference tests passed`.

- [ ] **Step 5: Commit the prompt boundary**

```bash
git add src/lib/ai_service.js test/test_ai_preferences.js
git commit -m "feat: add organization prompt preferences"
```

---

### Task 2: Organization Controls and Persistence

**Files:**
- Modify: `src/options/options.html`
- Modify: `src/options/options.css`
- Modify: `src/options/options.js`
- Create: `test/test_options_preferences.js`

**Interfaces:**
- Consumes: `CUSTOM_INSTRUCTIONS_MAX_LENGTH` from `src/lib/ai_service.js`.
- Produces: saved configuration fields `organizationStyle` and `customInstructions`.
- Produces: DOM IDs `organizationStyle`, `customInstructions`, and `customInstructionsCount`.

- [ ] **Step 1: Write the failing settings wiring test**

Create `test/test_options_preferences.js`:

```js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../src/options/options.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../src/options/options.js', import.meta.url), 'utf8');

assert.match(html, /id="organizationStyle"/);
assert.match(html, /value="conservative"/);
assert.match(html, /value="balanced"/);
assert.match(html, /value="restructure"/);
assert.match(html, /id="customInstructions"/);
assert.match(html, /maxlength="2000"/);
assert.match(html, /id="customInstructionsCount"/);

assert.match(js, /organizationStyle:\s*'balanced'/);
assert.match(js, /customInstructions:\s*''/);
assert.match(js, /setVal\('organizationStyle', items\.organizationStyle\)/);
assert.match(js, /setVal\('customInstructions', items\.customInstructions\)/);
assert.match(js, /customInstructions:\s*document\.getElementById\('customInstructions'\)\.value\.trim\(\)/);
assert.equal((js.match(/btnTest'\)\.addEventListener\('click', testConnection\)/g) || []).length, 1);

console.log('Options preference wiring tests passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node test/test_options_preferences.js
```

Expected: failure because the new controls and configuration keys are absent.

- [ ] **Step 3: Add the preference controls and styles**

Insert after the target-language form group in `src/options/options.html`:

```html
<div class="form-group">
    <label for="organizationStyle">整理风格</label>
    <select id="organizationStyle">
        <option value="conservative">保守：尽量保持现有目录</option>
        <option value="balanced">均衡：必要时创建新目录</option>
        <option value="restructure">重构：允许更积极地调整结构</option>
    </select>
    <small class="hint">影响批量整理和新增书签的自动分类。</small>
</div>

<div class="form-group">
    <label for="customInstructions">自定义整理规则</label>
    <textarea id="customInstructions" maxlength="2000" rows="5"
        placeholder="例如：工作项目不要移动；前端文档统一放入开发技术/前端。"></textarea>
    <div class="input-meta">
        <small class="hint">规则会追加到内置提示词，不会替换安全与输出约束。</small>
        <small id="customInstructionsCount">0/2000</small>
    </div>
</div>
```

Extend the existing form-control selectors in `src/options/options.css` to include `textarea`, then add:

```css
.form-group textarea {
    width: 100%;
    min-height: 104px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-card);
    color: var(--text-primary);
    font-family: inherit;
    font-size: 14px;
    line-height: 1.45;
    resize: vertical;
    outline: none;
    transition: all var(--transition);
}

.form-group textarea:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-light);
}

.input-meta {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 8px;
}

#customInstructionsCount {
    flex-shrink: 0;
    margin-top: 5px;
    color: var(--text-tertiary);
    font-size: 12px;
}
```

- [ ] **Step 4: Wire defaults, validation, persistence, and the counter**

Change the import in `src/options/options.js` to:

```js
import { AIService, CUSTOM_INSTRUCTIONS_MAX_LENGTH } from '../../src/lib/ai_service.js';
```

Remove the duplicate `btnTest` click-listener line so only one API request runs per click. Add the counter binding with the other top-level listeners:

```js
document.getElementById('customInstructions').addEventListener('input', updateCustomInstructionsCount);
```

Add the new defaults and restored values in `restoreOptions()`:

```js
organizationStyle: 'balanced',
customInstructions: '',
```

```js
setVal('organizationStyle', items.organizationStyle);
setVal('customInstructions', items.customInstructions);
updateCustomInstructionsCount();
```

Return the fields from `getConfigFromUI()`:

```js
organizationStyle: document.getElementById('organizationStyle').value,
customInstructions: document.getElementById('customInstructions').value.trim(),
```

Add the counter helper and validate before `chrome.storage.sync.set`:

```js
function updateCustomInstructionsCount() {
    const input = document.getElementById('customInstructions');
    const counter = document.getElementById('customInstructionsCount');
    counter.textContent = `${input.value.length}/${CUSTOM_INSTRUCTIONS_MAX_LENGTH}`;
}
```

```js
if (config.customInstructions.length > CUSTOM_INSTRUCTIONS_MAX_LENGTH) {
    showStatus(`自定义整理规则不能超过 ${CUSTOM_INSTRUCTIONS_MAX_LENGTH} 字`, 'red');
    return;
}
```

- [ ] **Step 5: Run focused and syntax checks**

Run:

```bash
node test/test_options_preferences.js
node --check src/options/options.js
```

Expected: both commands exit `0`; the focused test prints `Options preference wiring tests passed`.

- [ ] **Step 6: Commit the settings controls**

```bash
git add src/options/options.html src/options/options.css src/options/options.js test/test_options_preferences.js
git commit -m "feat: add organization controls to settings"
```

---

### Task 3: Independent Bookmark Title Plans

**Files:**
- Modify: `src/lib/organizer.js`
- Modify: `test/mock_env.js`
- Modify: `test/test_workflow.js`
- Create: `test/test_organizer_renames.js`

**Interfaces:**
- Produces: `Organizer.collectBookmarkRenames(bookmarksToMove, bookmarks): Array<BookmarkRename>`.
- Produces: `plan.bookmarks_to_rename`, with `bookmark_id`, `old_title`, `new_title`, and `path`.
- Consumes: `BookmarkManager.renameBookmark(id, newTitle)`.

- [ ] **Step 1: Write failing normalization and execution-order tests**

Create `test/test_organizer_renames.js`:

```js
import assert from 'node:assert/strict';
import { Organizer } from '../src/lib/organizer.js';

global.chrome = { bookmarks: {} };

const organizer = new Organizer({ onLog: () => {}, onStatus: () => {}, onProgress: () => {} });
const bookmarks = [
    { id: '1', title: 'React – A JavaScript library', path: 'Bookmarks Bar' },
    { id: '2', title: 'Good title', path: 'Bookmarks Bar/Docs' }
];
const moves = [
    { bookmark_id: '1', target_folder_path: 'Development/Frontend', suggested_title: 'React 官方文档' },
    { bookmark_id: '1', target_folder_path: 'Development/Frontend', suggested_title: 'React 官方文档' },
    { bookmark_id: '2', target_folder_path: 'Docs', suggested_title: 'Good title' },
    { bookmark_id: 'missing', target_folder_path: 'Docs', suggested_title: 'Unknown' }
];

assert.deepEqual(organizer.collectBookmarkRenames(moves, bookmarks), [{
    bookmark_id: '1',
    old_title: 'React – A JavaScript library',
    new_title: 'React 官方文档',
    path: 'Bookmarks Bar'
}]);

const calls = [];
organizer.bm = {
    ensureFolder: async (path) => {
        calls.push(`folder:${path}`);
        return 'target';
    },
    moveBookmark: async (id) => calls.push(`move:${id}`),
    renameBookmark: async (id, title) => calls.push(`rename:${id}:${title}`),
    removeBookmark: async () => {}
};

await organizer.executePlanLogic({
    folders_to_create: [],
    folders_to_rename: [],
    bookmarks_to_move: [{ bookmark_id: '1', target_folder_path: 'Development/Frontend' }],
    bookmarks_to_rename: [{ bookmark_id: '1', new_title: 'React 官方文档' }],
    archive: [],
    dead_links: [],
    duplicates: []
});

assert.deepEqual(calls, [
    'folder:Development/Frontend',
    'move:1',
    'rename:1:React 官方文档'
]);

console.log('Organizer rename tests passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node test/test_organizer_renames.js
```

Expected: failure because `collectBookmarkRenames()` does not exist.

- [ ] **Step 3: Add rename normalization and settings propagation**

Add `bookmarks_to_rename: []` to `masterPlan` in `analyze()`.

Load the new settings with the AI configuration:

```js
const config = await chrome.storage.sync.get([
    'apiProvider',
    'apiEndpoint',
    'apiKey',
    'modelName',
    'targetLanguage',
    'organizationStyle',
    'customInstructions'
]);

for (const key of ['targetLanguage', 'organizationStyle', 'customInstructions']) {
    if (this.config[key] !== undefined) config[key] = this.config[key];
}
```

Add this method to `Organizer`:

```js
collectBookmarkRenames(bookmarksToMove = [], bookmarks = []) {
    const bookmarksById = new Map(bookmarks.map(item => [item.id, item]));
    const renamesById = new Map();

    for (const move of bookmarksToMove) {
        const bookmark = bookmarksById.get(move.bookmark_id);
        const newTitle = String(move.suggested_title || '').trim();
        if (!bookmark || !newTitle || newTitle === bookmark.title || renamesById.has(bookmark.id)) continue;

        renamesById.set(bookmark.id, {
            bookmark_id: bookmark.id,
            old_title: bookmark.title,
            new_title: newTitle,
            path: bookmark.path
        });
    }

    return Array.from(renamesById.values());
}
```

After all AI batches have merged, assign:

```js
masterPlan.bookmarks_to_rename = this.collectBookmarkRenames(masterPlan.bookmarks_to_move, flatList);
```

- [ ] **Step 4: Execute bookmark renames after moves**

Replace the operation count with:

```js
const totalOps = gets(plan.folders_to_create)
    + gets(plan.folders_to_rename)
    + gets(plan.bookmarks_to_move)
    + gets(plan.bookmarks_to_rename)
    + gets(plan.archive)
    + gets(plan.dead_links)
    + gets(plan.duplicates);
```

Insert after the bookmark-move loop:

```js
if (plan.bookmarks_to_rename && plan.bookmarks_to_rename.length > 0) {
    this.onLog(`[rename] 需要优化 ${plan.bookmarks_to_rename.length} 个书签标题`);
    for (const item of plan.bookmarks_to_rename) {
        if (this.isCancelled) throw new Error('操作已取消');
        try {
            await this.bm.renameBookmark(item.bookmark_id, item.new_title);
            this.onLog(`  > 优化标题: ${item.old_title || item.bookmark_id} -> ${item.new_title}`);
        } catch (e) {
            this.onLog(`  ! 优化标题失败 ID ${item.bookmark_id}: ${e.message}`);
        }
        updateProgress(`优化标题: ${item.new_title}`);
    }
}
```

Hydrate the new plan array before returning the plan:

```js
hydrate(masterPlan.bookmarks_to_rename, 'rename');
```

This preserves `new_title` and ensures `old_title` and `path` reflect the scanned bookmark.

- [ ] **Step 5: Extend the integration fixture**

In `test/mock_env.js`, add `organizationStyle: 'balanced'` and `customInstructions: 'Prefer official documentation.'` to the mock storage result, add `suggested_title: 'React 官方文档'` to bookmark `12`'s move, and capture the last user prompt:

```js
global.__lastAIUserPrompt = JSON.parse(options.body).messages.at(-1).content;
```

In `test/test_workflow.js`, after analysis assert:

```js
if (plan.bookmarks_to_rename[0]?.new_title !== 'React 官方文档') {
    throw new Error('Expected an independent bookmark title suggestion');
}
if (!global.__lastAIUserPrompt.includes('Prefer official documentation.')) {
    throw new Error('Expected custom instructions in the batch prompt');
}
```

- [ ] **Step 6: Run organizer and integration tests**

Run:

```bash
node test/test_organizer_renames.js
node test/test_workflow.js
```

Expected: both commands exit `0`; rename occurs after move in both test traces.

- [ ] **Step 7: Commit organizer behavior**

```bash
git add src/lib/organizer.js test/mock_env.js test/test_workflow.js test/test_organizer_renames.js
git commit -m "feat: create independent bookmark title plans"
```

---

### Task 4: Independent Review Selection

**Files:**
- Create: `src/lib/plan_review.js`
- Create: `test/test_plan_review.js`
- Modify: `src/options/options.js`

**Interfaces:**
- Produces: `getReviewCounts(plan): { create: number, move: number, rename: number }`.
- Produces: `buildSelectedPlan(plan): Plan`, returning all seven supported plan arrays filtered by `_ignored`.
- Consumes: `plan.bookmarks_to_rename` from Task 3.

- [ ] **Step 1: Write the failing review-helper test**

Create `test/test_plan_review.js`:

```js
import assert from 'node:assert/strict';
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

console.log('Plan review tests passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node test/test_plan_review.js
```

Expected: failure because `src/lib/plan_review.js` does not exist.

- [ ] **Step 3: Implement pure review helpers**

Create `src/lib/plan_review.js`:

```js
const PLAN_ARRAY_KEYS = [
    'folders_to_create',
    'folders_to_rename',
    'bookmarks_to_move',
    'bookmarks_to_rename',
    'archive',
    'dead_links',
    'duplicates'
];

function selectedCount(items) {
    return Array.isArray(items) ? items.filter(item => !item._ignored).length : 0;
}

export function getReviewCounts(plan = {}) {
    return {
        create: selectedCount(plan.folders_to_create),
        move: selectedCount(plan.bookmarks_to_move),
        rename: selectedCount(plan.folders_to_rename) + selectedCount(plan.bookmarks_to_rename)
    };
}

export function buildSelectedPlan(plan = {}) {
    return Object.fromEntries(PLAN_ARRAY_KEYS.map(key => [
        key,
        Array.isArray(plan[key]) ? plan[key].filter(item => !item._ignored) : []
    ]));
}
```

- [ ] **Step 4: Use the helpers in the review UI**

Add to `src/options/options.js` imports:

```js
import { buildSelectedPlan, getReviewCounts } from '../../src/lib/plan_review.js';
```

In `renderReview(plan)`, replace the three summary assignments with:

```js
const counts = getReviewCounts(plan);
document.getElementById('count-create').textContent = counts.create;
document.getElementById('count-move').textContent = counts.move;
document.getElementById('count-rename').textContent = counts.rename;
```

After the existing folder-rename section, render bookmark-title suggestions:

```js
createGroupedSection('优化书签标题', plan.bookmarks_to_rename, '🏷️',
    (item) => item.path || 'Bookmarks',
    (item) => `<span>${item.old_title} &rarr; <b>${item.new_title}</b></span>`
);
```

Replace `updateReviewCounts()`'s three summary calculations with the same `getReviewCounts(currentPlan)` assignments. Replace the manually constructed `finalPlan` in the execute click handler with:

```js
const finalPlan = buildSelectedPlan(currentPlan);
```

- [ ] **Step 5: Run helper, syntax, and organizer tests**

Run:

```bash
node test/test_plan_review.js
node test/test_organizer_renames.js
node --check src/options/options.js
```

Expected: all commands exit `0`.

- [ ] **Step 6: Commit independent review selection**

```bash
git add src/lib/plan_review.js src/options/options.js test/test_plan_review.js
git commit -m "feat: review title suggestions independently"
```

---

### Task 5: Visible Automatic-Classification Reasons

**Files:**
- Create: `src/lib/notification_url.js`
- Create: `test/test_notification_url.js`
- Modify: `src/background/background.js`

**Interfaces:**
- Produces: `buildQuickOrganizeNotificationUrl(options): string`.
- Consumes: classification result fields `path`, `reason`, and `suggested_title`.

- [ ] **Step 1: Write the failing URL-encoding test**

Create `test/test_notification_url.js`:

```js
import assert from 'node:assert/strict';
import { buildQuickOrganizeNotificationUrl } from '../src/lib/notification_url.js';

const url = buildQuickOrganizeNotificationUrl({
    bookmarkId: '42',
    targetPath: '开发技术/前端',
    oldParentId: '1',
    isSamePath: false,
    targetId: '99',
    bookmarkTitle: 'React 文档 & 指南',
    suggestedTitle: 'React 官方文档',
    reason: '属于前端开发资料'
});

const query = url.slice(url.indexOf('?') + 1);
const params = new URLSearchParams(query);
assert.equal(params.get('id'), '42');
assert.equal(params.get('path'), '开发技术/前端');
assert.equal(params.get('msg'), 'React 文档 & 指南');
assert.equal(params.get('suggestion'), 'React 官方文档');
assert.equal(params.get('reason'), '属于前端开发资料');
assert.equal(params.get('same'), 'false');

const longTitleUrl = buildQuickOrganizeNotificationUrl({
    bookmarkId: '7',
    targetPath: 'Docs',
    oldParentId: '1',
    isSamePath: true,
    targetId: '2',
    bookmarkTitle: 'x'.repeat(120),
    reason: ''
});
const longParams = new URLSearchParams(longTitleUrl.slice(longTitleUrl.indexOf('?') + 1));
assert.equal(longParams.get('msg').length, 103);
assert.equal(longParams.get('reason'), 'AI Decision');
assert.equal(longParams.has('suggestion'), false);

console.log('Notification URL tests passed');
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
node test/test_notification_url.js
```

Expected: failure because `src/lib/notification_url.js` does not exist.

- [ ] **Step 3: Implement the pure URL builder**

Create `src/lib/notification_url.js`:

```js
export function buildQuickOrganizeNotificationUrl({
    bookmarkId,
    targetPath,
    oldParentId,
    isSamePath,
    targetId,
    bookmarkTitle,
    suggestedTitle,
    reason
}) {
    const title = String(bookmarkTitle || '');
    const safeTitle = title.length > 100 ? `${title.slice(0, 100)}...` : title;
    const params = new URLSearchParams({
        id: String(bookmarkId),
        path: String(targetPath || ''),
        old: String(oldParentId || ''),
        same: String(Boolean(isSamePath)),
        targetId: String(targetId || ''),
        msg: safeTitle,
        reason: String(reason || 'AI Decision')
    });

    if (suggestedTitle) params.set('suggestion', String(suggestedTitle));
    return `src/options/quick_organize_notify.html?${params.toString()}`;
}
```

- [ ] **Step 4: Integrate the builder and preference fields in the background worker**

Add to `src/background/background.js` imports:

```js
import { buildQuickOrganizeNotificationUrl } from '../lib/notification_url.js';
```

Include `'organizationStyle'` and `'customInstructions'` in the `chrome.storage.sync.get` field list. Replace manual success URL concatenation with:

```js
const notifyUrl = buildQuickOrganizeNotificationUrl({
    bookmarkId: id,
    targetPath,
    oldParentId: originalParentId,
    isSamePath,
    targetId,
    bookmarkTitle: bookmark.title,
    suggestedTitle: result.suggested_title,
    reason: result.reason
});
```

Keep the existing error and import-warning URLs unchanged. `quick_organize_notify.js` already decodes `reason` and falls back to `AI Decision`.

- [ ] **Step 5: Run focused and syntax tests**

Run:

```bash
node test/test_notification_url.js
node --check src/background/background.js
```

Expected: both commands exit `0`; the focused test prints `Notification URL tests passed`.

- [ ] **Step 6: Commit the notification reason**

```bash
git add src/lib/notification_url.js src/background/background.js test/test_notification_url.js
git commit -m "feat: show automatic classification reasons"
```

---

### Task 6: Release Metadata, Documentation, Verification, and Upload ZIP

**Files:**
- Modify: `manifest.json`
- Modify: `package.json`
- Modify: `src/popup/popup.html`
- Modify: `README.md`
- Modify: `README_EN.md`
- Generate, do not commit: `dist/AutoMark-1.0.9.zip`

**Interfaces:**
- Produces: release version `1.0.9` in all displayed and package metadata.
- Produces: `npm test` as the complete automated regression command.
- Produces: Chrome Web Store upload archive containing only `manifest.json` and `src/`.

- [ ] **Step 1: Expand the automated test command before changing the version**

Replace `package.json`'s scripts section with:

```json
"scripts": {
    "test": "node test/test_ai_preferences.js && node test/test_options_preferences.js && node test/test_organizer_renames.js && node test/test_plan_review.js && node test/test_notification_url.js && node test/test_workflow.js && node test/test_deadlink_manual_mode.js && node test/test_duplicates.js && node test/test_normalization.js"
}
```

- [ ] **Step 2: Run the complete pre-release suite**

Run:

```bash
npm test
find src test -name '*.js' -print0 | xargs -0 -n1 node --check
git diff --check
```

Expected: every command exits `0`; existing workflow, dead-link, duplicate, and normalization results remain passing.

- [ ] **Step 3: Update release metadata**

Set `version` to `1.0.9` in `manifest.json` and `package.json`. Change the popup label in `src/popup/popup.html` to:

```html
<span class="version">v1.0.9</span>
```

- [ ] **Step 4: Document the new controls in both READMEs**

Add a feature bullet under smart organization in `README.md`:

```markdown
* **自定义整理规则**：选择保守、均衡或重构风格，并用自然语言补充个人分类偏好；规则同时应用于批量整理和新增书签自动分类。
* **可控标题优化**：批量审查时可分别确认目录移动和标题修改，自动分类弹窗会展示 AI 的分类理由。
```

Add the equivalent text under smart organization in `README_EN.md`:

```markdown
* **Custom organization rules**: Choose a conservative, balanced, or restructure style and add natural-language preferences used by both batch organization and automatic classification.
* **Controlled title cleanup**: Review destination changes and title suggestions independently, with the AI classification reason shown in the automatic-classification popup.
```

- [ ] **Step 5: Run final automated verification**

Run:

```bash
npm test
find src test -name '*.js' -print0 | xargs -0 -n1 node --check
git diff --check
git status --short
```

Expected: tests and syntax checks exit `0`; status lists only intended source, test, metadata, and documentation files.

- [ ] **Step 6: Commit the release-ready source**

```bash
git add manifest.json package.json src/popup/popup.html README.md README_EN.md
git commit -m "docs: prepare AutoMark 1.0.9 release"
```

- [ ] **Step 7: Build and inspect the ignored upload archive**

Run:

```bash
mkdir -p dist
zip -r dist/AutoMark-1.0.9.zip manifest.json src
unzip -t dist/AutoMark-1.0.9.zip
unzip -l dist/AutoMark-1.0.9.zip
```

Expected: archive integrity reports `No errors detected`; listing contains `manifest.json` at the archive root and files under `src/`, with no `.git`, `test`, `docs`, or `store-assets` paths.

- [ ] **Step 8: Perform Chromium smoke verification**

Load `/Users/sonic/Documents/AutoMark` as an unpacked extension in a clean Chromium profile and verify:

1. Settings reload with `balanced` and an empty custom-rules field for a fresh profile.
2. Saving each organization style and a custom rule persists after reloading the options page.
3. One batch analysis shows title suggestions separately from bookmark moves.
4. Unchecking a title suggestion leaves the original title unchanged when executing the plan.
5. Automatic classification displays the returned reason and does not rename until the suggested title is explicitly selected.
6. Undo returns an automatically moved bookmark to its original folder.

- [ ] **Step 9: Record handoff facts**

Report the final commit, automated test result, smoke-test result, and absolute ZIP path. State explicitly that version 1.0.9 changes extension code and must be uploaded and submitted again in the Chrome Web Store developer dashboard.
