<script lang="ts">
	import BlockFormatDropDown from '../toolbar/BlockFormatDropDown/BlockFormatDropDown.svelte';
	import BoldButton from '../toolbar/BoldButton.svelte';
	import Divider from '../toolbar/Divider.svelte';
	import RedoButton from '../toolbar/RedoButton.svelte';
	import UndoButton from '../toolbar/UndoButton.svelte';
	import ItalicButton from '../toolbar/ItalicButton.svelte';
	import UnderlineButton from '../toolbar/UnderlineButton.svelte';
	import StrikethroughButton from '../toolbar/StrikethroughButton.svelte';
	import FormatCodeButton from '../toolbar/FormatCodeButton.svelte';
	import DropDownScript from '../toolbar/DropDownScript.svelte';
	import DropDownHighlight from '../toolbar/DropDownHighlight.svelte';
	import LinkButton from '../toolbar/LinkButton.svelte';
	import DropDownAlign from '../toolbar/DropDownAlign.svelte';
	import InsertDropDown from '../toolbar/InsertDropDown/InsertDropDown.svelte';
	import FontFamilyDropDown from '../toolbar/FontFamilyDropDown.svelte';
	import FontSizeDropDown from '../toolbar/FontSizeDropDown.svelte';
	import ParagraphDropDownItem from '../toolbar/BlockFormatDropDown/ParagraphDropDownItem.svelte';
	import HeadingDropDownItem from '../toolbar/BlockFormatDropDown/HeadingDropDownItem.svelte';
	import BulletDropDrownItem from '../toolbar/BlockFormatDropDown/BulletDropDrownItem.svelte';
	import NumberDropDrownItem from '../toolbar/BlockFormatDropDown/NumberDropDrownItem.svelte';
	import CheckDropDrownItem from '../toolbar/BlockFormatDropDown/CheckDropDrownItem.svelte';
	import QuoteDropDrownItem from '../toolbar/BlockFormatDropDown/QuoteDropDrownItem.svelte';
	import Toolbar from '../toolbar/Toolbar.svelte';
	import InsertImageDialog from '../toolbar/dialogs/InsertImageDialog.svelte';
	import InsertHRDropDownItem from '../toolbar/InsertDropDown/InsertHRDropDownItem.svelte';
	import InsertImageDropDownItem from '../toolbar/InsertDropDown/InsertImageDropDownItem.svelte';
	import Indent from '../toolbar/Indent.svelte';
	import Outdent from '../toolbar/Outdent.svelte';
	import CodeDropDownItem from '../toolbar/BlockFormatDropDown/CodeDropDownItem.svelte';
	import InsertEquationDropDownItem from '../toolbar/InsertDropDown/InsertEquationDropDownItem.svelte';
	import InsertEquationDialog from '../toolbar/dialogs/InsertEquationDialog.svelte';
	import InsertTableDialog from '../toolbar/dialogs/InsertTableDialog.svelte';
	import InsertTableDropDownItem from '../toolbar/InsertDropDown/InsertTableDropDownItem.svelte';
	import EquationShortcutButton from '$lexical/core/plugins/Equation/EquationShortcutButton.svelte';
	import TripleDotsDropDown from '../toolbar/TripleDots/TripleDotsDropDown.svelte';
    import TripleDotsDropDownSmall from '../toolbar/TripleDots/TripleDotsDropDownSmall.svelte';
	import DropDownFontColor from '../toolbar/DropDownFontColor.svelte';
    import { hideSurahPage } from '$lib/stores/quran.svelte';

	// Width (px) of the EditorComposer at or above which the TripleDotsDropDownSmall
	// items (Indent / Outdent / line-spacing / clear-formatting) are shown inline
	// in the toolbar; below it they collapse to the triple-dot dropdown.
	const INLINE_EXPAND_WIDTH = 900;

	// Progressive overflow for the right-hand cluster: as the editor narrows, the
	// far-right menus move — one at a time, right-to-left — into the triple-dot
	// dropdown so nothing gets clipped. Each entry is the editorWidth (px) at or
	// above which that menu stays inline; below it, it renders inside the dropdown.
	// The thresholds are ordered so Align collapses first, then Insert, … Script
	// last. Align + Insert sit above the ~585–615px editorWidth the editor pane
	// gets at the app's minimum window width (a 50/50 sidebar split), so both
	// reliably move into the dropdown there instead of squishing inline.
	const COLLAPSE = {
		align: 670,
		insert: 640,
		highlight: 550,
		fontColor: 515,
		link: 485,
		script: 455,
	};

	let { editorWidth = 0 }: { editorWidth?: number } = $props();

	// Whether each collapsible menu is shown inline (true) or has moved into the
	// overflow dropdown (false).
	const showAlign = $derived(editorWidth >= COLLAPSE.align);
	const showInsert = $derived(editorWidth >= COLLAPSE.insert);
	const showHighlight = $derived(editorWidth >= COLLAPSE.highlight);
	const showFontColor = $derived(editorWidth >= COLLAPSE.fontColor);
	const showLink = $derived(editorWidth >= COLLAPSE.link);
	const showScript = $derived(editorWidth >= COLLAPSE.script);
	// Any menu currently overflowed → the dropdown must render the overflow row.
	const hasOverflow = $derived(
		!showAlign ||
			!showInsert ||
			!showHighlight ||
			!showFontColor ||
			!showLink ||
			!showScript,
	);

	let imageDialog = $state<InsertImageDialog | undefined>(undefined);
	let equationDialog = $state<InsertEquationDialog | undefined>(undefined);
	let tableDialog = $state<InsertTableDialog | undefined>(undefined);
	let windowWidth = $state(0);
