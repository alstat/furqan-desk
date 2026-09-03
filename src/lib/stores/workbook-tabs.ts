// A workbook window can hold several boards at once, Chrome-tab style. Each
// tab is just a document plus the path it was last saved to (if any) — the
// mounted WorkbookBoard for the active tab already carries everything else
// (viewport, selection) inside the doc itself, so switching tabs is nothing
// more than swapping which doc is bound to the one mounted board.
//
// This is plain per-window state, not a shared store: every Tauri webview
// loads its own copy of this module, so two Workbook windows never see each
// other's tabs except through the explicit pop-out/reattach events in
// workbook.store.ts.
import { emptyWorkbook, type WorkbookDoc } from './workbook.store';

export interface WorkbookTab {
    id: string;
    doc: WorkbookDoc;
    path?: string;
}

/** A fresh blank tab, or one seeded with an already-loaded document. */
export function createWorkbookTab(doc?: WorkbookDoc, path?: string): WorkbookTab {
    return { id: crypto.randomUUID(), doc: doc ?? emptyWorkbook(), path };
}

/**
 * Removes a tab and works out what should become active next — the neighbour
 * at the same index, clamped, matching how browser tab strips pick the tab
 * to focus after a close.
 */
export function closeWorkbookTab(
    tabs: WorkbookTab[],
    activeId: string | null,
    id: string,
): { tabs: WorkbookTab[]; activeId: string | null } {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx < 0) return { tabs, activeId };
    const next = tabs.filter((t) => t.id !== id);
    if (activeId !== id) return { tabs: next, activeId };
    if (next.length === 0) return { tabs: next, activeId: null };
    return { tabs: next, activeId: next[Math.min(idx, next.length - 1)].id };
}

/** The tab label always mirrors its document's own title — renaming a tab renames the board. */
export function renameWorkbookTab(tabs: WorkbookTab[], id: string, title: string): WorkbookTab[] {
    return tabs.map((t) => (t.id === id ? { ...t, doc: { ...t.doc, title } } : t));
}

/** Replaces one tab's document in place — how the active board's edits flow back into the tab list. */
export function updateWorkbookTabDoc(tabs: WorkbookTab[], id: string, doc: WorkbookDoc): WorkbookTab[] {
    return tabs.map((t) => (t.id === id ? { ...t, doc } : t));
}
