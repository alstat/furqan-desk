<script lang="ts">
	import Icon from '@iconify/svelte';
	import { customFontFamilies } from '$lib/stores/editor.store';
	import type { DrawTool, StyleDefaults, Shape } from './drawingScene.js';

	interface Props {
		tool: DrawTool;
		style: StyleDefaults;
		selected: Shape | null;
		setTool: (t: DrawTool) => void;
		setStyle: (patch: Partial<StyleDefaults>) => void;
		bringFront: () => void;
		bringForward: () => void;
		sendBackward: () => void;
		sendBack: () => void;
		duplicate: () => void;
		remove: () => void;
		group: () => void;
		ungroup: () => void;
		canGroup: boolean;
		hasGroup: boolean;
		addImage: () => void;
	}

	let {
		tool,
		style,
		selected,
		setTool,
		setStyle,
		bringFront,
		bringForward,
		sendBackward,
		sendBack,
		duplicate,
		remove,
		group,
		ungroup,
		canGroup,
		hasGroup,
		addImage
	}: Props = $props();

	const tools: Array<{ id: DrawTool; icon: string; label: string }> = [
		{ id: 'select', icon: 'ph:cursor-bold', label: 'Select / move' },
		{ id: 'pan', icon: 'mdi:hand-back-right-outline', label: 'Pan (or drag empty space / hold Space)' },
		{ id: 'rect', icon: 'mdi:rectangle-outline', label: 'Rectangle' },
		{ id: 'roundRect', icon: 'mdi:rounded-corner', label: 'Rounded rectangle' },
		{ id: 'ellipse', icon: 'mdi:ellipse-outline', label: 'Ellipse' },
		{ id: 'line', icon: 'mdi:vector-line', label: 'Line' },
		{ id: 'arrow', icon: 'mdi:arrow-top-right', label: 'Arrow' },
		{ id: 'triangle', icon: 'mdi:triangle-outline', label: 'Triangle' },
		{ id: 'diamond', icon: 'mdi:rhombus-outline', label: 'Diamond' },
		{ id: 'pentagon', icon: 'mdi:pentagon-outline', label: 'Pentagon' },
		{ id: 'hexagon', icon: 'mdi:hexagon-outline', label: 'Hexagon' },
		{ id: 'star', icon: 'mdi:star-outline', label: 'Star' },
		{ id: 'callout', icon: 'material-symbols:chat-bubble-outline', label: 'Callout' },
		{ id: 'pen', icon: 'mdi:draw', label: 'Freehand pen' },
		{ id: 'text', icon: 'mdi:format-text', label: 'Text box' }
	];

	const dashOptions: Array<{ id: StyleDefaults['strokeDash']; label: string }> = [
		{ id: 'solid', label: 'Solid' },
		{ id: 'dash', label: 'Dashed' },
		{ id: 'dot', label: 'Dotted' }
	];

	// Reflect the selected shape's props in the controls when there is a selection.
	let fillVal = $derived(selected && 'fill' in selected ? selected.fill : style.fill);
	let strokeVal = $derived(selected ? selected.stroke : style.stroke);
	let strokeWidthVal = $derived(selected ? selected.strokeWidth : style.strokeWidth);
	let dashVal = $derived(selected ? selected.strokeDash : style.strokeDash);
	let fillNone = $derived(fillVal === 'none');

	// Text properties — shown when the text tool is active or a text box selected.
	let isTextSel = $derived(selected?.type === 'text');
	let showText = $derived(tool === 'text' || isTextSel);
	let fontFamilyVal = $derived(
		selected?.type === 'text' ? selected.fontFamily : style.fontFamily
	);
	let fontSizeVal = $derived(selected?.type === 'text' ? selected.fontSize : style.fontSize);
	let boldVal = $derived(selected?.type === 'text' ? selected.bold : style.bold);
	let italicVal = $derived(selected?.type === 'text' ? selected.italic : style.italic);
	let alignVal = $derived(selected?.type === 'text' ? selected.align : style.align);

	// Same base font list as the rich-text toolbar, plus any custom fonts.
	const BASE_FONTS = [
		'Amiri Quran',
		'Aref Ruqaa Ink',
		'Arial',
		'Courier New',
		'EB Garamond',
		'Georgia',
		'Reem Kufi Ink',
		'Scheherazade New',
		'Times New Roman',
		'Trebuchet MS',
		'Verdana'
	];
	let fontOptions = $derived.by(() => {
		const seen = new Set(BASE_FONTS.map((f) => f.toLowerCase()));
		const merged = [...BASE_FONTS];
		for (const f of $customFontFamilies) {
			if (!seen.has(f.toLowerCase())) {
				seen.add(f.toLowerCase());
				merged.push(f);
			}
		}
		// Keep the current value selectable even if it is not in the list.
		const cur = (fontFamilyVal ?? '').split(',')[0].trim();
		if (cur && !seen.has(cur.toLowerCase())) merged.push(cur);
		return merged.sort((a, b) => a.localeCompare(b));
	});
	const FONT_SIZES = [8, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48, 60, 72, 96];
	let sizeOptions = $derived(
		FONT_SIZES.includes(Math.round(fontSizeVal))
			? FONT_SIZES
			: [...FONT_SIZES, Math.round(fontSizeVal)].sort((a, b) => a - b)
	);
	// The stored family may be a full stack ("EB Garamond, Georgia, serif");
	// match the dropdown on its first (primary) family.
	let fontFamilyPrimary = $derived((fontFamilyVal ?? '').split(',')[0].trim());

	const btn =
		'flex h-7 w-7 items-center justify-center rounded-md text-brand-charcoal-600 dark:text-[#c6d0f5] hover:bg-brand-sand-200 dark:hover:bg-[#414559] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';
	const activeBtn = 'bg-brand-gold-200 dark:bg-[#51576d] text-brand-gold-700 dark:text-[#e5c890]';
