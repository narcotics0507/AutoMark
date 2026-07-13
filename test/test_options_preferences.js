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
