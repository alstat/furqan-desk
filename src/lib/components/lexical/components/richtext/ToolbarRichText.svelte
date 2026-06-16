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
	import FontColorButton from '../toolbar/FontColorButton.svelte';
    import { hideSurahPage } from '$lib/stores/quran.svelte';

	// Width (px) of the EditorComposer at or above which the TripleDotsDropDownSmall
	// items are shown inline in the toolbar; below it they collapse to a dropdown.
	const INLINE_EXPAND_WIDTH = 900;

	let { editorWidth = 0 }: { editorWidth?: number } = $props();

	let imageDialog = $state<InsertImageDialog | undefined>(undefined);
	let equationDialog = $state<InsertEquationDialog | undefined>(undefined);
	let tableDialog = $state<InsertTableDialog | undefined>(undefined);
	let windowWidth = $state(0);
</script>

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
		<FontColorButton />
		<Divider />
		<InsertDropDown>
			<InsertHRDropDownItem />
			<InsertImageDropDownItem onclick={() => imageDialog?.open()} />
			<InsertEquationDropDownItem onclick={() => equationDialog?.open()} />
			<InsertTableDropDownItem onclick={() => tableDialog?.open()} />
		</InsertDropDown>
		<DropDownAlign />
		<Divider />
		<TripleDotsDropDownSmall
			{windowWidth}
			expanded={editorWidth >= INLINE_EXPAND_WIDTH}
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