</script>

<div
	class="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#232634]"
>
	<!-- Tools -->
	<div class="flex flex-wrap items-center gap-0.5">
		{#each tools as t (t.id)}
			<button
				class="{btn} {tool === t.id ? activeBtn : ''}"
				title={t.label}
				aria-label={t.label}
				aria-pressed={tool === t.id}
				onclick={() => setTool(t.id)}
			>
				<Icon icon={t.icon} width="1.05rem" />
			</button>
		{/each}
		<button class={btn} title="Insert image" aria-label="Insert image" onclick={addImage}>
			<Icon icon="mdi:image-outline" width="1.05rem" />
		</button>
	</div>

	<div class="mx-1 h-5 w-px bg-brand-sand-200 dark:bg-[#414559]"></div>

	<!-- Fill -->
	<label class="flex items-center gap-1" title="Fill color">
		<span class="text-[10px] font-semibold uppercase text-brand-charcoal-300">Fill</span>
		<input
			type="color"
			class="h-6 w-6 cursor-pointer rounded border border-brand-sand-200 dark:border-[#414559] bg-transparent p-0"
			value={fillNone ? '#ffffff' : fillVal}
			oninput={(e) => setStyle({ fill: e.currentTarget.value })}
		/>
		<button
			class="{btn} {fillNone ? activeBtn : ''}"
			title="No fill"
			aria-label="No fill"
			onclick={() => setStyle({ fill: fillNone ? '#dbe6ff' : 'none' })}
		>
			<Icon icon="mdi:format-color-marker-cancel" width="1rem" />
		</button>
	</label>

	<!-- Outline -->
	<label class="flex items-center gap-1" title="Outline color">
		<span class="text-[10px] font-semibold uppercase text-brand-charcoal-300">Line</span>
		<input
			type="color"
			class="h-6 w-6 cursor-pointer rounded border border-brand-sand-200 dark:border-[#414559] bg-transparent p-0"
			value={strokeVal === 'none' ? '#000000' : strokeVal}
			oninput={(e) => setStyle({ stroke: e.currentTarget.value })}
		/>
	</label>

	<!-- Outline width -->
	<label class="flex items-center gap-1" title="Outline width">
		<Icon icon="mdi:format-line-weight" width="1rem" class="text-brand-charcoal-400" />
		<input
			type="range"
			min="0"
			max="24"
			step="1"
			value={strokeWidthVal}
			class="w-20 accent-brand-gold-500"
			oninput={(e) => setStyle({ strokeWidth: Number(e.currentTarget.value) })}
		/>
		<span class="w-4 text-[10px] text-brand-charcoal-400">{strokeWidthVal}</span>
	</label>

	<!-- Dash -->
	<select
		class="h-6 rounded-md border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-1 text-[11px] text-brand-charcoal-700 dark:text-[#c6d0f5]"
		title="Outline style"
		value={dashVal}
		onchange={(e) => setStyle({ strokeDash: e.currentTarget.value as StyleDefaults['strokeDash'] })}
	>
		{#each dashOptions as d (d.id)}
			<option value={d.id}>{d.label}</option>
		{/each}
	</select>

	<!-- Text properties (font family / size / weight / alignment) -->
	{#if showText}
		<div class="mx-1 h-5 w-px bg-brand-sand-200 dark:bg-[#414559]"></div>
		<select
			class="h-6 w-28 rounded-md border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-1 text-[11px] text-brand-charcoal-700 dark:text-[#c6d0f5]"
			title="Font"
			value={fontFamilyPrimary}
			onchange={(e) => setStyle({ fontFamily: e.currentTarget.value })}
		>
			{#each fontOptions as f (f)}
				<option value={f} style="font-family:{f};">{f}</option>
			{/each}
		</select>
		<select
			class="h-6 w-14 rounded-md border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-1 text-[11px] text-brand-charcoal-700 dark:text-[#c6d0f5]"
			title="Font size"
			value={Math.round(fontSizeVal)}
			onchange={(e) => setStyle({ fontSize: Number(e.currentTarget.value) })}
		>
			{#each sizeOptions as s (s)}
				<option value={s}>{s}</option>
			{/each}
		</select>
		<button
			class="{btn} {boldVal ? activeBtn : ''}"
			title="Bold"
			aria-label="Bold"
			aria-pressed={boldVal}
			onclick={() => setStyle({ bold: !boldVal })}
		>
			<Icon icon="mdi:format-bold" width="1.05rem" />
		</button>
		<button
			class="{btn} {italicVal ? activeBtn : ''}"
			title="Italic"
			aria-label="Italic"
			aria-pressed={italicVal}
			onclick={() => setStyle({ italic: !italicVal })}
		>
			<Icon icon="mdi:format-italic" width="1.05rem" />
		</button>
		<button
			class="{btn} {alignVal === 'left' ? activeBtn : ''}"
			title="Align left"
			aria-label="Align left"
			onclick={() => setStyle({ align: 'left' })}
		>
			<Icon icon="mdi:format-align-left" width="1.05rem" />
		</button>
		<button
			class="{btn} {alignVal === 'center' ? activeBtn : ''}"
			title="Align center"
			aria-label="Align center"
			onclick={() => setStyle({ align: 'center' })}
		>
			<Icon icon="mdi:format-align-center" width="1.05rem" />
		</button>
		<button
			class="{btn} {alignVal === 'right' ? activeBtn : ''}"
			title="Align right"
			aria-label="Align right"
			onclick={() => setStyle({ align: 'right' })}
		>
			<Icon icon="mdi:format-align-right" width="1.05rem" />
		</button>
	{/if}

	<div class="mx-1 h-5 w-px bg-brand-sand-200 dark:bg-[#414559]"></div>

	<!-- Z-order -->
	<button class={btn} title="Bring to front" aria-label="Bring to front" disabled={!selected} onclick={bringFront}>
		<Icon icon="mdi:arrange-bring-to-front" width="1.05rem" />
	</button>
	<button class={btn} title="Bring forward" aria-label="Bring forward" disabled={!selected} onclick={bringForward}>
		<Icon icon="mdi:arrange-bring-forward" width="1.05rem" />
	</button>
	<button class={btn} title="Send backward" aria-label="Send backward" disabled={!selected} onclick={sendBackward}>
		<Icon icon="mdi:arrange-send-backward" width="1.05rem" />
	</button>
	<button class={btn} title="Send to back" aria-label="Send to back" disabled={!selected} onclick={sendBack}>
		<Icon icon="mdi:arrange-send-to-back" width="1.05rem" />
	</button>

	<div class="mx-1 h-5 w-px bg-brand-sand-200 dark:bg-[#414559]"></div>

	<button class={btn} title="Duplicate" aria-label="Duplicate" disabled={!selected} onclick={duplicate}>
		<Icon icon="mdi:content-duplicate" width="1rem" />
	</button>
	<button class={btn} title="Delete" aria-label="Delete" disabled={!selected} onclick={remove}>
		<Icon icon="mdi:trash-can-outline" width="1.05rem" />
	</button>

	<div class="mx-1 h-5 w-px bg-brand-sand-200 dark:bg-[#414559]"></div>

	<button
		class={btn}
		title="Group (Ctrl+G)"
		aria-label="Group"
		disabled={!canGroup}
		onclick={group}
	>
		<Icon icon="mdi:group" width="1.05rem" />
	</button>
	<button
		class={btn}
		title="Ungroup (Ctrl+Shift+G)"
		aria-label="Ungroup"
		disabled={!hasGroup}
		onclick={ungroup}
	>
		<Icon icon="mdi:ungroup" width="1.05rem" />
	</button>
</div>
