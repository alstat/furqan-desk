<script lang="ts">
	import {
		$getNodeByKey as getNodeByKey,
		$getSelection as getSelection,
		$isNodeSelection as isNodeSelection,
		CLICK_COMMAND,
		COMMAND_PRIORITY_LOW,
		DRAGSTART_COMMAND,
		KEY_BACKSPACE_COMMAND,
		KEY_DELETE_COMMAND,
		type BaseSelection,
		type LexicalEditor
	} from 'lexical';
	import { onMount } from 'svelte';
	import { mergeRegister } from '@lexical/utils';
	import { get } from 'svelte/store';
	import { writable, type Writable } from 'svelte/store';
	import ImageResizer from '../../../components/ImageResizer.svelte';
	import { clearSelection, createNodeSelectionStore } from '../../nodeSelectionStore.js';
	import { sceneToSvg, type Scene } from './drawingScene.js';
	import { $isDrawingNode as isDrawingNode } from './DrawingNode.js';
	import { openDrawingEditor } from './drawingEditorStore.js';

	interface Props {
		scene: Scene;
		altText: string;
		nodeKey: string;
		width: number;
		height: number;
		maxWidth: number;
		resizable: boolean;
		editor: LexicalEditor;
	}

	let { scene, altText, nodeKey, width, height, maxWidth, resizable, editor }: Props = $props();

	let containerRef: HTMLDivElement | null = $state(null);
	let buttonRef: Writable<HTMLButtonElement | null> = writable(null);
	let selection: BaseSelection | null = $state(null);
	let isSelected = createNodeSelectionStore(editor, nodeKey);
	let isResizing = $state(false);

	let svgMarkup = $derived(sceneToSvg(scene));
	let isFocused = $derived($isSelected || isResizing);

	const onDelete = (payload: KeyboardEvent) => {
		if ($isSelected && isNodeSelection(getSelection())) {
			payload.preventDefault();
			const node = getNodeByKey(nodeKey);
			if (isDrawingNode(node)) {
				node.remove();
				return true;
			}
		}
		return false;
	};

	const onClick = (event: MouseEvent) => {
		if (isResizing) return true;
		if (containerRef && event.target instanceof Node && containerRef.contains(event.target)) {
			if (event.shiftKey) {
				$isSelected = !$isSelected;
			} else {
				clearSelection(editor);
				$isSelected = true;
			}
			return true;
		}
		return false;
	};

	function openEditor() {
		const opener = get(openDrawingEditor);
		if (opener) opener(scene, nodeKey);
	}

	onMount(() => {
		let isMounted = true;
		return mergeRegister(
			editor.registerUpdateListener(({ editorState }) => {
				if (isMounted) {
					selection = editorState.read(() => getSelection());
				}
			}),
			editor.registerCommand<MouseEvent>(CLICK_COMMAND, onClick, COMMAND_PRIORITY_LOW),
			editor.registerCommand(
				DRAGSTART_COMMAND,
				(event) => {
					if (containerRef && event.target instanceof Node && containerRef.contains(event.target)) {
						event.preventDefault();
						return true;
					}
					return false;
				},
				COMMAND_PRIORITY_LOW
			),
			editor.registerCommand(KEY_DELETE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
			editor.registerCommand(KEY_BACKSPACE_COMMAND, onDelete, COMMAND_PRIORITY_LOW),
			() => {
				isMounted = false;
			}
		);
	});

	const onResizeStart = () => {
		isResizing = true;
	};

	const onResizeEnd = (nextWidth: 'inherit' | number, nextHeight: 'inherit' | number) => {
		setTimeout(() => {
			isResizing = false;
		}, 200);
		editor.update(() => {
			const node = getNodeByKey(nodeKey);
			if (isDrawingNode(node)) {
				node.setWidthAndHeight(
					typeof nextWidth === 'number' ? nextWidth : node.__width,
					typeof nextHeight === 'number' ? nextHeight : node.__height
				);
			}
		});
	};
</script>

<div class="drawing-node-wrapper" style="position:relative; display:inline-block;">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={containerRef}
		class="drawing-node-view"
		class:focused={isFocused}
		role="img"
		aria-label={altText || 'Drawing'}
		title="Double-click to edit drawing"
		style="width:{width}px; height:{height}px; max-width:{maxWidth}px; cursor:pointer;"
		ondblclick={openEditor}
	>
		{@html svgMarkup}
	</div>
	{#if resizable && isNodeSelection(selection) && isFocused}
		<ImageResizer
			showCaption={false}
			setShowCaption={() => {}}
			{editor}
			{buttonRef}
			imageRef={containerRef}
			{maxWidth}
			{onResizeStart}
			{onResizeEnd}
			captionsEnabled={false}
		/>
		<button
			onclick={openEditor}
			class="absolute shadow-xl dark:shadow-black/40 top-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-4 py-1 rounded-full text-[11px] font-sans font-semibold bg-brand-sand-50/80 dark:bg-[#292c3c]/80 border border-brand-sand-200 dark:border-[#414559] text-brand-charcoal-800 dark:text-[#c6d0f5] hover:bg-brand-gold-50 dark:hover:bg-[#3b3757] cursor-pointer transition-colors whitespace-nowrap backdrop-blur-sm z-10"
		>
			Edit drawing
		</button>
	{/if}
</div>

<style>
	.drawing-node-view {
		user-select: none;
		line-height: 0;
	}
	.drawing-node-view :global(svg) {
		width: 100%;
		height: 100%;
		display: block;
	}
	.drawing-node-view.focused {
		outline: 2px solid var(--color-brand-gold-400, #e0b84c);
		outline-offset: 2px;
		border-radius: 4px;
	}
</style>
