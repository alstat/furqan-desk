import { writable, derived, get } from 'svelte/store';
import { scriptLanguageForFile } from '$lib/languages/scriptLanguages';
import { rename, exists } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';
import { lexicalToTypst } from '$lib/functions/utils/typstConverters';

export type TabType = 'typst' | 'lexical' | 'text' | 'julia' | 'lean' | 'r' | 'python';

export interface EditorTab {
	id: string;
	type: TabType;
	path: string | null; // null = unsaved
	name: string;
	content: string; // typst src / lexical JSON snapshot / raw text
	isDirty: boolean;
	isPreview: boolean; // true = VSCode-style preview tab (italic, replaced on next single-click)
}

// ── Hot Exit (VS Code-style session persistence) ───────────────────────────────

const HOT_EXIT_KEY = 'hot-exit-session';
// The active tab id lives in its own key so that merely switching tabs — by far
// the most frequent change — costs a short string write instead of
// re-serialising every open file's full contents.
const HOT_EXIT_ACTIVE_KEY = 'hot-exit-active-tab';

interface HotExitData {
	tabs: EditorTab[];
	/** Legacy: older sessions stored the active id alongside the tabs. */
	activeTabId?: string | null;
}

function loadHotExit(): { tabs: EditorTab[]; activeTabId: string | null } | null {
	try {
		if (typeof localStorage === 'undefined') return null;
		const raw = localStorage.getItem(HOT_EXIT_KEY);
		if (!raw) return null;
		const data = JSON.parse(raw) as HotExitData;
		if (!Array.isArray(data.tabs) || data.tabs.length === 0) return null;
		const valid = data.tabs.filter((t): t is EditorTab =>
			!!t &&
			typeof t.id === 'string' &&
			typeof t.content === 'string' &&
			typeof t.type === 'string' &&
			typeof t.name === 'string'
		);
		if (!valid.length) return null;
		// Prefer the standalone key; fall back to the id embedded in older payloads.
		const storedActive = localStorage.getItem(HOT_EXIT_ACTIVE_KEY) ?? data.activeTabId;
		const validActiveId =
			typeof storedActive === 'string' && valid.some(t => t.id === storedActive)
				? storedActive
				: valid[0].id;
		return { tabs: valid, activeTabId: validActiveId };
	} catch {
		return null;
	}
}

export function clearHotExit(): void {
	try {
		localStorage.removeItem(HOT_EXIT_KEY);
		localStorage.removeItem(HOT_EXIT_ACTIVE_KEY);
	} catch { /* ignore */ }
}

const _hotExit = loadHotExit();

export const tabs        = writable<EditorTab[]>(_hotExit?.tabs ?? []);
export const activeTabId = writable<string | null>(_hotExit?.activeTabId ?? null);

// Debounced save — fires 600 ms after the last tabs change. Serialising every
// open file is the expensive part, so it runs on an idle callback: a pause in
// typing is exactly when the main thread is free, but it is also when the user
// is most likely to start typing again, and a 1 MB JSON.stringify + synchronous
// localStorage write would show up as a stall.
let _hotExitTimer: ReturnType<typeof setTimeout> | null = null;
let _hotExitIdle: number | null = null;

type IdleWindow = Window & {
	requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
	cancelIdleCallback?: (handle: number) => void;
};

function whenIdle(cb: () => void): void {
	const w = globalThis as unknown as IdleWindow;
	if (typeof w.requestIdleCallback === 'function') {
		_hotExitIdle = w.requestIdleCallback(cb, { timeout: 2000 });
	} else {
		_hotExitIdle = null;
		cb();
	}
}

function writeHotExitTabs(): void {
	try {
		const data: HotExitData = { tabs: get(tabs) };
		localStorage.setItem(HOT_EXIT_KEY, JSON.stringify(data));
	} catch { /* ignore */ }
}

function scheduleHotExitSave(): void {
	if (_hotExitTimer !== null) clearTimeout(_hotExitTimer);
	if (_hotExitIdle !== null) {
		(globalThis as unknown as IdleWindow).cancelIdleCallback?.(_hotExitIdle);
		_hotExitIdle = null;
	}
	_hotExitTimer = setTimeout(() => {
		_hotExitTimer = null;
		whenIdle(() => {
			_hotExitIdle = null;
			writeHotExitTabs();
		});
	}, 600);
}

tabs.subscribe(scheduleHotExitSave);

// Cheap on its own — no debounce or idle deferral needed.
activeTabId.subscribe((id) => {
	try {
		if (id === null) localStorage.removeItem(HOT_EXIT_ACTIVE_KEY);
		else localStorage.setItem(HOT_EXIT_ACTIVE_KEY, id);
	} catch { /* ignore */ }
});

