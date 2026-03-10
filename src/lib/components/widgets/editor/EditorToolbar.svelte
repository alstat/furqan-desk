<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import { listen } from '@tauri-apps/api/event';
	import { open as openDialog } from '@tauri-apps/plugin-dialog';
	import Icon from '@iconify/svelte';
	import ControlCard from '../cards/ControlCard.svelte';
	import GroupCards from '../cards/GroupCards.svelte';
	import { typstRecompile, editorTheme, type EditorTheme } from '$lib/stores/editor.store';
	import { openOrFocusTab, openPreviewTab, createTab, tabs, activeTabId, openFolderPath, isFlatFile } from '$lib/stores/tabs.store';
	import { isSidebar, surahOrientation } from '$lib/stores/quran.svelte';
	import { rotateSpring } from '$lib/stores/animation';
	import { readDir, readTextFile } from '@tauri-apps/plugin-fs';

	// ── ilm package state ──────────────────────────────────────────────────────
	const ILM_NS      = 'preview';
	const ILM_NAME    = 'ilm';
	const ILM_VERSION = '1.4.2';

	type InstallStatus = 'unknown' | 'installed' | 'installing' | 'error';

	let installStatus: InstallStatus = $state('unknown');
	let installError  = $state('');

	// ── Julia install state ────────────────────────────────────────────────────
	let juliaStatus: InstallStatus = $state('unknown');
	let juliaError = $state('');
	let juliaCustomPath = $state('');   // text in the manual-path input
	let juliaPathError  = $state('');   // validation error for the manual path

	// ── create new tab ─────────────────────────────────────────────────────────
	let showNewOptions = $state(false);

	function createNew(type: 'lexical' | 'typst' | 'julia') {
		const tab = createTab(type);
		tabs.update(ts => [...ts, tab]);
		activeTabId.set(tab.id);
		showNewOptions = false;

		// Auto-open the sidebar if it is currently collapsed
		if (!$isSidebar) {
			$isSidebar = true;
			rotateSpring.set($surahOrientation() === 'flex-row-reverse' ? 180 : 0);
		}
	}

	// ── file browser state ─────────────────────────────────────────────────────
	let dirFiles = $state<string[]>([]);

	$effect(() => {
		const folder = $openFolderPath;
		if (!folder) { dirFiles = []; return; }
		readDir(folder)
			.then(entries => {
				dirFiles = entries
					.filter(e => !e.isDirectory && e.name && isFlatFile(e.name))
					.map(e => e.name!)
					.sort();
			})
			.catch(() => { dirFiles = []; });
	});

	// Single-click: preview (italic tab, replaced by next single-click)
	async function previewFile(filename: string) {
		if (!$openFolderPath) return;
		const path = `${$openFolderPath}/${filename}`;
		const content = await readTextFile(path);
		openPreviewTab(path, content);
	}

	// Double-click: open permanently
	async function openFile(filename: string) {
		if (!$openFolderPath) return;
		const path = `${$openFolderPath}/${filename}`;
		const content = await readTextFile(path);
		openOrFocusTab(path, content);
	}

	async function installJulia() {
		juliaStatus = 'installing';
		juliaError  = '';
		try {
			await invoke('install_julia');
			// Re-check after install (juliaup may have added julia to PATH)
			const r = await invoke<string>('check_julia');
			juliaStatus = r === 'installed' ? 'installed' : 'error';
			if (juliaStatus === 'error') juliaError = 'Install finished but Julia binary still not found. Try setting the path manually.';
		} catch (e) {
			juliaStatus = 'error';
			juliaError  = String(e);
		}
	}

	async function browseJuliaPath() {
		const result = await openDialog({
			title: 'Select Julia binary',
			multiple: false,
			// On Windows the executable has an .exe extension; on unix no extension
			filters: [{ name: 'Executable', extensions: ['exe', '*'] }],
		});
		if (!result || Array.isArray(result)) return;
		juliaCustomPath = result as string;
	}

	async function applyJuliaPath() {
		juliaPathError = '';
		try {
			const r = await invoke<string>('set_julia_path', { path: juliaCustomPath });
			juliaStatus = r === 'installed' ? 'installed' : 'error';
		} catch (e) {
			juliaPathError = String(e);
		}
	}

	onMount(async () => {
		const installed = await invoke<boolean>('check_typst_package', {
			namespace: ILM_NS,
			name:      ILM_NAME,
			version:   ILM_VERSION,
		});
		installStatus = installed ? 'installed' : 'error';
		if (installed) installError = '';

		// Load any persisted custom Julia path, then check
		juliaCustomPath = await invoke<string>('get_julia_path');
		const juliaResult = await invoke<string>('check_julia');
		juliaStatus = juliaResult === 'installed' ? 'installed' : 'error';

		// Listen for Julia install progress events
		listen<{ message: string }>('julia-install-progress', (event) => {
			juliaError = event.payload.message;
		});
	});

	async function installIlm() {
		installStatus = 'installing';
		installError  = '';
		try {
			await invoke('install_typst_package', {
				namespace: ILM_NS,
				name:      ILM_NAME,
				version:   ILM_VERSION,
			});
			installStatus = 'installed';
			typstRecompile.update((n: number) => n + 1);
		} catch (e) {
			installStatus = 'error';
			installError  = String(e);
		}
	}

	const labelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300';
