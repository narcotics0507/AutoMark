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
