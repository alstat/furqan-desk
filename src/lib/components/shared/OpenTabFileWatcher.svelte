<script lang="ts">
	import { onDestroy } from 'svelte';
	import { readTextFile, stat, watchImmediate, type UnwatchFn } from '@tauri-apps/plugin-fs';
	import { tabs, syncCleanTabsFromDisk } from '$lib/stores/tabs.store';

	type DirectoryWatch = {
		unwatch: UnwatchFn;
		paths: Set<string>;
		timer: ReturnType<typeof setTimeout> | null;
	};

	const watchByDirectory = new Map<string, DirectoryWatch>();
	const signatureByPath = new Map<string, string>();
	const POLL_INTERVAL_MS = 1000;
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	function dirname(path: string): string | null {
		const normalized = path.replace(/\\/g, '/');
		const idx = normalized.lastIndexOf('/');
		return idx > 0 ? normalized.slice(0, idx) : null;
	}

	function clearRefreshTimer(directory: string): void {
		const watch = watchByDirectory.get(directory);
		if (!watch?.timer) return;
		clearTimeout(watch.timer);
		watch.timer = null;
	}

	async function refreshPath(path: string): Promise<void> {
		try {
			const content = await readTextFile(path);
			syncCleanTabsFromDisk(path, content);
			await updatePathSignature(path);
		} catch {
			// Ignore files that are temporarily inaccessible or removed.
		}
	}

	function buildSignature(mtimeMs: number | null, size: number): string {
		return `${mtimeMs ?? 'null'}:${size}`;
	}

	async function updatePathSignature(path: string): Promise<string | null> {
		try {
			const info = await stat(path);
			const signature = buildSignature(info.mtime?.getTime() ?? null, info.size);
			signatureByPath.set(path, signature);
			return signature;
		} catch {
			signatureByPath.delete(path);
			return null;
		}
	}

	async function pollPaths(paths: string[]): Promise<void> {
		await Promise.all(
			paths.map(async (path) => {
				const previous = signatureByPath.get(path) ?? null;
				const next = await updatePathSignature(path);
				if (previous !== null && next !== null && previous !== next) {
					await refreshPath(path);
				}
			}),
		);
	}

	/**
	 * Only paths no directory watcher covers. `watchImmediate` already reports
	 * changes for the rest, so polling those too meant one `stat` IPC round trip
	 * per open tab every second, for as long as any file-backed tab was open,
	 * duplicating work the watcher had already done. What is left is the genuine
	 * fallback: a file at the filesystem root (no parent to watch), or one whose
	 * directory `ensureDirectoryWatch` could not watch.
	 */
	function unwatchedPaths(): string[] {
		const out: string[] = [];
		for (const tab of $tabs) {
			const path = tab.path;
			if (typeof path !== 'string' || path.length === 0) continue;
			const directory = dirname(path);
			if (directory && watchByDirectory.has(directory)) continue;
			out.push(path);
		}
		return out;
	}

	function ensurePolling(): void {
		if (pollTimer) return;
		pollTimer = setInterval(() => {
			const paths = unwatchedPaths();
			if (paths.length === 0) return;
			void pollPaths(paths);
		}, POLL_INTERVAL_MS);
	}

	function stopPolling(): void {
		if (!pollTimer) return;
		clearInterval(pollTimer);
		pollTimer = null;
	}

	async function refreshDirectory(directory: string): Promise<void> {
		const watch = watchByDirectory.get(directory);
		if (!watch) return;
		await Promise.all([...watch.paths].map((path) => refreshPath(path)));
	}

	function scheduleRefresh(directory: string): void {
		clearRefreshTimer(directory);
		const watch = watchByDirectory.get(directory);
		if (!watch) return;
		watch.timer = setTimeout(() => {
			watch.timer = null;
			void refreshDirectory(directory);
		}, 150);
	}

	async function ensureDirectoryWatch(directory: string): Promise<void> {
		if (watchByDirectory.has(directory)) return;
		try {
			const unwatch = await watchImmediate(directory, () =>
				scheduleRefresh(directory),
			);
			watchByDirectory.set(directory, {
				unwatch,
				paths: new Set(),
				timer: null,
			});
		} catch {
			// Watching unavailable for this directory.
		}
	}

	function stopWatchingDirectory(directory: string): void {
		const watch = watchByDirectory.get(directory);
		if (!watch) return;
		if (watch.timer) clearTimeout(watch.timer);
		watch.unwatch();
		watchByDirectory.delete(directory);
	}

	$effect(() => {
		const pathsByDirectory = new Map<string, Set<string>>();
		const currentPaths = new Set<string>();

		for (const tab of $tabs) {
			if (!tab.path) continue;
			currentPaths.add(tab.path);
			const directory = dirname(tab.path);
			if (!directory) continue;
			let paths = pathsByDirectory.get(directory);
			if (!paths) {
				paths = new Set();
				pathsByDirectory.set(directory, paths);
			}
			paths.add(tab.path);
		}

		for (const existingDirectory of [...watchByDirectory.keys()]) {
			if (!pathsByDirectory.has(existingDirectory)) {
				stopWatchingDirectory(existingDirectory);
			}
		}

		for (const [directory, paths] of pathsByDirectory) {
			void ensureDirectoryWatch(directory).then(() => {
				const watch = watchByDirectory.get(directory);
				if (watch) watch.paths = paths;
			});
		}

		for (const path of [...signatureByPath.keys()]) {
			if (!currentPaths.has(path)) signatureByPath.delete(path);
		}

		for (const path of currentPaths) {
			if (!signatureByPath.has(path)) void updatePathSignature(path);
		}

		if (currentPaths.size > 0) ensurePolling();
		else stopPolling();
	});

	onDestroy(() => {
		stopPolling();
		for (const directory of [...watchByDirectory.keys()]) {
			stopWatchingDirectory(directory);
		}
	});
</script>
