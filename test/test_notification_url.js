import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
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

const literalPercentValues = {
    targetPath: 'Specs/%2F-literal',
    bookmarkTitle: 'Percent %2F title',
    suggestedTitle: 'Keep %2F exactly',
    reason: 'The source contains %2F literally'
};
const literalPercentUrl = buildQuickOrganizeNotificationUrl({
    bookmarkId: '8',
    ...literalPercentValues,
    oldParentId: '1',
    isSamePath: false,
    targetId: '3'
});

const elements = new Map();
const element = id => {
    if (!elements.has(id)) {
        elements.set(id, {
            id,
            style: {},
            classList: { add() {}, remove() {} },
            textContent: '',
            value: '',
            onclick: null
        });
    }
    return elements.get(id);
};
const message = element('message');
const document = {
    body: {
        classList: { add() {} },
        addEventListener() {}
    },
    getElementById: element,
    querySelector(selector) {
        return selector === '.message' ? message : null;
    }
};
const notificationScript = readFileSync(
    new URL('../src/options/quick_organize_notify.js', import.meta.url),
    'utf8'
);
vm.runInNewContext(notificationScript, {
    URLSearchParams,
    document,
    window: {
        location: { search: literalPercentUrl.slice(literalPercentUrl.indexOf('?')) },
        close() {}
    },
    chrome: { bookmarks: {} },
    console,
    setTimeout() { return 1; },
    clearTimeout() {}
});

assert.equal(elements.get('target-path').textContent, literalPercentValues.targetPath);
assert.equal(elements.get('bookmark-title').value, literalPercentValues.bookmarkTitle);
assert.equal(elements.get('suggestion-text').textContent, literalPercentValues.suggestedTitle);
assert.equal(elements.get('ai-reason').textContent, `💡 ${literalPercentValues.reason}`);

console.log('Notification URL tests passed');
