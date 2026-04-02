<script lang="ts">
	import './ContentEditable.css';
	import type { LexicalEditor } from 'lexical';
	import { onMount } from 'svelte';
	import { getEditor } from './composerContext.js';

	interface Props {
		ariaActiveDescendantID?: string | undefined;
		ariaAutoComplete?: 'list' | 'none' | 'inline' | 'both' | null;
		ariaControls?: string | undefined;
		ariaDescribedBy?: string | undefined;
		ariaExpanded?: boolean | undefined;
		ariaLabel?: string | undefined;
		ariaLabelledBy?: string | undefined;
		ariaMultiline?: boolean | undefined;
		ariaOwns?: string | undefined;
		ariaRequired?: boolean | undefined;
		autoCapitalize?:
			| 'none'
			| 'characters'
			| 'off'
			| 'on'
			| 'sentences'
			| 'words'
			| null
			| undefined;
		//export let className: string;  // @lexical/image plugin seems to depend on the harded class name.
		className?: string;
		id?: string | undefined;
		//export let readOnly: boolean; // it is defined in lexical code but not used
		role?: string | undefined;
		spellCheck?: boolean;
		style?: string | undefined;
		tabIndex?: number | undefined;
		testid?: string | undefined;
		dir?: 'ltr' | 'rtl' | undefined;
	}

	let {
		ariaActiveDescendantID = undefined,
		ariaAutoComplete = null,
		ariaControls = undefined,
		ariaDescribedBy = undefined,
		ariaExpanded = undefined,
		ariaLabel = undefined,
		ariaLabelledBy = undefined,
		ariaMultiline = undefined,
		ariaOwns = undefined,
		ariaRequired = undefined,
		autoCapitalize = undefined,
		// className = 'ContentEditable__root',
        className = 'ContentEditable__root relative block top-2 px-4 w-full outline-none border-0 text-brand-charcoal-500 default-scroll',
		id = undefined,
		role = 'textbox',
		spellCheck = true,
		style = undefined,
		tabIndex = undefined,
		testid = undefined,
		dir = undefined,
	}: Props = $props();

	let isEditable = $state(false);
	let height = $state(0);
	const editor: LexicalEditor = getEditor();
	let ref: null | HTMLElement = $state(null);

	onMount(() => {
		// defaultView is required for a root element.
		// In multi-window setups, the defaultView may not exist at certain points.
		if (ref && ref.ownerDocument && ref.ownerDocument.defaultView) {
			editor.setRootElement(ref);
		} else {
			editor.setRootElement(null);
		}

		isEditable = editor.isEditable();
		return editor.registerEditableListener((currentIsEditable) => {
			isEditable = currentIsEditable;
		});
	});
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<svelte:window bind:innerHeight={height} />
<div
	aria-activedescendant={!isEditable ? undefined : ariaActiveDescendantID}
	aria-autocomplete={!isEditable ? 'none' : ariaAutoComplete}
	aria-controls={!isEditable ? undefined : ariaControls}
	aria-describedby={ariaDescribedBy}
	aria-expanded={!isEditable ? undefined : role === 'combobox' ? !!ariaExpanded : undefined}
	aria-label={ariaLabel}
	aria-labelledby={ariaLabelledBy}
	aria-multiline={ariaMultiline}
	aria-owns={!isEditable ? null : ariaOwns}
	aria-readonly={!isEditable ? true : undefined}
	aria-required={ariaRequired}
	autocapitalize={autoCapitalize}
	class={`${className} overflow-auto text-base cursor-text`}
	contentEditable={isEditable}
	data-testid={testid}
	{dir}
	{id}
	bind:this={ref}
	{role}
	spellcheck={spellCheck}
	{style}
	tabindex={tabIndex}
	style:height="{height - 140}px"
></div>
