<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import Icon from '@iconify/svelte';
	import ControlCard from '../cards/ControlCard.svelte';
	import GroupCards from '../cards/GroupCards.svelte';
	import { typstRecompile } from '$lib/stores/editor.store';
	import { activeTab, openOrFocusTab, createTab, tabs, activeTabId } from '$lib/stores/tabs.store';
	import { readDir, readTextFile } from '@tauri-apps/plugin-fs';

	// ── ilm package state ──────────────────────────────────────────────────────
	const ILM_NS      = 'preview';
	const ILM_NAME    = 'ilm';
	const ILM_VERSION = '1.4.2';

	type InstallStatus = 'unknown' | 'installed' | 'installing' | 'error';

	let installStatus: InstallStatus = $state('unknown');
	let installError  = $state('');

	// ── typst fonts state ──────────────────────────────────────────────────────
	let fontsStatus: InstallStatus = $state('unknown');
	let fontsError  = $state('');

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
	const currentDir = $derived(
		$activeTab?.path
			? $activeTab.path.substring(0, $activeTab.path.lastIndexOf('/'))
			: null
	);

	$effect(() => {
		if (!currentDir) {
			dirFiles = [];
			return;
		}
		readDir(currentDir)
			.then(entries => {
				dirFiles = entries
					.filter(e => !e.isDirectory && e.name)
					.map(e => e.name!)
					.sort();
			})
			.catch(() => {
				dirFiles = [];
			});
	});

	async function openDirFile(filename: string) {
		if (!currentDir) return;
		const path = `${currentDir}/${filename}`;
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

		const fontsInstalled = await invoke<boolean>('check_typst_fonts');
		fontsStatus = fontsInstalled ? 'installed' : 'error';
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

	async function installFonts() {
		fontsStatus = 'installing';
		fontsError  = '';
		try {
			await invoke('install_typst_fonts');
			fontsStatus = 'installed';
			typstRecompile.update((n: number) => n + 1);
		} catch (e) {
			fontsStatus = 'error';
			fontsError  = String(e);
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
							   text-brand-charcoal-600 transition-colors"
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
						   text-brand-charcoal-600 transition-colors flex items-center justify-center gap-1.5"
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
				<span class="text-xs text-brand-charcoal-600 font-mono">ilm {ILM_VERSION}</span>

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

		<!-- Typst fonts installer -->
		<div>
			<span class={labelClass}>Typst Fonts</span>
			<div class="flex items-center justify-between gap-2">
				<span class="text-xs text-brand-charcoal-600 font-mono">New Computer Modern</span>

				{#if fontsStatus === 'unknown'}
					<span class="text-xs text-brand-charcoal-300 italic">Checking…</span>

				{:else if fontsStatus === 'installed'}
					<span class="flex items-center gap-1 text-xs font-medium text-green-600">
						<Icon icon="solar:check-circle-bold" width="0.9rem" />
						Installed
					</span>

				{:else if fontsStatus === 'installing'}
					<span class="flex items-center gap-1 text-xs text-brand-charcoal-400 italic">
						<Icon icon="solar:refresh-bold" width="0.9rem" class="animate-spin" />
						Installing…
					</span>

				{:else}
					<button
						onclick={installFonts}
						class="cursor-pointer px-2.5 py-0.5 text-[11px] font-semibold rounded-full
							   bg-brand-gold-400 text-white hover:bg-brand-gold-500 transition-colors"
					>
						Install
					</button>
				{/if}
			</div>

			{#if fontsError && fontsStatus === 'error'}
				<p class="mt-1 text-[10px] text-red-500 leading-snug break-all" title={fontsError}>
					{fontsError.slice(0, 120)}{fontsError.length > 120 ? '…' : ''}
				</p>
			{/if}
		</div>

		{#if currentDir}
			<!-- Divider -->
			<div class="border-t border-brand-sand-200"></div>

			<!-- File Browser -->
			<div>
				<span class={labelClass}>Files</span>
				<div class="max-h-40 overflow-y-auto flex flex-col gap-0.5 mt-1">
					{#each dirFiles as file}
						<button
							onclick={() => openDirFile(file)}
							class="text-left text-[11px] text-brand-charcoal-600 hover:text-brand-gold-500
							       px-1 py-0.5 rounded truncate font-mono transition-colors"
							title={file}
						>{file}</button>
					{/each}
					{#if dirFiles.length === 0}
						<p class="text-[10px] text-brand-charcoal-300 italic">No files in directory</p>
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
