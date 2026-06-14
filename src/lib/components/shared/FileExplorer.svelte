<script lang="ts">
	import { fly } from 'svelte/transition';
	import { open as openDialog } from '@tauri-apps/plugin-dialog';
	import { readDir, readTextFile, watchImmediate, type UnwatchFn } from '@tauri-apps/plugin-fs';
	import { onDestroy } from 'svelte';
	import Icon from '@iconify/svelte';
	import { openFolderPath, folderRefreshTrigger, openPreviewTab, openOrFocusTab, isFlatFile, isImageFile, isPdfFile, tabs, syncCleanTabsFromDisk } from '$lib/stores/tabs.store';
	import MediaViewerDialog from './MediaViewerDialog.svelte';
	import { surahOrientation } from '$lib/stores/quran.svelte';
    import { actionBtnStyle } from '$lib/data/toolbar/toolbar';
	import { t } from '$lib/i18n';
    import { zenMode, zenPeek } from '$lib/stores/editor.store';
	import { bringToFront } from '$lib/stores/window-manager.store';

	interface FileTreeNode {
		name: string;
		path: string;
		isDirectory: boolean;
		isExpanded: boolean;
		isLoaded: boolean;
		isLoading: boolean;
		isForbidden: boolean;
		children: FileTreeNode[];
	}

	let isOpen = $state(false);
	let rootNodes = $state<FileTreeNode[]>([]);
	let isLoadingRoot = $state(false);
	let loadError = $state('');

	// Pinning keeps the panel open when clicking outside (no backdrop) and lets
	// the user drag it anywhere by its header. `panelPos` is null while the panel
	// sits at its default anchored position; once dragged it switches to fixed
	// positioning at the stored viewport coordinates.
	let isPinned = $state(false);
	let panelPos = $state<{ x: number; y: number } | null>(null);
	let panelEl = $state<HTMLElement | null>(null);
	let _dragging = false;
	let _dragOffsetX = 0;
	let _dragOffsetY = 0;

	// Share the global window-manager stack so clicking the panel raises it above
	// any open dialogs (which use the same `bringToFront()` counter, base 500).
	let zIndex = $state(50);
	function focusPanel() {
		zIndex = bringToFront();
	}

	function startDrag(e: PointerEvent) {
		if (!isPinned || !panelEl) return;
		// Let header buttons (change folder, pin, …) handle their own clicks.
		if ((e.target as HTMLElement).closest('button')) return;
		const rect = panelEl.getBoundingClientRect();
		if (!panelPos) panelPos = { x: rect.left, y: rect.top };
		_dragOffsetX = e.clientX - panelPos.x;
		_dragOffsetY = e.clientY - panelPos.y;
		_dragging = true;
		window.addEventListener('pointermove', onDrag);
		window.addEventListener('pointerup', endDrag);
		e.preventDefault();
	}

	function onDrag(e: PointerEvent) {
		if (!_dragging || !panelEl) return;
		const w = panelEl.offsetWidth;
		const h = panelEl.offsetHeight;
		const x = Math.max(0, Math.min(e.clientX - _dragOffsetX, window.innerWidth - w));
		const y = Math.max(0, Math.min(e.clientY - _dragOffsetY, window.innerHeight - h));
		panelPos = { x, y };
	}

	function endDrag() {
		_dragging = false;
		window.removeEventListener('pointermove', onDrag);
		window.removeEventListener('pointerup', endDrag);
	}

	// Resizing (pinned only). Like dragging, the panel keeps its default Tailwind
	// size until the first resize, then switches to an explicit width/height. The
	// n/w handles move the top-left corner, so resizing initialises `panelPos`
	// (switching to fixed positioning) the same way dragging does.
	const MIN_W = 200;
	const MIN_H = 160;
	let panelSize = $state<{ w: number; h: number } | null>(null);

	type ResizeDir = { e: boolean; w: boolean; n: boolean; s: boolean };
	const resizeHandles: Array<{ cls: string; dir: ResizeDir }> = [
		{ cls: 'resize-n', dir: { n: true, s: false, e: false, w: false } },
		{ cls: 'resize-s', dir: { n: false, s: true, e: false, w: false } },
		{ cls: 'resize-e', dir: { n: false, s: false, e: true, w: false } },
		{ cls: 'resize-w', dir: { n: false, s: false, e: false, w: true } },
		{ cls: 'resize-ne', dir: { n: true, s: false, e: true, w: false } },
		{ cls: 'resize-se', dir: { n: false, s: true, e: true, w: false } },
		{ cls: 'resize-sw', dir: { n: false, s: true, e: false, w: true } },
		{ cls: 'resize-nw', dir: { n: true, s: false, e: false, w: true } },
	];
	let _resizeDir: ResizeDir = { e: false, w: false, n: false, s: false };
	let _resizeStartX = 0,
		_resizeStartY = 0,
		_resizeStartW = 0,
		_resizeStartH = 0,
		_resizeStartPanelX = 0,
		_resizeStartPanelY = 0;

	function startResize(e: PointerEvent, dir: ResizeDir) {
		if (!panelEl) return;
		e.preventDefault();
		e.stopPropagation();
		const rect = panelEl.getBoundingClientRect();
		if (!panelPos) panelPos = { x: rect.left, y: rect.top };
		if (!panelSize) panelSize = { w: rect.width, h: rect.height };
		_resizeDir = dir;
		_resizeStartX = e.clientX;
		_resizeStartY = e.clientY;
		_resizeStartW = panelSize.w;
		_resizeStartH = panelSize.h;
		_resizeStartPanelX = panelPos.x;
		_resizeStartPanelY = panelPos.y;
		document.body.style.userSelect = 'none';
		window.addEventListener('pointermove', onResize);
		window.addEventListener('pointerup', stopResize, { once: true });
	}

	function onResize(e: PointerEvent) {
		if (!panelSize || !panelPos) return;
		const dx = e.clientX - _resizeStartX;
		const dy = e.clientY - _resizeStartY;
		let newW = _resizeStartW;
		let newH = _resizeStartH;
		let newX = _resizeStartPanelX;
		let newY = _resizeStartPanelY;
		if (_resizeDir.e) newW = Math.max(MIN_W, _resizeStartW + dx);
		if (_resizeDir.s) newH = Math.max(MIN_H, _resizeStartH + dy);
		if (_resizeDir.w) {
			newW = Math.max(MIN_W, _resizeStartW - dx);
			newX = _resizeStartPanelX + (_resizeStartW - newW);
		}
		if (_resizeDir.n) {
			newH = Math.max(MIN_H, _resizeStartH - dy);
			newY = _resizeStartPanelY + (_resizeStartH - newH);
		}
		panelSize = { w: newW, h: newH };
		panelPos = { x: newX, y: newY };
	}

	function stopResize() {
		document.body.style.userSelect = '';
		window.removeEventListener('pointermove', onResize);
	}

	let folderName = $derived($openFolderPath?.split('/').pop() ?? '');
	let isRtl = $derived($surahOrientation() === 'flex-row-reverse');

	// Panel opens to the left (LTR) or right (RTL) of the editor content div
	// let panelClass = $derived(
	// 	isRtl
	// 		? 'absolute top-0 left-full ml-2 z-20 rounded-r-lg'
	// 		: 'absolute top-0 right-full mr-2 z-20 rounded-l-lg'
	// );

	// Button sits just outside the editor content div's left (LTR) or right (RTL) edge
	// let buttonPosClass = $derived(isRtl ? '-right-10' : '-left-5');

	let _unwatch: UnwatchFn | null = null;
	let _refreshTimer: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const folder = $openFolderPath;
		rootNodes = [];
		loadError = '';
		if (_unwatch) { _unwatch(); _unwatch = null; }
		if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
		if (!folder) return;
		loadRoot(folder);
		setupWatcher(folder);
	});

	// Manual refresh trigger (e.g. user re-picks the same folder via OpenFolderButton)
	$effect(() => {
		const tick = $folderRefreshTrigger;
		if (tick === 0) return;
		const folder = $openFolderPath;
		if (folder) refreshTree(folder);
	});

	onDestroy(() => {
		if (_unwatch) _unwatch();
		if (_refreshTimer) clearTimeout(_refreshTimer);
		window.removeEventListener('pointermove', onDrag);
		window.removeEventListener('pointerup', endDrag);
		window.removeEventListener('pointermove', onResize);
		document.body.style.userSelect = '';
	});

	async function setupWatcher(folder: string) {
		try {
			_unwatch = await watchImmediate(
				folder,
				() => {
					if (_refreshTimer) clearTimeout(_refreshTimer);
					_refreshTimer = setTimeout(() => {
						_refreshTimer = null;
						if ($openFolderPath === folder) refreshTree(folder);
					}, 150);
				},
				{ recursive: true }
			);
		} catch {
			// Watching unavailable (e.g. permissions); explorer still works manually.
		}
	}

	function collectExpanded(nodes: FileTreeNode[], set: Set<string>) {
		for (const n of nodes) {
			if (n.isDirectory && n.isExpanded && n.isLoaded) {
				set.add(n.path);
				collectExpanded(n.children, set);
			}
		}
	}

	async function buildWithExpanded(
		parentPath: string,
		expanded: Set<string>
	): Promise<FileTreeNode[]> {
		const entries = await readDir(parentPath);
		const nodes = buildNodes(entries, parentPath);
		for (const n of nodes) {
			if (n.isDirectory && expanded.has(n.path)) {
				try {
					n.children = await buildWithExpanded(n.path, expanded);
					n.isLoaded = true;
					n.isExpanded = true;
				} catch {
					n.isForbidden = true;
				}
			}
		}
		return nodes;
	}

	async function refreshTree(folder: string) {
		const expanded = new Set<string>();
		collectExpanded(rootNodes, expanded);
		try {
			rootNodes = await buildWithExpanded(folder, expanded);
			await refreshOpenTabsFromDisk(folder);
			loadError = '';
		} catch (e) {
			loadError = String(e);
		}
	}

	async function refreshOpenTabsFromDisk(folder: string) {
		const normalizedFolder = folder.replace(/\\/g, '/').replace(/\/+$/, '');
		const openFileTabs = $tabs.filter((tab) => {
			if (!tab.path) return false;
			const normalizedPath = tab.path.replace(/\\/g, '/');
			return normalizedPath.startsWith(`${normalizedFolder}/`);
		});

		await Promise.all(
			openFileTabs.map(async (tab) => {
				if (!tab.path) return;
				try {
					const content = await readTextFile(tab.path);
					syncCleanTabsFromDisk(tab.path, content);
				} catch {
					// Ignore tabs whose files were removed or are temporarily inaccessible.
				}
			})
		);
	}

	function buildNodes(
		entries: Awaited<ReturnType<typeof readDir>>,
		parentPath: string
	): FileTreeNode[] {
		const dirs: FileTreeNode[] = [];
		const files: FileTreeNode[] = [];

		for (const entry of entries) {
			if (!entry.name) continue;
			const fullPath = `${parentPath}/${entry.name}`;
			if (entry.isDirectory) {
				dirs.push({
					name: entry.name,
					path: fullPath,
					isDirectory: true,
					isExpanded: false,
					isLoaded: false,
					isLoading: false,
					isForbidden: false,
					children: []
				});
			} else if (isFlatFile(entry.name) || isImageFile(entry.name) || isPdfFile(entry.name)) {
				files.push({
					name: entry.name,
					path: fullPath,
					isDirectory: false,
					isExpanded: false,
					isLoaded: true,
					isLoading: false,
					isForbidden: false,
					children: []
				});
			}
		}

		dirs.sort((a, b) => a.name.localeCompare(b.name));
		files.sort((a, b) => a.name.localeCompare(b.name));

		return [...dirs, ...files];
	}

	async function loadRoot(folder: string) {
		isLoadingRoot = true;
		loadError = '';
		try {
			const entries = await readDir(folder);
			rootNodes = buildNodes(entries, folder);
		} catch (e) {
			loadError = String(e);
		} finally {
			isLoadingRoot = false;
		}
	}

	async function toggleDirectory(node: FileTreeNode) {
		if (!node.isLoaded) {
			node.isLoading = true;
			node.isForbidden = false;
			try {
				const entries = await readDir(node.path);
				node.children = buildNodes(entries, node.path);
				node.isLoaded = true;
				node.isExpanded = true;
			} catch {
				// Permission denied or other error: mark as forbidden, stay collapsed
				node.isForbidden = true;
				node.isLoaded = false;
				node.isExpanded = false;
			} finally {
				node.isLoading = false;
			}
		} else {
			node.isExpanded = !node.isExpanded;
			// Reset forbidden flag when user retries by clicking again
			if (node.isExpanded) node.isForbidden = false;
		}
	}

	async function openFolder() {
		const result = await openDialog({ directory: true, multiple: false });
		if (!result || Array.isArray(result)) return;
		const picked = result as string;
		if ($openFolderPath === picked) {
			folderRefreshTrigger.update(n => n + 1);
		} else {
			openFolderPath.set(picked);
		}
	}

	async function previewFile(node: FileTreeNode) {
		try {
			const content = await readTextFile(node.path);
			openPreviewTab(node.path, content);
		} catch {
			// File not accessible — silently ignore
		}
	}

	async function openFile(node: FileTreeNode) {
		try {
			const content = await readTextFile(node.path);
			openOrFocusTab(node.path, content);
		} catch {
			// File not accessible — silently ignore
		}
	}

	// Image / PDF files open in a standalone viewer dialog rather than a tab.
	let mediaViewerOpen = $state(false);
	let mediaViewerPath = $state<string | null>(null);

	function openMedia(node: FileTreeNode) {
		mediaViewerPath = node.path;
		mediaViewerOpen = true;
	}

	function hasAnySupportedFile(nodes: FileTreeNode[]): boolean {
		for (const node of nodes) {
			if (!node.isDirectory) return true;
			if (node.isLoaded && hasAnySupportedFile(node.children)) return true;
		}
		return false;
	}

	function togglePanel() {
		isOpen = !isOpen;
		// A fresh open always returns to the default anchored position and size,
		// discarding any spot/size from a previous (pinned) session.
		if (isOpen) {
			panelPos = null;
			panelSize = null;
		}
	}

	// Cmd+Shift+E / Ctrl+Shift+E toggles the File Explorer; Escape closes it.
	function handleWindowKeydown(e: KeyboardEvent) {
		// Note: on macOS WebKit, Cmd suppresses Shift in e.key, so Cmd+Shift+E
		// arrives as "e" rather than "E" — compare case-insensitively.
		if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "e") {
			e.preventDefault();
			togglePanel();
		}
		if (e.key === "Escape" && isOpen) {
			isOpen = false;
		}
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!-- File Explorer button — outside the editor content div on the left (LTR) or right (RTL), same vertical level as CollapsibleSidebar toggle -->
<button
	class="cursor-pointer absolute -left-5 top-1/3 z-3 {actionBtnStyle} {isOpen ? 'bg-brand-gold-400 dark:bg-[#363a4f]' : ''} {$zenMode ? ($zenPeek ? 'opacity-50 transition-opacity duration-200' : 'opacity-0 hover:opacity-100 transition-opacity duration-200') : ''}"
	onclick={togglePanel}
	aria-label="File Explorer"
	title="File Explorer"
