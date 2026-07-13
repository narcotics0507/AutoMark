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
