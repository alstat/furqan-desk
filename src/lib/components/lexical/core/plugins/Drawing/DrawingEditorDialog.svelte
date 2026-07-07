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
	import { openDrawingEditor } from './drawingEditorStore.js';

	const editor = getEditor();
	const activeEditor = getActiveEditor();

	// Header control button styling (matches the header's gold surface).
	const headerBtn =
		'flex h-6 w-6 items-center justify-center rounded-md text-brand-charcoal-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200 dark:hover:bg-[#51576d] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

	function portal(node: HTMLElement) {
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
		getCommands().FocusEditor.execute(editor);
	}

	// Register the shared opener so DrawingComponent double-clicks reuse this dialog.
	onMount(() => {
		openDrawingEditor.set((s, k) => open(s, k));
	});
	onDestroy(() => {
		openDrawingEditor.set(null);
		if (typeof window !== 'undefined') window.removeEventListener('pointermove', onDrag);
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
		}
		return out;
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
		const target = get(activeEditor) ?? editor;
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
</script>

<svelte:window onkeydown={onKeydown} />

{#if showModal}
	<div
		use:portal
		transition:fly={{ y: 8, duration: 160, opacity: 0 }}
		role="dialog"
		aria-modal="true"
		aria-label="Insert drawing"
		tabindex="-1"
		class="fixed flex flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
		style="left:{x}px; top:{y}px; width:{panelW}px; height:{panelH}px; z-index:{zIndex};"
		onpointerdown={() => {
			zIndex = bringToFront();
		}}
	>
		<DialogPanelHeader
			icon="mdi:draw"
			title={editingKey ? 'Edit drawing' : 'Insert drawing'}
			{isDragging}
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
					<div class="mx-1 h-4 w-px bg-brand-gold-300/60 dark:bg-[#51576d]"></div>
					<button class={headerBtn} title="Zoom out" aria-label="Zoom out" onclick={zoomOut}>
						<Icon icon="mdi:minus" width="1rem" />
					</button>
					<button
						class="min-w-11 rounded-md px-1 py-1 text-[11px] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5] hover:bg-brand-gold-200 dark:hover:bg-[#51576d] cursor-pointer"
						title="Reset zoom"
						onclick={zoomReset}
					>
						{Math.round(zoom * 100)}%
					</button>
					<button class={headerBtn} title="Zoom in" aria-label="Zoom in" onclick={zoomIn}>
						<Icon icon="mdi:plus" width="1rem" />
					</button>
				</div>
			{/snippet}
		</DialogPanelHeader>

		<DrawingToolbar
			{tool}
			{style}
			selected={selectedShape}
			setTool={(t) => (tool = t)}
			{setStyle}
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
		</div>

		<div
			class="flex items-center justify-between gap-2 px-4 py-2.5 border-t border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#232634]"
		>
			<span class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]">
				Scroll to zoom · Drag empty space (or hold Space) to pan · Double-click text to edit
			</span>
			<div class="flex items-center gap-2">
				<button
					onclick={close}
					class="cursor-pointer rounded-full px-4 py-1.5 text-[11px] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5] hover:bg-brand-sand-200 dark:hover:bg-[#414559] transition-colors"
				>
					Cancel
				</button>
				<button
					onclick={confirmInsert}
					class="cursor-pointer flex items-center gap-1.5 rounded-full bg-brand-gold-400 px-5 py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 active:bg-brand-gold-600/90 transition-colors"
				>
					{editingKey ? 'Update drawing' : 'Insert drawing'}
				</button>
			</div>
		</div>
	</div>
{/if}
