<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import Icon from '@iconify/svelte';
	import ControlCard from '../cards/ControlCard.svelte';
	import GroupCards from '../cards/GroupCards.svelte';
	import { typstRecompile } from '$lib/stores/editor.store';
	import { openOrFocusTab, openPreviewTab, createTab, tabs, activeTabId, openFolderPath, isFlatFile } from '$lib/stores/tabs.store';
	import { readDir, readTextFile } from '@tauri-apps/plugin-fs';

	// ── ilm package state ──────────────────────────────────────────────────────
	const ILM_NS      = 'preview';
	const ILM_NAME    = 'ilm';
	const ILM_VERSION = '1.4.2';

	type InstallStatus = 'unknown' | 'installed' | 'installing' | 'error';

	let installStatus: InstallStatus = $state('unknown');
	let installError  = $state('');

	// ── create new tab ─────────────────────────────────────────────────────────
	let showNewOptions = $state(false);

	function createNew(type: 'lexical' | 'typst') {
		const tab = createTab(type);
		tabs.update(ts => [...ts, tab]);
		activeTabId.set(tab.id);
		showNewOptions = false;
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

	onMount(async () => {
		const installed = await invoke<boolean>('check_typst_package', {
			namespace: ILM_NS,
			name:      ILM_NAME,
			version:   ILM_VERSION,
		});
		installStatus = installed ? 'installed' : 'error';
		if (installed) installError = '';
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
			<span class={labelClass}>Packages</span>
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