// A pending idle save would be lost if the window goes away first; flush it.
if (typeof window !== 'undefined') {
	window.addEventListener('beforeunload', () => {
		if (_hotExitTimer === null && _hotExitIdle === null) return;
		writeHotExitTabs();
	});
}

export const activeTab   = derived(
	[tabs, activeTabId],
	([$t, $id]) => $t.find(t => t.id === $id) ?? null
);

// Folder opened via "Open Folder" button — drives the file browser in Editor Controls
export const openFolderPath = writable<string | null>(null);

/** Bumped to force the file explorer to re-read the current folder even when
 *  openFolderPath is unchanged (e.g. user re-picks the same folder). */
export const folderRefreshTrigger = writable<number>(0);

// Undo/redo is owned by the editors themselves — CodeMirror's history()
// extension for the code editors, Lexical's HistoryPlugin for the rich-text
// one. This store deliberately keeps no snapshots of its own: doing so cost a
// full copy of the document on every keystroke and nothing ever read them.

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
	'jl', 'lean',
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

// Raster/image formats shown in the file explorer and opened in the media
// viewer dialog. `svg` is intentionally excluded — it stays a text-editable
// flat file (see FLAT_FILE_EXTENSIONS).
const IMAGE_EXTENSIONS = new Set([
	'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif', 'tif', 'tiff',
]);

export function isImageFile(filename: string): boolean {
	const ext = filename.split('.').pop()?.toLowerCase() ?? '';
	return IMAGE_EXTENSIONS.has(ext);
}

export function isPdfFile(filename: string): boolean {
	return (filename.split('.').pop()?.toLowerCase() ?? '') === 'pdf';
}

