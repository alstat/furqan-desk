import { writable, derived, get } from 'svelte/store';
import { lexicalToTypst } from '$lib/functions/utils/typstConverters';

export type TabType = 'typst' | 'lexical' | 'text' | 'julia';

export interface EditorTab {
	id: string;
	type: TabType;
	path: string | null; // null = unsaved
	name: string;
	content: string; // typst src / lexical JSON snapshot / raw text
	isDirty: boolean;
	isPreview: boolean; // true = VSCode-style preview tab (italic, replaced on next single-click)
}

export const tabs        = writable<EditorTab[]>([]);
export const activeTabId = writable<string | null>(null);
export const activeTab   = derived(
	[tabs, activeTabId],
	([$t, $id]) => $t.find(t => t.id === $id) ?? null
);

// Folder opened via "Open Folder" button — drives the file browser in Editor Controls
export const openFolderPath = writable<string | null>(null);

// Non-reactive undo/redo (keyed by tab id — avoids store churn)
export const undoHistory = new Map<string, string[]>();
export const redoHistory = new Map<string, string[]>();

// Allowlist of extensions that are safe to open in a text editor
const FLAT_FILE_EXTENSIONS = new Set([
	// document / markup
	'typ', 'bib', 'txt', 'md', 'mdx', 'rst', 'tex', 'html', 'htm', 'xml', 'svg',
	// data / config
	'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'env', 'csv', 'tsv',
	// code
	'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'svelte', 'vue',
	'py', 'rb', 'rs', 'go', 'java', 'kt', 'swift', 'c', 'cpp', 'h', 'hpp',
	'cs', 'php', 'lua', 'r', 'sh', 'bash', 'zsh', 'fish', 'ps1',
	// style
	'css', 'scss', 'sass', 'less',
	// code — scripting languages
	'jl',
	// misc text
	'lexical', 'log', 'diff', 'patch', 'sql', 'graphql', 'gql',
	'dockerfile', 'makefile', 'gitignore', 'prettierrc', 'eslintrc',
]);

export function isFlatFile(filename: string): boolean {
	const ext = filename.split('.').pop()?.toLowerCase() ?? '';
	// Also allow files with no extension or dotfiles (e.g. .gitignore)
	if (!ext || filename.startsWith('.')) return true;
	return FLAT_FILE_EXTENSIONS.has(ext);
}

export function detectType(path: string): TabType {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	if (ext === 'typ') return 'typst';
	if (ext === 'lexical' || ext === 'json') return 'lexical';
	if (ext === 'jl') return 'julia';
	return 'text';
}

export function createTab(
	type: TabType,
	content = '',
	path: string | null = null,
	name?: string,
	isPreview = false
): EditorTab {
	return {
		id: crypto.randomUUID(),
		type,
		path,
		name: name ?? (path ? path.split('/').pop()! : 'Untitled'),
		content,
		isDirty: false,
		isPreview
	};
}

// Single-click: open as preview tab (italic). Replaces any existing preview tab.
// If already open as a permanent tab, just focus it.
export function openPreviewTab(path: string, content: string): void {
	// Already open as permanent — just focus
	const permanent = get(tabs).find(t => t.path === path && !t.isPreview);
	if (permanent) { activeTabId.set(permanent.id); return; }

	const type = detectType(path);
	const name = path.split('/').pop()!;
	const existing = get(tabs).find(t => t.isPreview);

	if (existing) {
		// Reuse the preview slot in-place (keep same id so tab position stays)
		tabs.update(ts => ts.map(t =>
			t.id === existing.id
				? { ...t, type, path, name, content, isDirty: false }
				: t
		));
		activeTabId.set(existing.id);
	} else {
		const tab = createTab(type, content, path, name, true);
		tabs.update(ts => [...ts, tab]);
		activeTabId.set(tab.id);
	}
}

// Double-click: promote preview → permanent, or open new permanent tab.
export function openOrFocusTab(path: string, content: string): void {
	// Already open as permanent — focus
	const permanent = get(tabs).find(t => t.path === path && !t.isPreview);
	if (permanent) { activeTabId.set(permanent.id); return; }

	// Exists as preview with same path — promote it
	const preview = get(tabs).find(t => t.path === path && t.isPreview);
	if (preview) {
		tabs.update(ts => ts.map(t => t.id === preview.id ? { ...t, isPreview: false } : t));
		activeTabId.set(preview.id);
		return;
	}

	// Create new permanent tab (replaces any other preview slot if it exists)
	const tab = createTab(detectType(path), content, path);
	tabs.update(ts => [...ts, tab]);
	activeTabId.set(tab.id);
}

// Update a specific tab's content by id, mark dirty, push to undo history
export function setTabContent(id: string, content: string): void {
	const current = get(tabs).find(t => t.id === id);
	if (!current) return;
	const stack = undoHistory.get(id) ?? [];
	stack.push(current.content);
	if (stack.length > 100) stack.shift();
	undoHistory.set(id, stack);
	redoHistory.set(id, []);
	tabs.update(ts =>
		ts.map(t => (t.id === id ? { ...t, content, isDirty: true, isPreview: false } : t))
	);
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
	// Editing a preview tab promotes it to permanent
	tabs.update(ts =>
		ts.map(t => (t.id === id ? { ...t, content, isDirty: true, isPreview: false } : t))
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
		ts.map(t => (t.id === id ? { ...t, path, name, isDirty: false, isPreview: false } : t))
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
		const typstSrc = lexicalToTypst(tab.content);
		tabs.update(ts =>
			ts.map(t =>
				t.id === tab.id
					? { ...t, type: 'typst', content: typstSrc, isDirty: true }
					: t
			)
		);
	} else if (tab.type === 'typst') {
		tabs.update(ts =>
			ts.map(t =>
				t.id === tab.id ? { ...t, type: 'lexical', isDirty: false } : t
			)
		);
	}
}