</script>

{#snippet cardBody()}
	<div class="flex flex-col gap-3.5 px-4 py-3">

		<!-- Editor Theme -->
		<div>
			<span class={labelClass}>Editor Theme</span>
			<div class="flex gap-2 mt-1.5">
				<button
					onclick={() => editorTheme.set('ayu-light')}
					class={`cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors
						${$editorTheme === 'ayu-light'
							? 'bg-brand-gold-400 text-white border-brand-gold-400'
							: 'border-brand-sand-300 bg-brand-sand-100 hover:bg-brand-sand-200 text-brand-charcoal-500'}`}
				>
					Ayu Light
				</button>
				<button
					onclick={() => editorTheme.set('ayu-mirage')}
					class={`cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors
						${$editorTheme === 'ayu-mirage'
							? 'bg-[#1f2430] text-[#ffa759] border-[#ffa759]'
							: 'border-brand-sand-300 bg-brand-sand-100 hover:bg-brand-sand-200 text-brand-charcoal-500'}`}
				>
					Ayu Mirage
				</button>
			</div>
		</div>

		<!-- Divider -->
		<div class="border-t border-brand-sand-200"></div>

		<!-- Create new file -->
		<div>
			<span class={labelClass}>New File</span>
			{#if showNewOptions}
				<div class="flex gap-2 mt-1.5">
					<button
						onclick={() => createNew('lexical')}
						class="cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full
							   border border-brand-sand-300 bg-brand-sand-100 hover:bg-brand-sand-200
							   text-brand-charcoal-500 transition-colors"
					>
						Lexical
					</button>
					<button
						onclick={() => createNew('typst')}
						class="cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full
							   bg-brand-gold-400 hover:bg-brand-gold-500 text-white transition-colors"
					>
						Typst
					</button>
					{#if juliaStatus === 'installed'}
					<button
						onclick={() => createNew('julia')}
						class="cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full
							   bg-violet-500 hover:bg-violet-600 text-white transition-colors"
					>
						Julia
					</button>
					{/if}
				</div>
			{:else}
				<button
					onclick={() => (showNewOptions = true)}
					class="cursor-pointer mt-1.5 w-full px-3 py-1 text-[11px] font-semibold rounded-full
						   border border-brand-sand-300 bg-brand-sand-100 hover:bg-brand-sand-200
						   text-brand-charcoal-500 transition-colors flex items-center justify-center gap-1.5"
				>
					<Icon icon="solar:add-circle-bold-duotone" width="0.85rem" />
					Create New
				</button>
			{/if}
		</div>

		<!-- Divider -->
		<div class="border-t border-brand-sand-200"></div>

		<!-- ilm package installer -->
		<div>
			<span class={labelClass}>Typst Packages</span>
			<div class="flex items-center justify-between gap-2">
				<span class="text-xs text-brand-charcoal-500 font-mono">ilm {ILM_VERSION}</span>

				{#if installStatus === 'unknown'}
					<span class="text-xs text-brand-charcoal-300 italic">Checking…</span>

				{:else if installStatus === 'installed'}
					<span class="flex items-center gap-1 text-xs font-medium text-green-600">
						<Icon icon="solar:check-circle-bold" width="0.9rem" />
						Installed
					</span>

				{:else if installStatus === 'installing'}
					<span class="flex items-center gap-1 text-xs text-brand-charcoal-400 italic">
						<Icon icon="solar:refresh-bold" width="0.9rem" class="animate-spin" />
						Installing…
					</span>

				{:else}
					<!-- not installed or previous error -->
					<button
						onclick={installIlm}
						class="cursor-pointer px-2.5 py-0.5 text-[11px] font-semibold rounded-full
							   bg-brand-gold-400 text-white hover:bg-brand-gold-500 transition-colors"
					>
						Install
					</button>
				{/if}
			</div>

			{#if installError && installStatus === 'error'}
				<p class="mt-1 text-[10px] text-red-500 leading-snug break-all" title={installError}>
					{installError.slice(0, 120)}{installError.length > 120 ? '…' : ''}
				</p>
			{/if}
		</div>

		<!-- Divider -->
		<div class="border-t border-brand-sand-200"></div>

		<!-- Julia installer -->
		<div>
			<span class={labelClass}>Julia</span>

			{#if juliaStatus === 'unknown'}
				<span class="text-xs text-brand-charcoal-300 italic">Checking…</span>

			{:else if juliaStatus === 'installed'}
				<span class="flex items-center gap-1 text-xs font-medium text-green-600">
					<Icon icon="solar:check-circle-bold" width="0.9rem" />
					Installed
					{#if juliaCustomPath}
						<span class="text-brand-charcoal-300 font-mono truncate max-w-[8rem]" title={juliaCustomPath}>({juliaCustomPath.split(/[\\/]/).pop()})</span>
					{/if}
				</span>

			{:else if juliaStatus === 'installing'}
				<span class="flex flex-col gap-0.5 text-xs text-brand-charcoal-400">
					<span class="flex items-center gap-1 italic">
						<Icon icon="solar:refresh-bold" width="0.9rem" class="animate-spin" />
						Installing…
					</span>
					{#if juliaError}
						<span class="text-[10px] text-brand-charcoal-300 italic break-all">{juliaError}</span>
					{/if}
				</span>

			{:else}
				<!-- Not found — offer auto-install AND manual path -->
				<div class="flex flex-col gap-2 mt-0.5">

					<!-- Auto-install row -->
					<div class="flex items-center justify-between gap-2">
						<span class="text-xs text-brand-charcoal-400">Auto-install</span>
						<button
							onclick={installJulia}
							class="cursor-pointer px-2.5 py-0.5 text-[11px] font-semibold rounded-full
								   bg-violet-500 text-white hover:bg-violet-600 transition-colors"
						>
							Install
						</button>
					</div>

					<!-- Manual path row -->
					<div class="flex flex-col gap-1">
						<span class="text-xs text-brand-charcoal-400">Or set path manually</span>
						<div class="flex items-center gap-1">
							<input
								bind:value={juliaCustomPath}
								placeholder="/usr/local/bin/julia"
								class="flex-1 min-w-0 px-1.5 py-0.5 text-[10px] font-mono rounded border border-brand-sand-300
									   bg-brand-sand-50 text-brand-charcoal-600 focus:outline-none focus:ring-1
									   focus:ring-violet-300 focus:border-violet-400"
								spellcheck="false"
							/>
							<button
								onclick={browseJuliaPath}
								title="Browse for julia binary"
								class="cursor-pointer shrink-0 p-1 rounded border border-brand-sand-300
									   bg-brand-sand-100 hover:bg-brand-sand-200 text-brand-charcoal-500
									   transition-colors"
							>
								<Icon icon="solar:folder-open-bold-duotone" width="0.85rem" />
							</button>
							<button
								onclick={applyJuliaPath}
								title="Apply this path"
								class="cursor-pointer shrink-0 px-2 py-0.5 text-[11px] font-semibold rounded-full
									   bg-violet-500 text-white hover:bg-violet-600 transition-colors"
							>
								Use
							</button>
						</div>
						{#if juliaPathError}
							<p class="text-[10px] text-red-500 leading-snug break-all">{juliaPathError}</p>
						{/if}
					</div>

				</div>

				{#if juliaError}
					<p class="mt-1 text-[10px] text-red-500 leading-snug break-all" title={juliaError}>
						{juliaError.slice(0, 160)}{juliaError.length > 160 ? '…' : ''}
					</p>
				{/if}
			{/if}
		</div>

		{#if $openFolderPath}
			<!-- Divider -->
			<div class="border-t border-brand-sand-200"></div>

			<!-- File Browser -->
			<div>
				<span class={labelClass}>Files</span>
				<p class="text-[9px] text-brand-charcoal-300 mb-1 truncate" title={$openFolderPath}>
					{$openFolderPath.split('/').pop()}
				</p>
				<div class="max-h-64 min-h-0 overflow-y-auto pr-1">
					{#each dirFiles as file}
						<button
							onclick={() => previewFile(file)}
							ondblclick={() => openFile(file)}
							class="block w-full text-left text-[11px] text-brand-charcoal-500 hover:text-brand-gold-500
							       px-1 py-1 rounded truncate font-mono transition-colors"
							title="Click to preview · Double-click to open"
						>{file}</button>
					{/each}
					{#if dirFiles.length === 0}
						<p class="text-[10px] text-brand-charcoal-300 italic">No files</p>
					{/if}
				</div>
			</div>
		{/if}

	</div>
{/snippet}

{#snippet collapsedIcon()}
	<Icon icon="solar:menu-dots-line-duotone" width="2em" />
{/snippet}

{#snippet controlCard()}
	<ControlCard cardTitle={'Editor Controls'} {cardBody} />
{/snippet}

<GroupCards {controlCard} {collapsedIcon} xPosition={'left'} />
