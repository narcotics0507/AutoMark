# AutoMark 1.0.9: Custom Organization Rules and Classification Control

## Objective

Improve classification quality and user control without changing AutoMark's permission model or making destructive operations less visible. The release addresses Issue #2 by allowing users to append their own organization preferences to AutoMark's built-in AI instructions.

## Scope

Version 1.0.9 will add:

1. Three organization styles: conservative, balanced, and restructure.
2. Optional custom organization instructions of up to 2,000 characters.
3. Shared style and custom-instruction behavior for batch organization and automatic classification of newly created bookmarks.
4. Separately reviewable bookmark-title suggestions in batch plans.
5. The real AI classification reason in the automatic-classification confirmation window.
6. Automated coverage for the new prompt behavior, plan behavior, and notification data.

The release will not add per-domain rule sets, multiple saved profiles, cloud synchronization outside `chrome.storage.sync`, or a full visual rule builder.

## User Experience

The settings sidebar will add an organization-style selector and a custom-rules textarea below the target-language setting.

The available styles are:

- **Conservative**: Prefer existing folders and do not create a new folder unless no valid existing destination is available.
- **Balanced**: Prefer existing folders but create a concise new folder when necessary. This is the default and preserves current behavior as closely as possible.
- **Restructure**: Allow broader category and hierarchy changes when they produce a clearer organization.

The custom-rules textarea accepts natural-language preferences such as:

- Keep work project bookmarks in their current folders.
- Put frontend documentation under `开发技术/前端`.
- Avoid creating new top-level folders.

The UI shows a 2,000-character limit and explains that these rules supplement AutoMark's built-in output and safety requirements.

During batch review, bookmark moves and bookmark-title changes are independently selectable. Accepting a destination change does not require accepting the proposed title.

The automatic-classification confirmation window displays the AI-provided reason. Suggested titles remain opt-in and are never applied silently.

## Configuration and Compatibility

Two settings are added to `chrome.storage.sync`:

- `organizationStyle`: one of `conservative`, `balanced`, or `restructure`; defaults to `balanced`.
- `customInstructions`: a trimmed string with a maximum stored length of 2,000 characters; defaults to an empty string.

Existing users require no migration. Missing values resolve to the defaults above. No new Chrome permissions or host permissions are required.

## AI Prompt Architecture

`AIService` will own a shared helper that renders organization preferences. Both `buildPrompt()` for batch plans and `classifyBookmark()` for new bookmarks will use the same helper so their behavior cannot drift.

The generated prompt segment will contain:

1. A fixed explanation of the selected organization style.
2. The user's custom rules inside explicit delimiters.
3. A fixed instruction that user rules are preferences and cannot override the required JSON schema, output-only requirement, or safety constraints.

An empty custom-rules value emits no custom-rules section. Prompt construction must not mutate stored configuration.

Batch analysis will continue to use batches of 50 bookmarks. Existing bookmark paths remain part of each batch's context.

## Batch Plan and Execution

The master plan gains `bookmarks_to_rename`, containing:

```json
{
  "bookmark_id": "456",
  "old_title": "Original title",
  "new_title": "Suggested title",
  "path": "Current/Folder"
}
```

When an AI move includes a non-empty `suggested_title` different from the current title, the organizer normalizes it into `bookmarks_to_rename`. Duplicate rename instructions for the same bookmark are removed.

The review screen renders rename suggestions independently from moves. Execution order is:

1. Create folders.
2. Apply existing folder rename operations.
3. Move bookmarks.
4. Rename bookmarks selected by the user.
5. Archive low-value items and dead links.
6. Remove user-approved duplicates.
7. Clean up empty folders.

Each failed operation is logged and does not stop unrelated operations. Cancellation checks remain between operations.

## Automatic Classification Notification

The background worker will include the AI `reason` in the notification URL using URL encoding. The notification page will continue to decode all query parameters defensively and fall back to `AI Decision` when no reason is returned.

The existing behavior remains unchanged otherwise: AutoMark may move the bookmark before showing the confirmation window, the user can undo or choose another destination, and title suggestions require explicit user selection.

## Validation and Error Handling

The settings UI trims custom instructions before saving and rejects values longer than 2,000 characters with an inline error. `AIService` also truncates to the limit defensively for callers outside the settings page.

Unknown organization-style values fall back to `balanced`. Invalid or missing AI JSON continues to use existing error reporting and logs. The new settings must never be included in log messages containing API keys or other secrets.

## Testing

Automated tests will verify:

- Each organization style produces its intended prompt instructions.
- Custom instructions appear in both batch and automatic-classification prompts.
- Empty custom instructions preserve the previous prompt path.
- Unknown styles fall back to balanced behavior.
- Suggested titles are normalized into independent rename plan entries.
- Rename entries are hydrated for review, filtered independently, and executed.
- The notification URL includes an encoded AI reason and the confirmation page retains its fallback.
- Existing workflow, duplicate detection, URL normalization, and dead-link tests still pass.

Manual verification in a Chromium browser will cover settings persistence, all three styles, batch review selection, automatic classification undo, and extension reload behavior.

## Release and Handoff

`manifest.json` and `package.json` will be updated to version 1.0.9 after implementation passes verification. The handoff will include:

- A source summary and verification results.
- A clean upload ZIP containing the extension files and excluding Git metadata, tests, and local artifacts.
- A clear notice that the changed extension must be uploaded and submitted again through the Chrome Web Store developer dashboard.