export function detectType(path: string): TabType {
	const ext = path.split('.').pop()?.toLowerCase() ?? '';
	if (ext === 'typ') return 'typst';
	if (ext === 'lexical' || ext === 'json') return 'lexical';
	if (ext === 'lean') return 'lean';
	// Julia, R and Python all come from the one registry, so adding a language
	// or an extension is a change in that file rather than a branch here.
	const script = scriptLanguageForFile(path);
	if (script) return script;
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

// Double-click on a tab: promote a preview tab to a permanent (non-preview) tab.
export function promoteTabToPermanent(id: string): void {
	tabs.update(ts =>
		ts.map(t => (t.id === id && t.isPreview ? { ...t, isPreview: false } : t)),
	);
}

// Update a specific tab's content by id and mark it dirty. A write that would
// change nothing is skipped entirely rather than pushed through the store —
// tabs.update always publishes a fresh array, waking every subscriber.
export function setTabContent(id: string, content: string): void {
	const current = get(tabs).find(t => t.id === id);
	if (!current) return;
	if (current.content === content && current.isDirty && !current.isPreview) return;
	tabs.update(ts =>
		ts.map(t => (t.id === id ? { ...t, content, isDirty: true, isPreview: false } : t))
	);
}

// Update active tab content and mark it dirty.
export function setActiveTabContent(content: string): void {
	const id = get(activeTabId);
	if (!id) return;
	// Editing a preview tab promotes it to permanent
	setTabContent(id, content);
}

export function markTabSaved(id: string, path: string): void {
	const name = path.split('/').pop()!;
	tabs.update(ts =>
		ts.map(t => (t.id === id ? { ...t, path, name, isDirty: false, isPreview: false } : t))
	);

	const folder = get(openFolderPath);
	if (folder && isPathInsideFolder(path, folder)) {
		folderRefreshTrigger.update(n => n + 1);
	}
}

/** Rename a file on disk and reflect the new path/name in any open tabs. */
export async function renameFileByPath(oldPath: string, newName: string): Promise<void> {
	const trimmed = newName.trim();
	if (!trimmed) return;
	const dir = oldPath.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
	const newPath = dir ? `${dir}/${trimmed}` : trimmed;
	if (newPath === oldPath) return;
	await rename(oldPath, newPath);
	tabs.update(ts =>
		ts.map(t => (t.path === oldPath ? { ...t, path: newPath, name: trimmed } : t))
	);
	const folder = get(openFolderPath);
	if (folder) folderRefreshTrigger.update(n => n + 1);
}

/**
 * Move a file or folder into `destDir` (keeping its name) and update any open
 * tabs — both a moved file itself and files living inside a moved folder.
 */
export async function moveFileByPath(oldPath: string, destDir: string): Promise<void> {
	const normalizedOld = oldPath.replace(/\\/g, '/');
	const name = normalizedOld.split('/').pop()!;
	const newPath = `${destDir.replace(/\\/g, '/').replace(/\/+$/, '')}/${name}`;
	if (newPath === normalizedOld) return;
	await rename(oldPath, newPath);
	tabs.update(ts =>
		ts.map(t => {
			if (!t.path) return t;
			const p = t.path.replace(/\\/g, '/');
			if (p === normalizedOld) return { ...t, path: newPath };
			if (p.startsWith(`${normalizedOld}/`)) {
				return { ...t, path: newPath + p.slice(normalizedOld.length) };
			}
			return t;
		})
	);
	const folder = get(openFolderPath);
	if (folder) folderRefreshTrigger.update(n => n + 1);
}

/**
 * Compute a collision-free destination path inside `destDir` for an item named
 * `name`, VS Code-style: the first clash becomes "name copy", then "name copy 2",
 * etc. The " copy" suffix is inserted before the extension for files.
 */
async function uniqueDestPath(destDir: string, name: string): Promise<string> {
	const dir = destDir.replace(/\\/g, '/').replace(/\/+$/, '');
	const dot = name.lastIndexOf('.');
	const hasExt = dot > 0;
	const base = hasExt ? name.slice(0, dot) : name;
	const ext = hasExt ? name.slice(dot) : '';

	let candidate = name;
	let attempt = 0;
	// First try the original name; then "base copy", "base copy 2", …
	while (await exists(`${dir}/${candidate}`)) {
		attempt += 1;
		const suffix = attempt === 1 ? ' copy' : ` copy ${attempt}`;
		candidate = `${base}${suffix}${ext}`;
	}
	return `${dir}/${candidate}`;
}

/**
 * Soft-delete a file or folder by moving it to the OS Trash / Recycle Bin
 * (recoverable). Any open tabs backed by the deleted path — or living inside a
 * deleted folder — are closed, then the explorer tree is refreshed.
 */
export async function deleteFileByPath(path: string): Promise<void> {
	await invoke('move_to_trash', { path });

	const normalized = path.replace(/\\/g, '/');
	const affected = get(tabs).filter(t => {
		if (!t.path) return false;
		const p = t.path.replace(/\\/g, '/');
		return p === normalized || p.startsWith(`${normalized}/`);
	});
	for (const t of affected) closeTab(t.id);

	const folder = get(openFolderPath);
	if (folder) folderRefreshTrigger.update(n => n + 1);
}

/**
 * Copy a file or folder into `destDir`, resolving name collisions the VS Code
 * way (" copy" suffix). Backed by the recursive `copy_path` Rust command so
 * whole folders are duplicated. Returns the resolved destination path.
 */
export async function copyPathInto(srcPath: string, destDir: string): Promise<string> {
	const name = srcPath.replace(/\\/g, '/').split('/').pop()!;
	const dst = await uniqueDestPath(destDir, name);
	await invoke('copy_path', { src: srcPath, dst });
	const folder = get(openFolderPath);
	if (folder) folderRefreshTrigger.update(n => n + 1);
	return dst;
}

/**
 * Move (cut/paste) a file or folder into `destDir`, resolving name collisions
 * the VS Code way. Open tabs for the moved item — and files inside a moved
 * folder — follow it to the new path. Returns the resolved destination path.
 */
export async function cutPathInto(srcPath: string, destDir: string): Promise<string> {
	const normalizedOld = srcPath.replace(/\\/g, '/');
	const name = normalizedOld.split('/').pop()!;
	const newPath = await uniqueDestPath(destDir, name);
	if (newPath === normalizedOld) return newPath;
	await rename(srcPath, newPath);
	tabs.update(ts =>
		ts.map(t => {
			if (!t.path) return t;
			const p = t.path.replace(/\\/g, '/');
			if (p === normalizedOld) return { ...t, path: newPath };
			if (p.startsWith(`${normalizedOld}/`)) {
				return { ...t, path: newPath + p.slice(normalizedOld.length) };
			}
			return t;
		})
	);
	const folder = get(openFolderPath);
	if (folder) folderRefreshTrigger.update(n => n + 1);
	return newPath;
}

/** Rename a tab — renames the backing file when saved, otherwise just the label. */
export async function renameTab(id: string, newName: string): Promise<void> {
	const tab = get(tabs).find(t => t.id === id);
	if (!tab) return;
	const trimmed = newName.trim();
	if (!trimmed || trimmed === tab.name) return;
	if (tab.path) {
		await renameFileByPath(tab.path, trimmed);
	} else {
		tabs.update(ts => ts.map(t => (t.id === id ? { ...t, name: trimmed } : t)));
	}
}

export function syncCleanTabsFromDisk(path: string, content: string): void {
	tabs.update(ts =>
		ts.map(t => {
			if (t.path !== path || t.isDirty || t.content === content) return t;
			return { ...t, content };
		})
	);
}

function isPathInsideFolder(path: string, folder: string): boolean {
	const normalizedPath = path.replace(/\\/g, '/');
	const normalizedFolder = folder.replace(/\\/g, '/').replace(/\/+$/, '');
	return normalizedPath.startsWith(`${normalizedFolder}/`);
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
