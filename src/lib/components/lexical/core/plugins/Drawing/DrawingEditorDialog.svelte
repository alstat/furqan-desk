<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { fly } from 'svelte/transition';
	import { get } from 'svelte/store';
	import Icon from '@iconify/svelte';
	import { open as openFileDialog } from '@tauri-apps/plugin-dialog';
	import { readFile } from '@tauri-apps/plugin-fs';
	import DialogPanelHeader from '$lib/components/shared/DialogPanelHeader.svelte';
	import { bringToFront } from '$lib/stores/window-manager.store';
	import { getEditor, getActiveEditor } from '$lexical/core/composerContext.js';
	import { getCommands } from '$lexical/core/commands.js';
	import DrawingToolbar from './DrawingToolbar.svelte';
	import DrawingCanvas from './DrawingCanvas.svelte';
	import {
		emptyScene,
		DEFAULT_STYLE,
		createId,
		createImageShape,
		translateShape,
		syncConnections,
		fitTextShapeToContent,
		isLabelableShape,
		canGroupSelection,
		selectionHasGroup,
		expandSelection,
		groupSelection,
		ungroupSelection,
		type Scene,
		type Shape,
		type StyleDefaults,
		type DrawTool
	} from './drawingScene.js';
	import {
		INSERT_DRAWING_COMMAND,
		UPDATE_DRAWING_COMMAND
	} from './DrawingPlugin.svelte';
	import {
		openDrawingEditor,
		submitDrawing,
		takeDrawingSeed,
		onDrawingSeed,
	} from './drawingEditorStore.js';

	/**
	 * In its own window there is no Lexical composer above this component, so
	 * the context getters have nothing to read. Guarded rather than assumed:
	 * everything that needs a real editor is behind `standalone` below, and the
	 * finished drawing is sent to the main window to be committed there.
	 */
	let {
		standalone = false,
		onDone,
	}: {
		/** Fills its own OS window instead of floating inside the document. */
		standalone?: boolean;
		/** Called after a standalone save, so the window can close itself. */
		onDone?: () => void;
	} = $props();

	// The context getters must run during init and throw when there is no
	// composer above this component — which is exactly the case in the editor's
	// own window. Detected rather than inferred from a prop, so the component
	// mounts correctly wherever it is put; everything needing a real editor is
	// guarded on these being non-null.
	let editor: ReturnType<typeof getEditor> | null = null;
	let activeEditor: ReturnType<typeof getActiveEditor> | null = null;
	try {
		editor = getEditor();
		activeEditor = getActiveEditor();
	} catch {
		/* no Lexical composer here */
	}

	// Header control button styling (matches the header's gold surface).
	const headerBtn =
		'flex h-6 w-6 items-center justify-center rounded-md text-brand-charcoal-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200 dark:hover:bg-[#51576d] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

	// Embedded in the editor the dialog has to escape the Lexical DOM (and the
	// stacking contexts along the way), so it is moved to <body>. In its own
	// window there is nothing to escape, and staying put keeps it inside the
	// layout's `.app-shell` — which is what draws the Linux window frame and
	// clips the dialog to its rounded corners.
	function portal(node: HTMLElement, enabled: boolean) {
		if (!enabled) return;
		document.body.appendChild(node);
		return {
			destroy() {
				node.remove();
			}
		};
	}

	function cloneScene(s: Scene): Scene {
		return JSON.parse(JSON.stringify(s));
	}

	// ── state ────────────────────────────────────────────────────────────────
	let showModal = $state(false);
	let editingKey = $state<string | null>(null);

	let scene = $state<Scene>(emptyScene());
	let selectedIds = $state<string[]>([]);
	let tool = $state<DrawTool>('select');
	let style = $state<StyleDefaults>({ ...DEFAULT_STYLE });
	let zoom = $state(1);
	let pan = $state({ x: 24, y: 24 });
	let isEditingText = $state(false);

	let undoStack: Scene[] = $state([]);
	let redoStack: Scene[] = $state([]);
	const HISTORY_LIMIT = 100;

	let canvasW = $state(0);
	let canvasH = $state(0);
	let fitted = false;

	// Shapes in the current selection, and the "primary" one (most recently
	// added) whose values the toolbar reflects.
	let selectedShapesList = $derived(scene.shapes.filter((s) => selectedIds.includes(s.id)));
	let selectedShape = $derived(
		selectedIds.length ? (selectedShapesList[selectedShapesList.length - 1] ?? null) : null
	);
	let canUndo = $derived(undoStack.length > 0);
	let canRedo = $derived(redoStack.length > 0);
	// Group only when the selection spans 2+ top-level units (so an already-
	// single-group selection can't be re-grouped); ungroup whenever a group is
	// present in the selection.
	let canGroup = $derived(canGroupSelection(scene.shapes, selectedIds));
	let hasGroup = $derived(selectionHasGroup(scene.shapes, selectedIds));

	// A window of its own opens straight onto whatever seed was left for it, and
	// re-opens when the main window pushes another while this stays up.
	onMount(() => {
		if (!standalone) return;
		const consume = () => {
			const seed = takeDrawingSeed();
			open(seed?.scene ?? null, seed?.nodeKey ?? null);
		};
		consume();
		let unlisten: (() => void) | undefined;
		void onDrawingSeed(consume).then((fn) => (unlisten = fn));
		return () => unlisten?.();
	});

	// ── open / close ───────────────────────────────────────────────────────
	export function open(initialScene: Scene | null, nodeKey: string | null) {
		editingKey = nodeKey;
		scene = initialScene ? cloneScene(initialScene) : emptyScene();
		selectedIds = [];
		tool = 'select';
		style = { ...DEFAULT_STYLE };
		undoStack = [];
		redoStack = [];
		zoom = 1;
		pan = { x: 24, y: 24 };
		fitted = false;
		showModal = true;
	}

	async function close() {
		showModal = false;
		await tick();
		// Nothing to hand focus back to in a window of its own.
		if (editor) getCommands().FocusEditor.execute(editor);
	}

	// Register the shared opener so DrawingComponent double-clicks reuse this dialog.
	onMount(() => {
		openDrawingEditor.set((s, k) => open(s, k));
	});
	onDestroy(() => {
		openDrawingEditor.set(null);
		if (typeof window !== 'undefined') {
			window.removeEventListener('pointermove', onDrag);
			window.removeEventListener('pointermove', onResize);
			document.body.style.userSelect = '';
		}
	});

	// Fit the page into the viewport the first time the canvas is measured.
	$effect(() => {
		if (showModal && !fitted && canvasW > 0 && canvasH > 0) {
			fitted = true;
			fitView();
		}
	});

	function fitView() {
		if (canvasW <= 0 || canvasH <= 0) return;
		const z = Math.min((canvasW - 48) / scene.width, (canvasH - 48) / scene.height, 1);
		zoom = z > 0 ? z : 1;
		pan = {
			x: (canvasW - scene.width * zoom) / 2,
			y: (canvasH - scene.height * zoom) / 2
		};
	}

	// ── history ──────────────────────────────────────────────────────────────
	function requestHistory() {
		undoStack = [...undoStack, cloneScene(scene)].slice(-HISTORY_LIMIT);
		redoStack = [];
	}
	function undo() {
		if (undoStack.length === 0) return;
		redoStack = [...redoStack, cloneScene(scene)];
		const prev = undoStack[undoStack.length - 1];
		undoStack = undoStack.slice(0, -1);
		scene = prev;
	}
	function redo() {
		if (redoStack.length === 0) return;
		undoStack = [...undoStack, cloneScene(scene)];
		const next = redoStack[redoStack.length - 1];
		redoStack = redoStack.slice(0, -1);
		scene = next;
	}

	// ── canvas callbacks ──────────────────────────────────────────────────────
	function onSceneChange(next: Scene) {
		scene = next;
	}
	function onViewChange(z: number, p: { x: number; y: number }) {
		zoom = z;
		pan = p;
	}
	function setBackground(background: string) {
		if (scene.background === background) return;
		requestHistory();
		scene = { ...scene, background };
	}

	// ── style / shape editing ─────────────────────────────────────────────────
	function setStyle(patch: Partial<StyleDefaults>) {
		style = { ...style, ...patch };
		if (selectedIds.length) {
			requestHistory();
			const sel = new Set(selectedIds);
			scene = {
				...scene,
				shapes: scene.shapes.map((s) => (sel.has(s.id) ? applyStylePatch(s, patch) : s))
			};
		}
	}
	function applyStylePatch(s: Shape, patch: Partial<StyleDefaults>): Shape {
		const out: Shape = { ...s };
		if (patch.fill !== undefined && 'fill' in out) out.fill = patch.fill;
		if (patch.stroke !== undefined) out.stroke = patch.stroke;
		if (patch.strokeWidth !== undefined) out.strokeWidth = patch.strokeWidth;
		if (patch.strokeDash !== undefined) out.strokeDash = patch.strokeDash;
		if (patch.opacity !== undefined) out.opacity = patch.opacity;
		if (out.type === 'text') {
			if (patch.fontSize !== undefined) out.fontSize = patch.fontSize;
			if (patch.fontFamily !== undefined) out.fontFamily = patch.fontFamily;
			if (patch.align !== undefined) out.align = patch.align;
			if (patch.bold !== undefined) out.bold = patch.bold;
			if (patch.italic !== undefined) out.italic = patch.italic;
		} else if (isLabelableShape(out) && out.label) {
			out.label = {
				...out.label,
				fontSize: patch.fontSize ?? out.label.fontSize,
				fontFamily: patch.fontFamily ?? out.label.fontFamily,
				bold: patch.bold ?? out.label.bold,
				italic: patch.italic ?? out.label.italic
			};
		}
		// Tail arrowheads apply to line segments (line / elbow / curved connectors).
		if (out.type === 'line') {
			if (patch.startArrow !== undefined) out.startArrow = patch.startArrow;
			if (patch.endArrow !== undefined) out.endArrow = patch.endArrow;
		}
		return out.type === 'text' ? fitTextShapeToContent(out) : out;
	}

	// Re-order the whole selection as a block. `fn` receives the shape array, the
	// selected shapes' indices, and the selected-id set, and returns a new array.
	function reorderGroup(fn: (arr: Shape[], selIdx: number[], sel: Set<string>) => Shape[]) {
		if (!selectedIds.length) return;
		requestHistory();
		const sel = new Set(selectedIds);
		const arr = [...scene.shapes];
		const selIdx = arr.map((s, i) => (sel.has(s.id) ? i : -1)).filter((i) => i >= 0);
		scene = { ...scene, shapes: fn(arr, selIdx, sel) };
	}
	const bringFront = () =>
		reorderGroup((arr, _idx, sel) => [
			...arr.filter((s) => !sel.has(s.id)),
			...arr.filter((s) => sel.has(s.id))
		]);
	const sendBack = () =>
		reorderGroup((arr, _idx, sel) => [
			...arr.filter((s) => sel.has(s.id)),
			...arr.filter((s) => !sel.has(s.id))
		]);
	const bringForward = () =>
		reorderGroup((arr, selIdx, sel) => {
			const a = [...arr];
			for (let k = selIdx.length - 1; k >= 0; k--) {
				const i = selIdx[k];
				if (i < a.length - 1 && !sel.has(a[i + 1].id)) [a[i], a[i + 1]] = [a[i + 1], a[i]];
			}
			return a;
		});
	const sendBackward = () =>
		reorderGroup((arr, selIdx, sel) => {
			const a = [...arr];
			for (let k = 0; k < selIdx.length; k++) {
				const i = selIdx[k];
				if (i > 0 && !sel.has(a[i - 1].id)) [a[i], a[i - 1]] = [a[i - 1], a[i]];
			}
			return a;
		});

	function duplicate() {
		if (!selectedIds.length) return;
		requestHistory();
		const sel = new Set(selectedIds);
		const copies = scene.shapes
			.filter((s) => sel.has(s.id))
			.map((s) => translateShape({ ...s, id: createId() }, 14, 14));
		scene = { ...scene, shapes: [...scene.shapes, ...copies] };
		selectedIds = copies.map((c) => c.id);
	}
	function remove() {
		if (!selectedIds.length) return;
		requestHistory();
		const sel = new Set(selectedIds);
		scene = { ...scene, shapes: scene.shapes.filter((s) => !sel.has(s.id)) };
		selectedIds = [];
	}
	function nudge(dx: number, dy: number) {
		if (!selectedIds.length) return;
		requestHistory();
		const sel = new Set(selectedIds);
		scene = syncConnections({
			...scene,
			shapes: scene.shapes.map((s) => (sel.has(s.id) ? translateShape(s, dx, dy) : s))
		});
	}

	// ── grouping (hierarchical) — delegates to pure helpers in drawingScene ─────
	const expandGroups = (ids: string[]) => expandSelection(scene.shapes, ids);
	function group() {
		if (!canGroup) return;
		requestHistory();
		scene = groupSelection(scene, selectedIds);
	}
	function ungroup() {
		if (!hasGroup) return;
		requestHistory();
		scene = ungroupSelection(scene, selectedIds);
	}

	// ── zoom ────────────────────────────────────────────────────────────────
	function zoomBy(factor: number) {
		const nz = Math.max(0.1, Math.min(8, zoom * factor));
		pan = {
			x: canvasW / 2 - ((canvasW / 2 - pan.x) * nz) / zoom,
			y: canvasH / 2 - ((canvasH / 2 - pan.y) * nz) / zoom
		};
		zoom = nz;
	}
	const zoomIn = () => zoomBy(1.2);
	const zoomOut = () => zoomBy(1 / 1.2);
	const zoomReset = () => fitView();

	// ── embed image ───────────────────────────────────────────────────────────
	const MIME: Record<string, string> = {
		png: 'image/png',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		gif: 'image/gif',
		webp: 'image/webp',
		svg: 'image/svg+xml',
		bmp: 'image/bmp'
	};
	function uint8ToBase64(arr: Uint8Array): string {
		let binary = '';
		const chunk = 8192;
		for (let i = 0; i < arr.length; i += chunk)
			binary += String.fromCharCode(...arr.subarray(i, i + chunk));
		return btoa(binary);
	}
	async function addImage() {
		const selected = await openFileDialog({
			filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'] }],
			multiple: false
		});
		if (!selected || typeof selected !== 'string') return;
		const bytes = await readFile(selected);
		const ext = selected.split('.').pop()?.toLowerCase() ?? 'png';
		const href = `data:${MIME[ext] ?? 'image/png'};base64,${uint8ToBase64(bytes)}`;
		const img = new Image();
		img.onload = () => {
			const maxW = scene.width * 0.6;
			const maxH = scene.height * 0.6;
			let w = img.naturalWidth || 200;
			let h = img.naturalHeight || 200;
			const r = Math.min(maxW / w, maxH / h, 1);
			w = Math.round(w * r);
			h = Math.round(h * r);
			const box = { x: (scene.width - w) / 2, y: (scene.height - h) / 2, w, h };
			requestHistory();
			const shape = createImageShape(style, box, href);
			scene = { ...scene, shapes: [...scene.shapes, shape] };
			selectedIds = [shape.id];
			tool = 'select';
		};
		img.src = href;
	}

	// ── insert into document ────────────────────────────────────────────────
	function confirmInsert() {
		const width = scene.width;
		const height = scene.height;
		if (standalone) {
			// The editor is in the main window; send the drawing there to be
			// committed, then close.
			void submitDrawing({ scene, width, height, nodeKey: editingKey });
			void onDone?.();
			return;
		}
		const target = (activeEditor ? get(activeEditor) : null) ?? editor!;
		if (editingKey) {
			target.dispatchCommand(UPDATE_DRAWING_COMMAND, { nodeKey: editingKey, scene, width, height });
		} else {
			target.dispatchCommand(INSERT_DRAWING_COMMAND, { scene, width, height });
		}
		close();
	}

	// ── keyboard shortcuts ────────────────────────────────────────────────────
	function onKeydown(e: KeyboardEvent) {
		if (!showModal || isEditingText) return;
		const target = e.target as HTMLElement | null;
		if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
		const mod = e.ctrlKey || e.metaKey;
		if (mod && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			e.shiftKey ? redo() : undo();
			return;
		}
		if (mod && e.key.toLowerCase() === 'y') {
			e.preventDefault();
			redo();
			return;
		}
		if (mod && e.key.toLowerCase() === 'd') {
			e.preventDefault();
			duplicate();
			return;
		}
		if (mod && e.key.toLowerCase() === 'g') {
			e.preventDefault();
			if (e.shiftKey) ungroup();
			else group();
			return;
		}
		if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selectedIds.length) {
				e.preventDefault();
				remove();
			}
			return;
		}
		if (mod && e.key.toLowerCase() === 'a') {
			// Select all shapes.
			e.preventDefault();
			selectedIds = scene.shapes.map((s) => s.id);
			return;
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			if (selectedIds.length) selectedIds = [];
			else close();
			return;
		}
		if (e.key === '[') {
			sendBackward();
			return;
		}
		if (e.key === ']') {
			bringForward();
			return;
		}
		const step = e.shiftKey ? 10 : 1;
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			nudge(-step, 0);
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			nudge(step, 0);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			nudge(0, -step);
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			nudge(0, step);
		}
	}

	// ── drag the panel ──────────────────────────────────────────────────────
	let x = $state(0);
	let y = $state(0);
	let zIndex = $state(500);
	let isDragging = $state(false);
	let panelW = $state(1000);
	let panelH = $state(660);
	let dragStartX = 0,
		dragStartY = 0,
		startX = 0,
		startY = 0;
	let initialized = false;

	$effect(() => {
		if (showModal && !initialized) {
			panelW = Math.min(1100, Math.round(window.innerWidth * 0.94));
			panelH = Math.min(760, Math.round(window.innerHeight * 0.86));
			x = Math.max(0, (window.innerWidth - panelW) / 2);
			y = Math.max(8, (window.innerHeight - panelH) / 2);
			zIndex = bringToFront();
			initialized = true;
		}
		if (!showModal) initialized = false;
	});

	function startDrag(e: PointerEvent) {
		isDragging = true;
		dragStartX = e.clientX;
		dragStartY = e.clientY;
		startX = x;
		startY = y;
		window.addEventListener('pointermove', onDrag);
		window.addEventListener('pointerup', stopDrag, { once: true });
	}
	function onDrag(e: PointerEvent) {
		x = Math.max(0, Math.min(window.innerWidth - panelW, startX + (e.clientX - dragStartX)));
		y = Math.max(0, Math.min(window.innerHeight - 60, startY + (e.clientY - dragStartY)));
	}
	function stopDrag() {
		isDragging = false;
		window.removeEventListener('pointermove', onDrag);
	}

	// ── resize the panel ──────────────────────────────────────────────────────
	const MIN_W = 480;
	const MIN_H = 360;

	type ResizeDir = { e: boolean; w: boolean; n: boolean; s: boolean };
	const resizeHandles: Array<{ cls: string; dir: ResizeDir }> = [
		{ cls: 'resize-n', dir: { n: true, s: false, e: false, w: false } },
		{ cls: 'resize-s', dir: { n: false, s: true, e: false, w: false } },
		{ cls: 'resize-e', dir: { n: false, s: false, e: true, w: false } },
		{ cls: 'resize-w', dir: { n: false, s: false, e: false, w: true } },
		{ cls: 'resize-ne', dir: { n: true, s: false, e: true, w: false } },
		{ cls: 'resize-se', dir: { n: false, s: true, e: true, w: false } },
		{ cls: 'resize-sw', dir: { n: false, s: true, e: false, w: true } },
		{ cls: 'resize-nw', dir: { n: true, s: false, e: false, w: true } }
	];
	let _resizeDir: ResizeDir = { e: false, w: false, n: false, s: false };
	let _resizeStartX = 0,
		_resizeStartY = 0,
		_resizeStartW = 0,
		_resizeStartH = 0,
		_resizeStartPanelX = 0,
		_resizeStartPanelY = 0;

	function startResize(e: PointerEvent, dir: ResizeDir) {
		e.preventDefault();
		e.stopPropagation();
		_resizeDir = dir;
		_resizeStartX = e.clientX;
		_resizeStartY = e.clientY;
		_resizeStartW = panelW;
		_resizeStartH = panelH;
		_resizeStartPanelX = x;
		_resizeStartPanelY = y;
		zIndex = bringToFront();
		document.body.style.userSelect = 'none';
		window.addEventListener('pointermove', onResize);
		window.addEventListener('pointerup', stopResize, { once: true });
	}

	function onResize(e: PointerEvent) {
		const dx = e.clientX - _resizeStartX;
		const dy = e.clientY - _resizeStartY;
		let newW = _resizeStartW;
		let newH = _resizeStartH;
		let newX = _resizeStartPanelX;
		let newY = _resizeStartPanelY;
		// East / south grow toward the viewport edge; clamp so the panel stays
		// on-screen.
		if (_resizeDir.e)
			newW = Math.max(MIN_W, Math.min(_resizeStartW + dx, window.innerWidth - _resizeStartPanelX));
		if (_resizeDir.s)
			newH = Math.max(
				MIN_H,
				Math.min(_resizeStartH + dy, window.innerHeight - _resizeStartPanelY)
			);
		// West / north move the top-left corner; clamp it to the viewport origin.
		if (_resizeDir.w) {
			newW = Math.max(MIN_W, _resizeStartW - dx);
			newX = _resizeStartPanelX + (_resizeStartW - newW);
			if (newX < 0) {
				newW += newX;
				newX = 0;
			}
		}
		if (_resizeDir.n) {
			newH = Math.max(MIN_H, _resizeStartH - dy);
			newY = _resizeStartPanelY + (_resizeStartH - newH);
			if (newY < 0) {
				newH += newY;
				newY = 0;
			}
		}
		panelW = newW;
		panelH = newH;
		x = newX;
		y = newY;
	}

	function stopResize() {
		document.body.style.userSelect = '';
		window.removeEventListener('pointermove', onResize);
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if showModal}
	<div
		use:portal={!standalone}
		transition:fly={standalone ? { duration: 0 } : { y: 8, duration: 160, opacity: 0 }}
		role="dialog"
		aria-modal={standalone ? undefined : 'true'}
		aria-label="Insert drawing"
		tabindex="-1"
		class="flex flex-col overflow-hidden bg-white dark:bg-[#303446] {standalone
			? 'h-full w-full'
			: 'fixed rounded-xl border border-brand-sand-200 dark:border-[#414559] shadow-xl dark:shadow-black/40'}"
		style={standalone
			? ''
			: `left:${x}px; top:${y}px; width:${panelW}px; height:${panelH}px; z-index:${zIndex};`}
		onpointerdown={standalone
			? undefined
			: () => {
					zIndex = bringToFront();
				}}
	>
		<DialogPanelHeader
			icon="mdi:draw"
			title={editingKey ? 'Edit drawing' : 'Insert drawing'}
			{isDragging}
			{standalone}
			onClose={close}
			onpointerdown={startDrag}
		>
			{#snippet action()}
				<!-- Undo / redo / zoom live in the header; stop pointerdown so
				     clicking them doesn't start dragging the panel. -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div class="flex items-center gap-0.5" onpointerdown={(e) => e.stopPropagation()} role="toolbar" tabindex="-1">
					<button
						class={headerBtn}
						title="Undo"
						aria-label="Undo"
						disabled={!canUndo}
						onclick={undo}
					>
						<Icon icon="mdi:undo" width="1rem" />
					</button>
					<button
						class={headerBtn}
						title="Redo"
						aria-label="Redo"
						disabled={!canRedo}
						onclick={redo}
					>
						<Icon icon="mdi:redo" width="1rem" />
					</button>
				</div>
			{/snippet}
		</DialogPanelHeader>

		<DrawingToolbar
			{tool}
			{style}
			background={scene.background}
			selected={selectedShape}
			setTool={(t) => (tool = t)}
			{setStyle}
			{setBackground}
			{bringFront}
			{bringForward}
			{sendBackward}
			{sendBack}
			{duplicate}
			{remove}
			{group}
			{ungroup}
			{canGroup}
			{hasGroup}
			{addImage}
		/>

		<div class="relative flex-1 overflow-hidden" bind:clientWidth={canvasW} bind:clientHeight={canvasH}>
			<DrawingCanvas
				{scene}
				{selectedIds}
				{tool}
				{style}
				{zoom}
				{pan}
				{onSceneChange}
				{requestHistory}
				onSelect={(ids) => (selectedIds = expandGroups(ids))}
				onToolDone={() => (tool = 'select')}
				{onViewChange}
				onEditingChange={(v) => (isEditingText = v)}
			/>

			<!-- Select, zoom & pan controls (overlay, fixed over the canvas) -->
			<div class="absolute top-3 right-3 z-20 flex flex-col gap-1">
				<button
					onclick={() => (tool = 'select')}
					title="Select / move"
					aria-label="Select"
					aria-pressed={tool === 'select'}
					class="cursor-pointer p-1.5 rounded-full border shadow-sm transition-colors
					       {tool === 'select'
							? 'bg-brand-gold-400 border-brand-gold-400 text-gray-100 dark:bg-brand-gold-500 dark:text-gray-800'
							: 'bg-white/90 dark:bg-[#292c3c]/90 border-slate-200 dark:border-[#414559] text-brand-charcoal-400 dark:text-[#8caaee] hover:bg-white dark:hover:bg-[#292c3c]'}"
				>
					<Icon icon="ph:cursor-bold" width="0.85rem" />
				</button>
				<button
					onclick={() => (tool = tool === 'pan' ? 'select' : 'pan')}
					title="Pan (or drag empty space / hold Space)"
					aria-label="Pan"
					aria-pressed={tool === 'pan'}
					class="cursor-pointer p-1.5 rounded-full border shadow-sm transition-colors
					       {tool === 'pan'
							? 'bg-brand-gold-400 border-brand-gold-400 text-gray-100 dark:bg-brand-gold-500 dark:text-gray-800'
							: 'bg-white/90 dark:bg-[#292c3c]/90 border-slate-200 dark:border-[#414559] text-brand-charcoal-400 dark:text-[#8caaee] hover:bg-white dark:hover:bg-[#292c3c]'}"
				>
					<Icon icon="mdi:hand-back-right-outline" width="0.85rem" />
				</button>
				<div class="my-0.5 h-px w-full bg-slate-200 dark:bg-[#414559]"></div>
				<button
					onclick={zoomIn}
					title="Zoom in"
					aria-label="Zoom in"
					class="cursor-pointer p-1.5 rounded-full bg-white/90 dark:bg-[#292c3c]/90
					       border border-slate-200 dark:border-[#414559]
					       text-brand-charcoal-400 dark:text-[#8caaee]
					       hover:bg-white dark:hover:bg-[#292c3c] transition-colors shadow-sm"
				>
					<Icon icon="mdi:plus" width="0.85rem" />
				</button>
				<button
					onclick={zoomOut}
					title="Zoom out"
					aria-label="Zoom out"
					class="cursor-pointer p-1.5 rounded-full bg-white/90 dark:bg-[#292c3c]/90
					       border border-slate-200 dark:border-[#414559]
					       text-brand-charcoal-400 dark:text-[#8caaee]
					       hover:bg-white dark:hover:bg-[#292c3c] transition-colors shadow-sm"
				>
					<Icon icon="mdi:minus" width="0.85rem" />
				</button>
				{#if zoom !== 1}
					<button
						onclick={zoomReset}
						title="Reset zoom"
						aria-label="Reset zoom"
						class="cursor-pointer p-1.5 rounded-full bg-white/90 dark:bg-[#292c3c]/90
						       border border-slate-200 dark:border-[#414559]
						       text-brand-charcoal-400 dark:text-[#8caaee]
						       hover:bg-white dark:hover:bg-[#292c3c] transition-colors shadow-sm"
					>
						<Icon icon="mdi:fit-to-page-outline" width="0.85rem" />
					</button>
				{/if}
			</div>
			{#if zoom !== 1}
				<span
					class="absolute bottom-3 left-3 z-20 text-[0.5625rem] font-semibold px-1.5 py-0.5
					       rounded-full bg-black/40 text-gray-100 backdrop-blur-sm
					       select-none pointer-events-none"
				>
					{Math.round(zoom * 100)}%
				</span>
			{/if}
		</div>

		<div
			class="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#232634]"
		>
			<span class="text-[0.6875rem] text-brand-charcoal-300 dark:text-[#838ba7]">
				Scroll to zoom · Drag empty space (or hold Space) to pan · Double-click text to edit
			</span>
			<div class="flex items-center gap-2">
				<button
					onclick={confirmInsert}
					class="cursor-pointer flex items-center gap-1.5 rounded-full bg-brand-gold-400 px-5 py-1.5 text-[0.6875rem] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 active:bg-brand-gold-600/90 transition-colors"
				>
					{editingKey ? 'Update drawing' : 'Insert drawing'}
				</button>
			</div>
		</div>

		<!-- Resize handles -->
		<!-- Only the floating panel resizes itself; a native window is resized by
		     its own frame. -->
		{#each standalone ? [] : resizeHandles as { cls, dir }}
			<div
				aria-hidden="true"
				class="resize-handle {cls}"
				onpointerdown={(e) => startResize(e, dir)}
			></div>
		{/each}
	</div>
{/if}

<style>
	.resize-handle {
		position: absolute;
		z-index: 20;
	}
	.resize-n {
		top: 0;
		left: 14px;
		right: 14px;
		height: 6px;
		cursor: n-resize;
	}
	.resize-s {
		bottom: 0;
		left: 14px;
		right: 14px;
		height: 6px;
		cursor: s-resize;
	}
	.resize-e {
		top: 14px;
		right: 0;
		bottom: 14px;
		width: 6px;
		cursor: e-resize;
	}
	.resize-w {
		top: 14px;
		left: 0;
		bottom: 14px;
		width: 6px;
		cursor: w-resize;
	}
	.resize-ne {
		top: 0;
		right: 0;
		width: 14px;
		height: 14px;
		cursor: ne-resize;
	}
	.resize-se {
		bottom: 0;
		right: 0;
		width: 20px;
		height: 20px;
		cursor: se-resize;
	}
	.resize-sw {
		bottom: 0;
		left: 0;
		width: 14px;
		height: 14px;
		cursor: sw-resize;
	}
	.resize-nw {
		top: 0;
		left: 0;
		width: 14px;
		height: 14px;
		cursor: nw-resize;
	}
	.resize-se::before {
		content: '';
		position: absolute;
		bottom: 12px;
		right: 12px;
		width: 5px;
		height: 5px;
		border-bottom: 1.5px solid rgba(130, 130, 130, 0.4);
		border-right: 1.5px solid rgba(130, 130, 130, 0.4);
		border-bottom-right-radius: 5px;
		pointer-events: none;
	}
	.resize-se::after {
		content: '';
		position: absolute;
		bottom: 8px;
		right: 8px;
		width: 9px;
		height: 9px;
		border-bottom: 1.5px solid rgba(130, 130, 130, 0.55);
		border-right: 1.5px solid rgba(130, 130, 130, 0.55);
		border-bottom-right-radius: 9px;
		pointer-events: none;
	}
</style>
