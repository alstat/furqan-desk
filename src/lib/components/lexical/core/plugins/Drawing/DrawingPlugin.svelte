<script module lang="ts">
	export const INSERT_DRAWING_COMMAND: LexicalCommand<InsertDrawingPayload> = createCommand(
		'INSERT_DRAWING_COMMAND'
	);
	export const UPDATE_DRAWING_COMMAND: LexicalCommand<UpdateDrawingPayload> = createCommand(
		'UPDATE_DRAWING_COMMAND'
	);

	export type InsertDrawingPayload = DrawingPayload;
	export interface UpdateDrawingPayload {
		nodeKey: string;
		scene: Scene;
		width: number;
		height: number;
	}
</script>

<script lang="ts">
	import {
		$createParagraphNode as createParagraphNode,
		$getNodeByKey as getNodeByKey,
		$insertNodes as insertNodes,
		$isRootOrShadowRoot as isRootOrShadowRoot,
		COMMAND_PRIORITY_EDITOR,
		createCommand,
		type LexicalCommand,
		type LexicalEditor
	} from 'lexical';
	import { $wrapNodeInElement as wrapNodeInElement, mergeRegister } from '@lexical/utils';
	import { onMount } from 'svelte';
	import {
		$createDrawingNode as createDrawingNode,
		$isDrawingNode as isDrawingNode,
		DrawingNode,
		type DrawingPayload
	} from './DrawingNode.js';
	import type { Scene } from './drawingScene.js';
	import { getEditor } from '../../composerContext.js';

	const editor: LexicalEditor = getEditor();

	interface Props {
		children?: import('svelte').Snippet;
	}
	let { children }: Props = $props();

	onMount(() => {
		if (!editor.hasNodes([DrawingNode])) {
			throw new Error('DrawingPlugin: DrawingNode not registered on editor');
		}

		return mergeRegister(
			editor.registerCommand<InsertDrawingPayload>(
				INSERT_DRAWING_COMMAND,
				(payload) => {
					const drawingNode = createDrawingNode(payload);
					insertNodes([drawingNode]);
					if (isRootOrShadowRoot(drawingNode.getParentOrThrow())) {
						wrapNodeInElement(drawingNode, createParagraphNode).selectEnd();
					}
					return true;
				},
				COMMAND_PRIORITY_EDITOR
			),
			editor.registerCommand<UpdateDrawingPayload>(
				UPDATE_DRAWING_COMMAND,
				({ nodeKey, scene, width, height }) => {
					const node = getNodeByKey(nodeKey);
					if (isDrawingNode(node)) {
						node.setScene(scene);
						node.setWidthAndHeight(width, height);
						return true;
					}
					return false;
				},
				COMMAND_PRIORITY_EDITOR
			)
		);
	});
</script>

{@render children?.()}
