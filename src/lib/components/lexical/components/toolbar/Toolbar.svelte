<script lang="ts">
	import { writable } from 'svelte/store';

	import StateStoreRichTextUpdator from './StateStoreRichTextUpdator.svelte';
	import { setContext } from 'svelte';
	import { getEditor } from '$lexical/core/composerContext.js';
	import type { LexicalEditor, NodeKey } from 'lexical';
	interface Props {
		children?: import('svelte').Snippet<
			[{ editor: LexicalEditor; activeEditor: LexicalEditor; blockType: string }]
		>;
	}

	let { children }: Props = $props();

	const editor = getEditor();

	const activeEditor = writable(editor);
	setContext('activeEditor', activeEditor);

	setContext('isBold', writable(false));
	setContext('isItalic', writable(false));
	setContext('isUnderline', writable(false));
	setContext('isStrikethrough', writable(false));
	setContext('isSubscript', writable(false));
	setContext('isSuperscript', writable(false));
	setContext('isCode', writable(false));
    setContext('isIndent', writable(false));
    setContext('isOutdent', writable(false));

	const blockType = writable('paragraph');
	setContext('blockType', blockType);

	setContext('selectedElementKey', writable<NodeKey | null>(null));

	setContext('fontSize', writable('16px'));
	setContext('fontFamily', writable('EB Garamond'));
	setContext('fontColor', writable('#000'));
	setContext('bgColor', writable('#fff'));
	setContext('isRTL', writable(false));
	setContext('codeLanguage', writable(''));
	setContext('isLink', writable(false));
	setContext('isImageCaption', writable(false));
	setContext('lineHeight', writable(''));
</script>

<StateStoreRichTextUpdator />
<div
	class="flex flex-row items-center h-8 justify-center space-x-1 rounded-full bg-brand-sand-50 border border-brand-sand-200 px-3 py-1 backdrop-blur-sm"
>
	{@render children?.({
		editor,
		activeEditor: $activeEditor,
		blockType: $blockType
	})}
</div>
