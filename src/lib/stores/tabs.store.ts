import { writable, derived, get } from 'svelte/store';
import { lexicalToTypst } from '$lib/functions/utils/typstConverters';

export type TabType = 'typst' | 'lexical' | 'text';

export interface EditorTab {
	id: string;
	type: TabType;
	path: string | null; // null = unsaved
	name: string;
	content: string; // typst src / lexical JSON snapshot / raw text
	isDirty: boolean;
}

export const tabs        = writable<EditorTab[]>([]);
export const activeTabId = writable<string | null>(null);
export const activeTab   = derived(
	[tabs, activeTabId],
	([$t, $id]) => $t.find(t => t.id === $id) ?? null
);

// Non-reactive undo/redo (keyed by tab id — avoids store churn)
export const undoHistory = new Map<string, string[]>();
export const redoHistory = new Map<string, string[]>();

export function detectType(path: string): TabType {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	if (ext === 'typ') return 'typst';
	if (ext === 'lexical' || ext === 'json') return 'lexical';
	return 'text';
}

export function createTab(
	type: TabType,
	content = '',
	path: string | null = null,
	name?: string
): EditorTab {
	return {
		id: crypto.randomUUID(),
		type,
		path,
		name: name ?? (path ? path.split('/').pop()! : 'Untitled'),
		content,
		isDirty: false
	};
}

// Open a file as a tab; if already open, just focus it
export function openOrFocusTab(path: string, content: string): void {
	const existing = get(tabs).find(t => t.path === path);
	if (existing) {
		activeTabId.set(existing.id);
		return;
	}
	const tab = createTab(detectType(path), content, path);
	tabs.update(ts => [...ts, tab]);
	activeTabId.set(tab.id);
}

// Update active tab content, mark dirty, push to undo history
export function setActiveTabContent(content: string): void {
	const id = get(activeTabId);
	if (!id) return;
	const current = get(tabs).find(t => t.id === id);
	if (!current) return;
	// Push old content to undo stack (cap at 100)
	const stack = undoHistory.get(id) ?? [];
	stack.push(current.content);
	if (stack.length > 100) stack.shift();
	undoHistory.set(id, stack);
	redoHistory.set(id, []); // clear redo on new edit
	tabs.update(ts =>
		ts.map(t => (t.id === id ? { ...t, content, isDirty: true } : t))
	);
}

export function undoActiveTab(): void {
	const id = get(activeTabId);
	if (!id) return;
	const stack = undoHistory.get(id) ?? [];
	if (!stack.length) return;
	const prev = stack.pop()!;
	const cur = get(tabs).find(t => t.id === id)!;
	const redo = redoHistory.get(id) ?? [];
	redo.push(cur.content);
	redoHistory.set(id, redo);
	undoHistory.set(id, stack);
	tabs.update(ts =>
		ts.map(t => (t.id === id ? { ...t, content: prev, isDirty: true } : t))
	);
}

export function redoActiveTab(): void {
	const id = get(activeTabId);
	if (!id) return;
	const stack = redoHistory.get(id) ?? [];
	if (!stack.length) return;
	const next = stack.pop()!;
	const cur = get(tabs).find(t => t.id === id)!;
	const undo = undoHistory.get(id) ?? [];
	undo.push(cur.content);
	undoHistory.set(id, undo);
	redoHistory.set(id, stack);
	tabs.update(ts =>
		ts.map(t => (t.id === id ? { ...t, content: next, isDirty: true } : t))
	);
}

export function markTabSaved(id: string, path: string): void {
	const name = path.split('/').pop()!;
	tabs.update(ts =>
		ts.map(t => (t.id === id ? { ...t, path, name, isDirty: false } : t))
	);
}

export function closeTab(id: string): void {
	const ts = get(tabs);
	if (ts.length === 1) {
		// Always keep at least one tab — reset to fresh untitled lexical
		const fresh = createTab('lexical');
		tabs.set([fresh]);
		activeTabId.set(fresh.id);
		return;
	}
	const idx = ts.findIndex(t => t.id === id);
	const remaining = ts.filter(t => t.id !== id);
	tabs.set(remaining);
	if (get(activeTabId) === id) {
		activeTabId.set(remaining[Math.min(idx, remaining.length - 1)].id);
	}
	undoHistory.delete(id);
	redoHistory.delete(id);
}

export function toggleActiveTabType(): void {
	const tab = get(activeTab);
	if (!tab) return;
	if (tab.type === 'lexical') {
		// Convert lexical JSON → typst
		const typstSrc = lexicalToTypst(tab.content);
		tabs.update(ts =>
			ts.map(t =>
				t.id === tab.id
					? { ...t, type: 'typst', content: typstSrc, isDirty: true }
					: t
			)
		);
	} else if (tab.type === 'typst') {
		// Switch back to lexical
		tabs.update(ts =>
			ts.map(t =>
				t.id === tab.id ? { ...t, type: 'lexical', isDirty: false } : t
			)
		);
	}
}