>
	<Icon icon="solar:folder-with-files-bold-duotone" class="h-4 w-4" />
</button>

<!-- Backdrop — omitted while pinned so the panel stays open on outside clicks -->
{#if isOpen && !isPinned}
	<div role="presentation" class="fixed inset-0 z-10" onclick={() => (isOpen = false)} onkeydown={() => {}}></div>
{/if}

<!-- Floating panel — opens to the left (LTR) or right (RTL) of the editor, ~1/3 height -->
{#if isOpen}
	<div
		bind:this={panelEl}
		role="presentation"
		onpointerdown={focusPanel}
		transition:fly={{ x: isRtl ? 8 : -8, duration: 180, opacity: 0 }}
		class="{panelPos ? 'fixed' : 'absolute top-1/3 left-1.5 ml-2'} rounded-3xl {panelSize ? '' : 'w-60 max-h-[33vh]'} bg-white dark:bg-[#292c3c]
		       border border-stone-200 dark:border-[#414559]
		       shadow-xl shadow-black/15 dark:shadow-black/40
		       flex flex-col overflow-hidden"
		style="z-index:{zIndex};{panelPos ? ` left:${panelPos.x}px; top:${panelPos.y}px;` : ''}{panelSize ? ` width:${panelSize.w}px; height:${panelSize.h}px;` : ''}"
	>
		<!-- Panel header — doubles as the drag handle while pinned -->
		<div
			role="presentation"
			onpointerdown={startDrag}
			class="shrink-0 px-3 py-2 border-b border-stone-200 dark:border-[#414559]
			       bg-brand-sand-50 dark:bg-[#232634] flex items-center justify-between gap-2 select-none {isPinned ? 'cursor-move' : ''}"
		>
			<div class="flex items-center gap-2 flex-1 min-w-0">
				{#if $openFolderPath}
					<span
						class="text-[10px] font-semibold uppercase tracking-wide
						       text-brand-charcoal-300 dark:text-[#838ba7] truncate flex-1"
						title={$openFolderPath}
					>
						{folderName}
					</span>
					<button
						onclick={openFolder}
						class="cursor-pointer shrink-0 text-[10px] font-semibold text-brand-charcoal-300
						       dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890]
						       transition-colors"
					>
						{$t('explorer.change')}
					</button>
				{:else}
					<button
						onclick={openFolder}
						class="cursor-pointer w-full px-3 py-1 text-[11px] font-semibold rounded-full
						       border border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200
						       dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559]
						       text-brand-charcoal-500 dark:text-[#c6d0f5] transition-colors
						       flex items-center justify-center gap-1.5"
					>
						<Icon icon="solar:folder-with-files-bold-duotone" width="0.85rem" />
						{$t('explorer.open_folder')}
					</button>
				{/if}
			</div>
			<button
				onclick={() => (isPinned = !isPinned)}
				class="cursor-pointer shrink-0 rounded-full p-1 transition-colors {isPinned
					? 'text-brand-gold-500 dark:text-[#e5c890] bg-brand-gold-100 dark:bg-[#363a4f]'
					: 'text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890]'}"
				title={isPinned ? 'Unpin panel' : 'Pin panel'}
				aria-label={isPinned ? 'Unpin panel' : 'Pin panel'}
			>
				<Icon icon="solar:pin-bold-duotone" width="0.85rem" />
			</button>
		</div>

		<!-- Root-level error banner with Back / Retry actions -->
		{#if loadError}
			<div class="shrink-0 px-3 py-1.5 border-b border-red-200 dark:border-red-800/40
			            bg-red-50 dark:bg-red-900/20 flex items-center gap-2">
				<Icon icon="solar:lock-bold-duotone" width="0.75rem" class="shrink-0 text-red-400" />
				<span class="text-[10px] text-red-500 dark:text-red-400 flex-1 truncate">
					{$t('explorer.cannot_read')}
				</span>
				<button
					onclick={() => { loadError = ''; openFolderPath.set(null); }}
					class="cursor-pointer shrink-0 text-[10px] font-semibold text-brand-charcoal-400
					       dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890]
					       transition-colors"
					title="Clear folder and go back"
				>
					{$t('explorer.back')}
				</button>
				<button
					onclick={() => $openFolderPath && loadRoot($openFolderPath)}
					class="cursor-pointer shrink-0 text-[10px] font-semibold text-brand-charcoal-400
					       dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890]
					       transition-colors"
					title="Retry loading folder"
				>
					{$t('explorer.retry')}
				</button>
			</div>
		{/if}

		<!-- Tree body -->
		<div class="flex-1 min-h-0 overflow-y-auto py-1 px-1">
			{#if isLoadingRoot}
				<p class="text-[10px] italic text-brand-charcoal-300 dark:text-[#838ba7] px-2 py-2">
					{$t('explorer.loading')}
				</p>
			{:else if !$openFolderPath}
				<p class="text-[11px] text-center italic text-brand-charcoal-300 dark:text-[#838ba7] px-2 py-2">
					{$t('explorer.no_folder')}
				</p>
			{:else if !loadError && rootNodes.length === 0}
				<p class="text-[10px] italic text-brand-charcoal-300 dark:text-[#838ba7] px-2 py-2">
					{$t('explorer.no_files')}
				</p>
			{:else if !loadError}
				{@render treeNodes(rootNodes, 0)}
			{/if}
		</div>

		<!-- Resize handles — only while pinned so the panel can be sized to taste -->
		{#if isPinned}
			{#each resizeHandles as { cls, dir }}
				<div
					aria-hidden="true"
					class="resize-handle {cls}"
					onpointerdown={(e) => startResize(e, dir)}
				></div>
			{/each}
		{/if}
	</div>
{/if}

<!-- Image / PDF viewer — independent of the explorer panel's open state -->
<MediaViewerDialog
	open={mediaViewerOpen}
	path={mediaViewerPath}
	onClose={() => (mediaViewerOpen = false)}
/>

{#snippet treeNodes(nodes: FileTreeNode[], depth: number)}
	{#each nodes as node}
		{#if node.isDirectory}
			<button
				onclick={() => toggleDirectory(node)}
				class="cursor-pointer flex w-full items-center gap-1 py-0.5 text-[13px]
				       text-brand-charcoal-500 dark:text-[#c6d0f5]
				       hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]
				       rounded-full transition-colors font-mono text-left"
				style="padding-left: {0.5 + depth * 0.75}rem; padding-right: 0.5rem"
			>
				{#if node.isLoading}
					<Icon
						icon="solar:refresh-bold"
						width="0.65rem"
						class="shrink-0 animate-spin text-brand-charcoal-300 dark:text-[#626880]"
					/>
				{:else if node.isForbidden}
					<Icon
						icon="solar:lock-bold-duotone"
						width="0.65rem"
						class="shrink-0 text-red-400 dark:text-red-500"
					/>
				{:else}
					<Icon
						icon={node.isExpanded
							? 'solar:alt-arrow-down-bold-duotone'
							: 'solar:alt-arrow-right-bold-duotone'}
						width="0.65rem"
						class="shrink-0 text-brand-charcoal-300 dark:text-[#626880]"
					/>
				{/if}
				<Icon
					icon={node.isExpanded ? 'solar:folder-open-bold-duotone' : 'solar:folder-bold-duotone'}
					width="0.8rem"
					class="shrink-0 {node.isForbidden
						? 'text-brand-charcoal-200 dark:text-[#414559]'
						: 'text-brand-gold-500 dark:text-[#e5c890]'}"
				/>
				<span class="truncate {node.isForbidden ? 'opacity-50' : ''}" title={node.name}>{node.name}</span>
			</button>
			{#if node.isExpanded && node.isLoaded}
				{#if node.children.length === 0}
					<p
						class="text-[10px] italic text-brand-charcoal-300 dark:text-[#838ba7]"
						style="padding-left: {0.5 + (depth + 1) * 0.75}rem"
					>
						{$t('explorer.empty')}
					</p>
				{:else}
					{@render treeNodes(node.children, depth + 1)}
				{/if}
			{/if}
		{:else if isImageFile(node.name) || isPdfFile(node.name)}
			<button
				ondblclick={() => openMedia(node)}
				class="cursor-pointer flex w-full items-center gap-1 py-0.5 text-[13px]
				       text-brand-charcoal-500 dark:text-[#c6d0f5]
				       hover:text-brand-gold-500 dark:hover:text-[#e5c890]
				       hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]
				       rounded-full transition-colors font-mono text-left"
				style="padding-left: {0.5 + depth * 0.75}rem; padding-right: 0.5rem"
				title={node.name}
			>
				<Icon
					icon={isPdfFile(node.name)
						? 'solar:file-text-bold-duotone'
						: 'solar:gallery-bold-duotone'}
					width="0.8rem"
					class="shrink-0 text-brand-gold-500 dark:text-[#e5c890]"
				/>
				<span class="truncate" title={node.name}>{node.name}</span>
			</button>
		{:else if isFlatFile(node.name)}
			<button
				onclick={() => previewFile(node)}
				ondblclick={() => openFile(node)}
				class="cursor-pointer flex w-full items-center gap-1 py-0.5 text-[13px]
				       text-brand-charcoal-500 dark:text-[#c6d0f5]
				       hover:text-brand-gold-500 dark:hover:text-[#e5c890]
				       hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]
				       rounded-full transition-colors font-mono text-left"
				style="padding-left: {0.5 + depth * 0.75}rem; padding-right: 0.5rem"
				title={$t('explorer.file_hint')}
			>
				<Icon
					icon="solar:file-text-bold-duotone"
					width="0.8rem"
					class="shrink-0 text-brand-charcoal-300 dark:text-[#626880]"
				/>
				<span class="truncate" title={node.name}>{node.name}</span>
			</button>
		{/if}
	{/each}
{/snippet}

<style>
	.resize-handle { position: absolute; z-index: 10; }
	.resize-n { top: 0; left: 10px; right: 10px; height: 6px; cursor: n-resize; }
	.resize-s { bottom: 0; left: 10px; right: 10px; height: 6px; cursor: s-resize; }
	.resize-e { top: 10px; right: 0; bottom: 10px; width: 6px; cursor: e-resize; }
	.resize-w { top: 10px; left: 0; bottom: 10px; width: 6px; cursor: w-resize; }
	.resize-ne { top: 0; right: 0; width: 14px; height: 14px; cursor: ne-resize; }
	.resize-se { bottom: 0; right: 0; width: 20px; height: 20px; cursor: se-resize; }
	.resize-sw { bottom: 0; left: 0; width: 14px; height: 14px; cursor: sw-resize; }
	.resize-nw { top: 0; left: 0; width: 14px; height: 14px; cursor: nw-resize; }
	.resize-se::before {
		content: "";
		position: absolute;
		bottom: 11px;
		right: 11px;
		width: 5px;
		height: 5px;
		border-bottom: 1.5px solid rgba(130, 130, 130, 0.4);
		border-right: 1.5px solid rgba(130, 130, 130, 0.4);
		border-bottom-right-radius: 5px;
		pointer-events: none;
	}
	.resize-se::after {
		content: "";
		position: absolute;
		bottom: 7px;
		right: 7px;
		width: 9px;
		height: 9px;
		border-bottom: 1.5px solid rgba(130, 130, 130, 0.55);
		border-right: 1.5px solid rgba(130, 130, 130, 0.55);
		border-bottom-right-radius: 9px;
		pointer-events: none;
	}
</style>
