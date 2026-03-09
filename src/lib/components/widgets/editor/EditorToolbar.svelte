<script lang="ts">
	import { onMount } from 'svelte';
	import { invoke } from '@tauri-apps/api/core';
	import Icon from '@iconify/svelte';
	import ControlCard from '../cards/ControlCard.svelte';
	import GroupCards from '../cards/GroupCards.svelte';
	import { typstMode, typstRecompile } from '$lib/stores/editor.store';

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

		<!-- Typst editor toggle -->
		<div class="flex items-center justify-between">
			<span class={labelClass}>Typst Editor</span>
			<button
				role="switch"
				aria-checked={$typstMode}
				aria-label="Toggle Typst editor"
				onclick={() => typstMode.update(v => !v)}
				class="cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full transition-colors
					   {$typstMode ? 'bg-brand-gold-400' : 'bg-brand-charcoal-100'}"
			>
				<span class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform
							 {$typstMode ? 'translate-x-4' : 'translate-x-1'}"></span>
			</button>
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

	</div>
{/snippet}

{#snippet collapsedIcon()}
	<Icon icon="solar:menu-dots-line-duotone" width="2em" />
{/snippet}

{#snippet controlCard()}
	<ControlCard cardTitle={'Editor Controls'} {cardBody} />
{/snippet}

<GroupCards {controlCard} {collapsedIcon} xPosition={'left'} />
