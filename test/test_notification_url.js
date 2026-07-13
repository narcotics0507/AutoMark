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