</script>

<!-- Each collapsible menu is declared once as a snippet so it renders identically
     whether inline in the toolbar or inside the overflow dropdown. -->
{#snippet scriptGroup()}
	<DropDownScript />
{/snippet}
{#snippet linkGroup()}
	<LinkButton />
{/snippet}
{#snippet fontColorGroup()}
	<DropDownFontColor />
{/snippet}
{#snippet highlightGroup()}
	<DropDownHighlight />
{/snippet}
{#snippet insertGroup()}
	<InsertDropDown>
		<InsertHRDropDownItem />
		<InsertImageDropDownItem onclick={() => imageDialog?.open()} />
		<InsertEquationDropDownItem onclick={() => equationDialog?.open()} />
		<InsertTableDropDownItem onclick={() => tableDialog?.open()} />
	</InsertDropDown>
{/snippet}
{#snippet alignGroup()}
	<DropDownAlign />
{/snippet}

<!-- Overflow row handed to the triple-dot dropdown — the menus that no longer
     fit inline, in their original left-to-right order. -->
{#snippet overflow()}
	{#if !showScript}{@render scriptGroup()}{/if}
	{#if !showLink}{@render linkGroup()}{/if}
	{#if !showFontColor}{@render fontColorGroup()}{/if}
	{#if !showHighlight}{@render highlightGroup()}{/if}
	{#if !showInsert}{@render insertGroup()}{/if}
	{#if !showAlign}{@render alignGroup()}{/if}
{/snippet}

<svelte:window bind:innerWidth={windowWidth} />

<Toolbar>
	{#snippet children({ editor, activeEditor, blockType })}
		{#if activeEditor === editor}
			<BlockFormatDropDown>
				<ParagraphDropDownItem />
				<HeadingDropDownItem headingSize="h1" />
				<HeadingDropDownItem headingSize="h2" />
				<HeadingDropDownItem headingSize="h3" />
				<BulletDropDrownItem />
				<NumberDropDrownItem />
				<CheckDropDrownItem />
				<QuoteDropDrownItem />
			</BlockFormatDropDown>
		{/if}
		<Divider />
		<FontFamilyDropDown />
		<FontSizeDropDown />
		<Divider />
		<BoldButton />
		<ItalicButton />
		<UnderlineButton />
		<StrikethroughButton />
		<FormatCodeButton />
		{#if showScript}{@render scriptGroup()}{/if}
		{#if showLink}{@render linkGroup()}{/if}
		{#if showFontColor}{@render fontColorGroup()}{/if}
		{#if showHighlight}{@render highlightGroup()}{/if}
		{#if showInsert || showAlign}<Divider />{/if}
		{#if showInsert}{@render insertGroup()}{/if}
		{#if showAlign}{@render alignGroup()}{/if}
		<Divider />
		<TripleDotsDropDownSmall
			{windowWidth}
			expanded={editorWidth >= INLINE_EXPAND_WIDTH}
			overflow={hasOverflow ? overflow : undefined}
			onInsertImageClick={() => imageDialog?.open()}
			onInsertEquationClick={() => equationDialog?.open()}
		/>
		<!-- dialogs -->
		<InsertImageDialog bind:this={imageDialog} />
		<InsertEquationDialog bind:this={equationDialog} />
		<InsertTableDialog bind:this={tableDialog} />
		<EquationShortcutButton onTrigger={() => equationDialog?.open()} />
	{/snippet}
</Toolbar>
