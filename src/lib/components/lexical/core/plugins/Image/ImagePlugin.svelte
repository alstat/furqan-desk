<script module lang="ts">
	declare global {
		interface DragEvent {
			rangeOffset?: number;
			rangeParent?: Node;
		}
	}

	export const INSERT_IMAGE_COMMAND: LexicalCommand<InsertImagePayload> = createCommand();
	export type InsertImagePayload = ImagePayload;

	const getDOMSelection = (targetWindow: Window | null): Selection | null =>
		CAN_USE_DOM ? (targetWindow || window).getSelection() : null;
</script>

<script lang="ts">
	import {
		$createParagraphNode as createParagraphNode,
		$createRangeSelection as createRangeSelection,
		$createTextNode as createTextNode,
		$getSelection as getSelection,
		$insertNodes as insertNodes,
		$isNodeSelection as isNodeSelection,
		$isRootOrShadowRoot as isRootOrShadowRoot,
		$setSelection as setSelection,
		COMMAND_PRIORITY_EDITOR,
		COMMAND_PRIORITY_HIGH,
		COMMAND_PRIORITY_LOW,
		createCommand,
		DRAGOVER_COMMAND,
		DRAGSTART_COMMAND,
		DROP_COMMAND,
		PASTE_COMMAND,
		type LexicalCommand,
		type LexicalEditor
	} from 'lexical';
	import { $createLinkNode as createLinkNode } from '@lexical/link';
	import { $wrapNodeInElement as wrapNodeInElement, mergeRegister } from '@lexical/utils';

	import { onMount } from 'svelte';
	import {
		$createImageNode as createImageNode,
		$isImageNode as isImageNode,
		ImageNode,
		type ImagePayload
	} from './ImageNode.js';
	import { getEditor } from '../../composerContext.js';
	import { CAN_USE_DOM } from '../../../environment/canUseDOM.js';

	const editor: LexicalEditor = getEditor();

	const TRANSPARENT_IMAGE =
		'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
	let img: HTMLImageElement;

	interface Props {
		captionsEnabled?: boolean;
		children?: import('svelte').Snippet;
	}

	let { captionsEnabled = true, children }: Props = $props();

	onMount(() => {
        console.log("ImagePlugin: onMount");
		if (!editor.hasNodes([ImageNode])) {
			throw new Error('ImagesPlugin: ImageNode not registered on editor');
		}

		img = document.createElement('img');
		img.src = TRANSPARENT_IMAGE;

		return mergeRegister(
			editor.registerCommand<InsertImagePayload>(
				INSERT_IMAGE_COMMAND,
				(payload) => {
					payload.captionsEnabled = captionsEnabled;
					const imageNode = createImageNode(payload);
					insertNodes([imageNode]);
					if (isRootOrShadowRoot(imageNode.getParentOrThrow())) {
						wrapNodeInElement(imageNode, createParagraphNode).selectEnd();
					}

if (payload.captionText) {
					const metaParagraph = createParagraphNode();
					metaParagraph.append(createTextNode(payload.captionText));
					if (payload.linkUrl) {
						metaParagraph.append(createTextNode(" · "));
						const linkText = createTextNode("View on Corpus Coranicum");
						const linkNode = createLinkNode(payload.linkUrl, {
							target: '_blank',
							rel: 'noopener noreferrer',
						});
						linkNode.append(linkText);
						metaParagraph.append(linkNode);
					}
					imageNode.getParentOrThrow().insertAfter(metaParagraph);
					metaParagraph.selectEnd();
				}

					return true;
				},
				COMMAND_PRIORITY_EDITOR
			),
			editor.registerCommand<DragEvent>(
				DRAGSTART_COMMAND,
				(event) => {
					return onDragStart(event);
				},
				COMMAND_PRIORITY_HIGH
			),
			editor.registerCommand<DragEvent>(
				DRAGOVER_COMMAND,
				(event) => {
					return onDragover(event);
				},
				COMMAND_PRIORITY_LOW
			),
			editor.registerCommand<DragEvent>(
				DROP_COMMAND,
				(event) => {
					return onDrop(event, editor);
				},
				COMMAND_PRIORITY_HIGH
			),
			editor.registerCommand<ClipboardEvent>(
				PASTE_COMMAND,
				(event) => {
					if (!(event instanceof ClipboardEvent)) {
						return false;
					}
					return handleImagePaste(event);
				},
				COMMAND_PRIORITY_LOW
			)
		);
	});

	// Collects image blobs the webview exposed on the paste event. `items`
	// covers raw bitmaps (e.g. screenshots); `files` covers image files
	// copied from a file manager.
	function getClipboardImageFiles(data: DataTransfer): File[] {
		const files: File[] = [];
		const items = data.items;
		if (items) {
			for (let i = 0; i < items.length; i++) {
				const item = items[i];
				if (item.kind === 'file' && item.type.startsWith('image/')) {
					const file = item.getAsFile();
					if (file) {
						files.push(file);
					}
				}
			}
		}
		if (files.length === 0 && data.files) {
			for (let i = 0; i < data.files.length; i++) {
				const file = data.files[i];
				if (file.type.startsWith('image/')) {
					files.push(file);
				}
			}
		}
		return files;
	}

	function insertImageFile(file: File): void {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === 'string') {
				editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
					src: reader.result,
					altText: file.name || 'Pasted image'
				});
			}
		};
		reader.readAsDataURL(file);
	}

	// Native fallback: when the webview doesn't surface the image through the
	// paste event (notably Linux/WebKitGTK), read it straight from the OS
	// clipboard via the Tauri clipboard-manager plugin. The plugin returns raw
	// RGBA pixels, so paint them onto a canvas to obtain a PNG data URL.
	async function insertImageFromOSClipboard(): Promise<boolean> {
		try {
			const { readImage } = await import('@tauri-apps/plugin-clipboard-manager');
			const image = await readImage();
			const { width, height } = await image.size();
			const rgba = await image.rgba();
			if (!width || !height || rgba.length === 0) {
				return false;
			}
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				return false;
			}
			ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), width, height), 0, 0);
			editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
				src: canvas.toDataURL('image/png'),
				altText: 'Pasted image'
			});
			return true;
		} catch {
			return false;
		}
	}

	function handleImagePaste(event: ClipboardEvent): boolean {
		const data = event.clipboardData;
		if (data) {
			const files = getClipboardImageFiles(data);
			if (files.length > 0) {
				event.preventDefault();
				files.forEach(insertImageFile);
				return true;
			}
			// Plain text / rich text present: a normal paste — defer to the
			// other paste handlers.
			if (data.getData('text/plain') !== '' || data.getData('text/html') !== '') {
				return false;
			}
		}
		// The webview gave us nothing usable; an image may still sit on the OS
		// clipboard. Claim the event and resolve it natively.
		event.preventDefault();
		insertImageFromOSClipboard();
		return true;
	}

	function onDragStart(event: DragEvent): boolean {
		const node = getImageNodeInSelection();
		if (!node) {
			return false;
		}
		const dataTransfer = event.dataTransfer;
		if (!dataTransfer) {
			return false;
		}
		dataTransfer.setData('text/plain', '_');
		dataTransfer.setDragImage(img, 0, 0);
		dataTransfer.setData(
			'application/x-lexical-drag',
			JSON.stringify({
				data: {
					altText: node.__altText,
					caption: node.__caption,
					height: node.__height,
					key: node.getKey(),
					maxWidth: node.__maxWidth,
					showCaption: node.__showCaption,
					src: node.__src,
					width: node.__width
				},
				type: 'image'
			})
		);

		return true;
	}

	function onDragover(event: DragEvent): boolean {
		const node = getImageNodeInSelection();
		if (!node) {
			return false;
		}
		if (!canDropImage(event)) {
			event.preventDefault();
		}
		return true;
	}

	function onDrop(event: DragEvent, editor: LexicalEditor): boolean {
		const node = getImageNodeInSelection();
		if (!node) {
			return false;
		}
		const data = getDragImageData(event);
		if (!data) {
			return false;
		}
		event.preventDefault();
		if (canDropImage(event)) {
			const range = getDragSelection(event);
			node.remove();
			const rangeSelection = createRangeSelection();
			if (range !== null && range !== undefined) {
				rangeSelection.applyDOMRange(range);
			}
			setSelection(rangeSelection);
			editor.dispatchCommand(INSERT_IMAGE_COMMAND, data);
		}
		return true;
	}

	function getImageNodeInSelection(): ImageNode | null {
		const selection = getSelection();
		if (!isNodeSelection(selection)) {
			return null;
		}
		const nodes = selection.getNodes();
		const node = nodes[0];
		return isImageNode(node) ? node : null;
	}

	function getDragImageData(event: DragEvent): null | InsertImagePayload {
		const dragData = event.dataTransfer?.getData('application/x-lexical-drag');
		if (!dragData) {
			return null;
		}
		const { type, data } = JSON.parse(dragData);
		if (type !== 'image') {
			return null;
		}

		return data;
	}

	function canDropImage(event: DragEvent): boolean {
		const target = event.target;
		return !!(
			target &&
			target instanceof HTMLElement &&
			!target.closest('code, span.editor-image') &&
			target.parentElement &&
			target.parentElement.closest('div.ContentEditable__root')
		);
	}

	function getDragSelection(event: DragEvent): Range | null | undefined {
		let range;
		const target = event.target as null | Element | Document;
		const targetWindow =
			target == null
				? null
				: target.nodeType === 9
					? (target as Document).defaultView
					: (target as Element).ownerDocument.defaultView;
		const domSelection = getDOMSelection(targetWindow);
		if (document.caretRangeFromPoint) {
			range = document.caretRangeFromPoint(event.clientX, event.clientY);
		} else if (event.rangeParent && domSelection !== null) {
			domSelection.collapse(event.rangeParent, event.rangeOffset || 0);
			range = domSelection.getRangeAt(0);
		} else {
			throw Error(`Cannot get the selection when dragging`);
		}

		return range;
	}
</script>

<!--for ImageComponent history plugin -->
{@render children?.()}
