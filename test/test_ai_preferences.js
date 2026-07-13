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
