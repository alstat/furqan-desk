<script lang="ts">
	import { fly } from 'svelte/transition';
	import { open as openDialog } from '@tauri-apps/plugin-dialog';
	import { readDir, readTextFile } from '@tauri-apps/plugin-fs';
	import Icon from '@iconify/svelte';
	import { openFolderPath, openPreviewTab, openOrFocusTab, isFlatFile } from '$lib/stores/tabs.store';
	import { surahOrientation } from '$lib/stores/quran.svelte';

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

	$effect(() => {
		const folder = $openFolderPath;
		rootNodes = [];
		loadError = '';
		if (!folder) return;
		loadRoot(folder);
	});

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
			} else if (isFlatFile(entry.name)) {
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
		openFolderPath.set(result as string);
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

	function hasAnySupportedFile(nodes: FileTreeNode[]): boolean {
		for (const node of nodes) {
			if (!node.isDirectory) return true;
			if (node.isLoaded && hasAnySupportedFile(node.children)) return true;
		}
		return false;
	}
</script>

<!-- File Explorer button — outside the editor content div on the left (LTR) or right (RTL), same vertical level as CollapsibleSidebar toggle -->
<button
	class="cursor-pointer absolute -left-5 top-1/3 z-3 rounded-full bg-brand-gold-200 dark:bg-[#292c3c] p-2 shadow-md transition-colors text-brand-gold-600 dark:text-brand-gold-400 hover:bg-brand-gold-400 dark:hover:bg-[#363a4f] active:bg-brand-gold-500 dark:active:bg-[#414559] {isOpen ? 'bg-brand-gold-400 dark:bg-[#363a4f]' : ''}"
	onclick={() => (isOpen = !isOpen)}
	aria-label="File Explorer"
	title="File Explorer"
>
	<Icon icon="solar:folder-with-files-bold-duotone" class="h-4 w-4" />
</button>

<!-- Backdrop -->
{#if isOpen}
	<div class="fixed inset-0 z-10" onclick={() => (isOpen = false)}></div>
{/if}

<!-- Floating panel — opens to the left (LTR) or right (RTL) of the editor, ~1/3 height -->
{#if isOpen}
	<div
		transition:fly={{ x: isRtl ? 8 : -8, duration: 180, opacity: 0 }}
		class="absolute top-1/3 left-1.5 ml-2 z-20 rounded-lg w-60 max-h-[33vh] bg-white dark:bg-[#292c3c]
		       border border-stone-200 dark:border-[#414559]
		       shadow-xl shadow-slate-200/60 dark:shadow-black/40
		       flex flex-col overflow-hidden"
	>
		<!-- Panel header -->
		<div class="shrink-0 px-3 py-2 border-b border-stone-200 dark:border-[#414559]
		            bg-brand-sand-50 dark:bg-[#232634] flex items-center justify-between gap-2">
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
					Change
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
					Open Folder
				</button>
			{/if}
		</div>

		<!-- Root-level error banner with Back / Retry actions -->
		{#if loadError}
			<div class="shrink-0 px-3 py-1.5 border-b border-red-200 dark:border-red-800/40
			            bg-red-50 dark:bg-red-900/20 flex items-center gap-2">
				<Icon icon="solar:lock-bold-duotone" width="0.75rem" class="shrink-0 text-red-400" />
				<span class="text-[10px] text-red-500 dark:text-red-400 flex-1 truncate">
					Cannot read folder
				</span>
				<button
					onclick={() => { loadError = ''; openFolderPath.set(null); }}
					class="cursor-pointer shrink-0 text-[10px] font-semibold text-brand-charcoal-400
					       dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890]
					       transition-colors"
					title="Clear folder and go back"
				>
					Back
				</button>
				<button
					onclick={() => $openFolderPath && loadRoot($openFolderPath)}
					class="cursor-pointer shrink-0 text-[10px] font-semibold text-brand-charcoal-400
					       dark:text-[#838ba7] hover:text-brand-gold-500 dark:hover:text-[#e5c890]
					       transition-colors"
					title="Retry loading folder"
				>
					Retry
				</button>
			</div>
		{/if}

		<!-- Tree body -->
		<div class="flex-1 min-h-0 overflow-y-auto py-1 px-1">
			{#if isLoadingRoot}
				<p class="text-[10px] italic text-brand-charcoal-300 dark:text-[#838ba7] px-2 py-2">
					Loading…
				</p>
			{:else if !$openFolderPath}
				<p class="text-[10px] italic text-brand-charcoal-300 dark:text-[#838ba7] px-2 py-2">
					No folder open
				</p>
			{:else if !loadError && rootNodes.length === 0}
				<p class="text-[10px] italic text-brand-charcoal-300 dark:text-[#838ba7] px-2 py-2">
					No files or folders found
				</p>
			{:else if !loadError}
				{@render treeNodes(rootNodes, 0)}
			{/if}
		</div>
	</div>
{/if}

{#snippet treeNodes(nodes: FileTreeNode[], depth: number)}
	{#each nodes as node}
		{#if node.isDirectory}
			<button
				onclick={() => toggleDirectory(node)}
				class="cursor-pointer flex w-full items-center gap-1 py-0.5 text-[11px]
				       text-brand-charcoal-500 dark:text-[#c6d0f5]
				       hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]
				       rounded transition-colors font-mono text-left"
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
				<span class="truncate {node.isForbidden ? 'opacity-50' : ''}">{node.name}</span>
			</button>
			{#if node.isExpanded && node.isLoaded}
				{#if node.children.length === 0}
					<p
						class="text-[10px] italic text-brand-charcoal-300 dark:text-[#838ba7]"
						style="padding-left: {0.5 + (depth + 1) * 0.75}rem"
					>
						Empty
					</p>
				{:else}
					{@render treeNodes(node.children, depth + 1)}
				{/if}
			{/if}
		{:else if isFlatFile(node.name)}
			<button
				onclick={() => previewFile(node)}
				ondblclick={() => openFile(node)}
				class="cursor-pointer flex w-full items-center gap-1 py-0.5 text-[11px]
				       text-brand-charcoal-500 dark:text-[#c6d0f5]
				       hover:text-brand-gold-500 dark:hover:text-[#e5c890]
				       hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]
				       rounded transition-colors font-mono text-left"
				style="padding-left: {0.5 + depth * 0.75}rem; padding-right: 0.5rem"
				title="Click to preview · Double-click to open"
			>
				<Icon
					icon="solar:file-text-bold-duotone"
					width="0.8rem"
					class="shrink-0 text-brand-charcoal-300 dark:text-[#626880]"
				/>
				<span class="truncate">{node.name}</span>
			</button>
		{/if}
	{/each}
{/snippet}
