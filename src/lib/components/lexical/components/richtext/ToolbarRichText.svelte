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
	import ActionBar from '../actionbar/ActionBar.svelte';
	import CodeDropDownItem from '../toolbar/BlockFormatDropDown/CodeDropDownItem.svelte';
	import InsertEquationDropDownItem from '../toolbar/InsertDropDown/InsertEquationDropDownItem.svelte';
	import InsertEquationDialog from '../toolbar/dialogs/InsertEquationDialog.svelte';
	import EquationShortcutButton from '$lexical/core/plugins/Equation/EquationShortcutButton.svelte';
	import TripleDotsDropDown from '../toolbar/TripleDots/TripleDotsDropDown.svelte';

	let imageDialog = $state<InsertImageDialog | undefined>(undefined);
	let equationDialog = $state<InsertEquationDialog | undefined>(undefined);
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
		<div class="hidden md:flex md:flex-row md:items-center">
			<FontSizeDropDown />
			<Divider />
			<BoldButton />
			<ItalicButton />
		</div>
		<div class="hidden lg:flex lg:flex-row lg:items-center">
			<UnderlineButton />
			<StrikethroughButton />
			<FormatCodeButton />
		</div>
		<div class="hidden xl:flex xl:flex-row xl:items-center">
			<Divider />
			<InsertDropDown>
				<InsertHRDropDownItem />
				<InsertImageDropDownItem onclick={() => imageDialog?.open()} />
				<InsertEquationDropDownItem onclick={() => equationDialog?.open()} />
			</InsertDropDown>
            <DropDownAlign />
			<Divider />
			<Indent />
			<Outdent />
		</div>


		<!-- TripleDotsDropdown component with the window width -->
		{#if windowWidth < 1280}
			<Divider />
			<TripleDotsDropDown
				{windowWidth}
				onInsertImageClick={() => imageDialog?.open()}
				onInsertEquationClick={() => equationDialog?.open()}
			/>
		{/if}

		<!-- action bar -->
		<ActionBar />

		<!-- dialogs -->
		<InsertImageDialog bind:this={imageDialog} />
		<InsertEquationDialog bind:this={equationDialog} />
		<EquationShortcutButton onTrigger={() => equationDialog?.open()} />
	{/snippet}
</Toolbar>
