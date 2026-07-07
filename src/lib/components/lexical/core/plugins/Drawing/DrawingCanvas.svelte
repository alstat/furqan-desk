<script lang="ts">
	import {
		sceneToSvg,
		shapeBounds,
		translateShape,
		resizeShape,
		createShapeFromBox,
		createPathShape,
		scaleShapeInFrame,
		shapeAnchors,
		isConnectable,
		syncConnections,
		connectorPolyline,
		elbowMidSegment,
		type Scene,
		type Shape,
		type Bounds,
		type DrawTool,
		type StyleDefaults,
		type TextShape,
		type AnchorId,
		type Connection
	} from './drawingScene.js';

	interface Props {
		scene: Scene;
		selectedIds: string[];
		tool: DrawTool;
		style: StyleDefaults;
		zoom: number;
		pan: { x: number; y: number };
		onSceneChange: (next: Scene) => void; // live update, no history
		requestHistory: () => void; // snapshot current scene before first mutation
		onSelect: (ids: string[]) => void;
		onToolDone: () => void; // reset tool back to select
		onViewChange: (zoom: number, pan: { x: number; y: number }) => void;
		onEditingChange: (editing: boolean) => void;
	}

	let {
		scene,
		selectedIds,
		tool,
		style,
		zoom,
		pan,
		onSceneChange,
		requestHistory,
		onSelect,
		onToolDone,
		onViewChange,
		onEditingChange
	}: Props = $props();

	let viewportEl: HTMLDivElement | null = $state(null);

	type Mode = 'idle' | 'create' | 'move' | 'resize' | 'groupResize' | 'pan' | 'pen' | 'marquee';
	const GROUP_PAD = 4; // px padding of the group box beyond the union bounds
	const CORNER_DIRS = ['nw', 'ne', 'se', 'sw'] as const;
	let mode: Mode = 'idle';
	let dirtied = false;
	let activeId: string | null = null;
	let createStart = { x: 0, y: 0 };
	let moveStartScene = { x: 0, y: 0 };
	let origShape: Shape | null = null;
	let origBounds: Bounds = { x: 0, y: 0, w: 0, h: 0 };
	let resizeDir = '';
	let panStart = { x: 0, y: 0, px: 0, py: 0 };
	let penPoints: number[] = [];
	// Group-move snapshot and rubber-band marquee state.
	let moveOrig: Shape[] = [];
	let marqueeStart = { x: 0, y: 0 };
	let marqueeCur = $state({ x: 0, y: 0 });
	let marqueeActive = $state(false);
	let marqueeAdditive = false;

	// Text editing overlay
	let editingId = $state<string | null>(null);
	let editValue = $state('');

	// Connection-anchor UI shown while dragging a line/arrow endpoint.
	let anchorTargetId = $state<string | null>(null);
	let snappedAnchor = $state<AnchorId | null>(null);
	const SNAP_PX = 16;

	const HANDLE_DIRS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;
	type HandleDir = (typeof HANDLE_DIRS)[number];

	let selectedShapes = $derived(scene.shapes.filter((s) => selectedIds.includes(s.id)));
	// Handles/resize/endpoints only make sense for a single selection.
	let singleShape = $derived(selectedIds.length === 1 ? (selectedShapes[0] ?? null) : null);
	let isLinearSel = $derived(
		!!singleShape && (singleShape.type === 'line' || singleShape.type === 'arrow')
	);
	// Full <svg> markup for the whole scene, recomputed on every scene change.
	let sceneSvg = $derived(sceneToSvg(scene));

	// ── coordinate transforms ──────────────────────────────────────────────
	function screenToScene(clientX: number, clientY: number) {
		const rect = viewportEl!.getBoundingClientRect();
		return { x: (clientX - rect.left - pan.x) / zoom, y: (clientY - rect.top - pan.y) / zoom };
	}
	function boundsToScreen(b: Bounds): Bounds {
		return { x: pan.x + b.x * zoom, y: pan.y + b.y * zoom, w: b.w * zoom, h: b.h * zoom };
	}
	function handleCenters(b: Bounds): Record<HandleDir, { x: number; y: number }> {
		const s = boundsToScreen(b);
		return {
			nw: { x: s.x, y: s.y },
			n: { x: s.x + s.w / 2, y: s.y },
			ne: { x: s.x + s.w, y: s.y },
			e: { x: s.x + s.w, y: s.y + s.h / 2 },
			se: { x: s.x + s.w, y: s.y + s.h },
			s: { x: s.x + s.w / 2, y: s.y + s.h },
			sw: { x: s.x, y: s.y + s.h },
			w: { x: s.x, y: s.y + s.h / 2 }
		};
	}

	// ── hit testing (scene space) ───────────────────────────────────────────
	function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
		const dx = bx - ax,
			dy = by - ay;
		const len2 = dx * dx + dy * dy;
		let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
		t = Math.max(0, Math.min(1, t));
		const cx = ax + t * dx,
			cy = ay + t * dy;
		return Math.hypot(px - cx, py - cy);
	}
	function pointInShape(p: { x: number; y: number }, shape: Shape): boolean {
		const thresh = Math.max(6, shape.strokeWidth + 4) / zoom;
		if (shape.type === 'line' || shape.type === 'arrow') {
			// Test each segment of the routed connector so elbow/curved bends are
			// clickable, not just the straight chord between endpoints.
			const pts = connectorPolyline(shape);
			for (let i = 0; i < pts.length - 2; i += 2) {
				if (distToSeg(p.x, p.y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) <= thresh) return true;
			}
			return false;
		}
		if (shape.type === 'path') {
			const pts = shape.points;
			for (let i = 0; i < pts.length - 2; i += 2) {
				if (distToSeg(p.x, p.y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]) <= thresh) return true;
			}
			return false;
		}
		const b = shapeBounds(shape);
		return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
	}
	function hitTest(p: { x: number; y: number }): Shape | null {
		for (let i = scene.shapes.length - 1; i >= 0; i--) {
			if (pointInShape(p, scene.shapes[i])) return scene.shapes[i];
		}
		return null;
	}
	// Endpoint screen positions for a line/arrow shape.
	function endpointScreens(shape: Shape) {
		const s = shape as Extract<Shape, { x1: number }>;
		return {
			p1: { x: pan.x + s.x1 * zoom, y: pan.y + s.y1 * zoom },
			p2: { x: pan.x + s.x2 * zoom, y: pan.y + s.y2 * zoom }
		};
	}
	// Screen position of an elbow connector's adjustable mid-segment handle.
	function elbowMidScreen(shape: Shape): { x: number; y: number } | null {
		if (shape.type !== 'line') return null;
		const seg = elbowMidSegment(shape);
		if (!seg) return null;
		return {
			x: pan.x + ((seg.a[0] + seg.b[0]) / 2) * zoom,
			y: pan.y + ((seg.a[1] + seg.b[1]) / 2) * zoom
		};
	}
	// Returns a box handle direction, 'p1'/'p2' for a linear endpoint, or null.
	function handleAt(clientX: number, clientY: number): string | null {
		if (!singleShape) return null;
		const rect = viewportEl!.getBoundingClientRect();
		const x = clientX - rect.left,
			y = clientY - rect.top;
		if (singleShape.type === 'line' || singleShape.type === 'arrow') {
			const e = endpointScreens(singleShape);
			if (Math.hypot(x - e.p1.x, y - e.p1.y) <= 9) return 'p1';
			if (Math.hypot(x - e.p2.x, y - e.p2.y) <= 9) return 'p2';
			const m = elbowMidScreen(singleShape);
			if (m && Math.hypot(x - m.x, y - m.y) <= 9) return 'emid';
			return null;
		}
		const centers = handleCenters(shapeBounds(singleShape));
		for (const d of HANDLE_DIRS) {
			if (Math.hypot(x - centers[d].x, y - centers[d].y) <= 8) return d;
		}
		return null;
	}

	// Union bounding box of a set of shapes (scene space).
	function unionBounds(shapes: Shape[]): Bounds {
		let minX = Infinity,
			minY = Infinity,
			maxX = -Infinity,
			maxY = -Infinity;
		for (const s of shapes) {
			const b = shapeBounds(s);
			minX = Math.min(minX, b.x);
			minY = Math.min(minY, b.y);
			maxX = Math.max(maxX, b.x + b.w);
			maxY = Math.max(maxY, b.y + b.h);
		}
		return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
	}
	// Padded group-box corner positions in screen space.
	function groupCornerScreens(): Record<(typeof CORNER_DIRS)[number], { x: number; y: number }> | null {
		if (selectedShapes.length < 2) return null;
		const b = boundsToScreen(unionBounds(selectedShapes));
		const x = b.x - GROUP_PAD,
			y = b.y - GROUP_PAD,
			w = b.w + GROUP_PAD * 2,
			h = b.h + GROUP_PAD * 2;
		return { nw: { x, y }, ne: { x: x + w, y }, se: { x: x + w, y: y + h }, sw: { x, y: y + h } };
	}
	function groupHandleAt(clientX: number, clientY: number): string | null {
		const corners = groupCornerScreens();
		if (!corners) return null;
		const rect = viewportEl!.getBoundingClientRect();
		const x = clientX - rect.left,
			y = clientY - rect.top;
		for (const d of CORNER_DIRS) {
			if (Math.hypot(x - corners[d].x, y - corners[d].y) <= 9) return d;
		}
		return null;
	}

	// ── scene mutation ──────────────────────────────────────────────────────
	function mutate(next: Scene) {
		if (!dirtied) {
			requestHistory();
			dirtied = true;
		}
		// Keep connected line/arrow endpoints glued to their shapes.
		onSceneChange(syncConnections(next));
	}

	// Nearest connectable shape whose (padded) bounds contain a scene point.
	function hitTestConnectable(p: { x: number; y: number }, excludeId: string): Shape | null {
		const pad = 6 / zoom;
		for (let i = scene.shapes.length - 1; i >= 0; i--) {
			const s = scene.shapes[i];
			if (s.id === excludeId || !isConnectable(s)) continue;
			const b = shapeBounds(s);
			if (p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad)
				return s;
		}
		return null;
	}

	// Resolve where a dragged endpoint should land: snapped to the nearest shape
	// anchor within SNAP_PX (with a connection ref), else the raw pointer point.
	// Also reports which shape's anchors to highlight.
	function snapEndpoint(clientX: number, clientY: number, excludeId: string) {
		const p = screenToScene(clientX, clientY);
		const rect = viewportEl!.getBoundingClientRect();
		const sx = clientX - rect.left,
			sy = clientY - rect.top;
		let best: { shapeId: string; anchor: AnchorId; x: number; y: number } | null = null;
		let bestDist = SNAP_PX;
		for (let i = scene.shapes.length - 1; i >= 0; i--) {
			const s = scene.shapes[i];
			if (s.id === excludeId || !isConnectable(s)) continue;
			for (const a of shapeAnchors(s)) {
				const d = Math.hypot(sx - (pan.x + a.x * zoom), sy - (pan.y + a.y * zoom));
				if (d <= bestDist) {
					bestDist = d;
					best = { shapeId: s.id, anchor: a.id, x: a.x, y: a.y };
				}
			}
		}
		if (best) {
			return {
				x: best.x,
				y: best.y,
				ref: { shapeId: best.shapeId, anchor: best.anchor } as Connection,
				targetId: best.shapeId,
				anchor: best.anchor as AnchorId | null
			};
		}
		const hov = hitTestConnectable(p, excludeId);
		return { x: p.x, y: p.y, ref: null as Connection | null, targetId: hov ? hov.id : null, anchor: null as AnchorId | null };
	}
	function replaceShape(id: string, shape: Shape) {
		mutate({ ...scene, shapes: scene.shapes.map((s) => (s.id === id ? shape : s)) });
	}
	function addShape(shape: Shape) {
		mutate({ ...scene, shapes: [...scene.shapes, shape] });
	}

	function geometryFromDrag(base: Shape, start: { x: number; y: number }, cur: { x: number; y: number }): Shape {
		if (base.type === 'line' || base.type === 'arrow') {
			return { ...base, x1: start.x, y1: start.y, x2: cur.x, y2: cur.y };
		}
		const box = {
			x: Math.min(start.x, cur.x),
			y: Math.min(start.y, cur.y),
			w: Math.abs(cur.x - start.x),
			h: Math.abs(cur.y - start.y)
		};
		const rebuilt = createShapeFromBox(tool, style, box);
		return rebuilt ? { ...rebuilt, id: base.id } : base;
	}

	function nextBoundsForResize(dir: string, dx: number, dy: number): Bounds {
		let { x, y, w, h } = origBounds;
		if (dir.includes('e')) w += dx;
		if (dir.includes('s')) h += dy;
		if (dir.includes('w')) {
			x += dx;
			w -= dx;
		}
		if (dir.includes('n')) {
			y += dy;
			h -= dy;
		}
		const MIN = 5;
		if (w < MIN) w = MIN;
		if (h < MIN) h = MIN;
		return { x, y, w, h };
	}

	// ── pointer handlers ────────────────────────────────────────────────────
	function onPointerDown(e: PointerEvent) {
		if (editingId) commitText();
		viewportEl!.setPointerCapture(e.pointerId);
		dirtied = false;
		const p = screenToScene(e.clientX, e.clientY);

		// Pan: hand tool, space held, or middle button.
		if (tool === 'pan' || spaceDown || e.button === 1) {
			mode = 'pan';
			panStart = { x: pan.x, y: pan.y, px: e.clientX, py: e.clientY };
			return;
		}

		if (tool === 'select') {
			// Group-resize corners take priority when several shapes are selected.
			if (selectedShapes.length > 1) {
				const gh = groupHandleAt(e.clientX, e.clientY);
				if (gh) {
					mode = 'groupResize';
					resizeDir = gh;
					origBounds = unionBounds(selectedShapes);
					moveOrig = [...selectedShapes];
					moveStartScene = p;
					return;
				}
			}
			const h = handleAt(e.clientX, e.clientY);
			if (h && singleShape) {
				mode = 'resize';
				resizeDir = h;
				origShape = singleShape;
				origBounds = shapeBounds(singleShape);
				moveStartScene = p;
				return;
			}
			const hit = hitTest(p);
			if (hit) {
				if (e.shiftKey) {
					// Toggle this shape in/out of the selection; no move.
					const next = selectedIds.includes(hit.id)
						? selectedIds.filter((i) => i !== hit.id)
						: [...selectedIds, hit.id];
					onSelect(next);
					mode = 'idle';
					return;
				}
				// Clicking an already-selected shape keeps the group; otherwise
				// select just this one. Either way, begin moving the selection.
				const ids = selectedIds.includes(hit.id) ? selectedIds : [hit.id];
				if (!selectedIds.includes(hit.id)) onSelect(ids);
				mode = 'move';
				moveOrig = scene.shapes.filter((s) => ids.includes(s.id));
				moveStartScene = p;
			} else {
				// Empty space: start a rubber-band marquee (Shift adds to selection).
				mode = 'marquee';
				marqueeActive = true;
				marqueeAdditive = e.shiftKey;
				marqueeStart = p;
				marqueeCur = p;
				if (!e.shiftKey) onSelect([]);
			}
			return;
		}

		if (tool === 'pen') {
			penPoints = [p.x, p.y];
			const path = createPathShape(style, [...penPoints]);
			activeId = path.id;
			mode = 'pen';
			addShape(path);
			return;
		}

		// Shape / text tools → create by drag.
		const created = createShapeFromBox(tool, style, { x: p.x, y: p.y, w: 0, h: 0 });
		if (!created) return;
		activeId = created.id;
		createStart = p;
		mode = 'create';
		// A new line/arrow can start bound to a shape anchor.
		if (created.type === 'line' || created.type === 'arrow') {
			const snap = snapEndpoint(e.clientX, e.clientY, created.id);
			created.x1 = snap.x;
			created.y1 = snap.y;
			created.x2 = snap.x;
			created.y2 = snap.y;
			created.startRef = snap.ref;
			createStart = { x: snap.x, y: snap.y };
		}
		addShape(created);
	}

	function onPointerMove(e: PointerEvent) {
		if (mode === 'idle') return;
		const p = screenToScene(e.clientX, e.clientY);
		if (mode === 'pan') {
			onViewChange(zoom, {
				x: panStart.x + (e.clientX - panStart.px),
				y: panStart.y + (e.clientY - panStart.py)
			});
			return;
		}
		if (mode === 'create' && activeId) {
			const base = scene.shapes.find((s) => s.id === activeId);
			if (base) {
				if (base.type === 'line' || base.type === 'arrow') {
					const snap = snapEndpoint(e.clientX, e.clientY, activeId);
					anchorTargetId = snap.targetId;
					snappedAnchor = snap.anchor;
					replaceShape(activeId, { ...base, x2: snap.x, y2: snap.y, endRef: snap.ref });
				} else {
					replaceShape(activeId, geometryFromDrag(base, createStart, p));
				}
			}
			return;
		}
		if (mode === 'pen' && activeId) {
			penPoints.push(p.x, p.y);
			const base = scene.shapes.find((s) => s.id === activeId);
			if (base && base.type === 'path') {
				replaceShape(activeId, { ...base, points: [...penPoints] });
			}
			return;
		}
		if (mode === 'marquee') {
			marqueeCur = p;
			return;
		}
		if (mode === 'move' && moveOrig.length) {
			const dx = p.x - moveStartScene.x,
				dy = p.y - moveStartScene.y;
			const moved = new Map(moveOrig.map((s) => [s.id, translateShape(s, dx, dy)]));
			mutate({ ...scene, shapes: scene.shapes.map((s) => moved.get(s.id) ?? s) });
			return;
		}
		if (mode === 'groupResize' && moveOrig.length) {
			const nb = nextBoundsForResize(resizeDir, p.x - moveStartScene.x, p.y - moveStartScene.y);
			const scaled = new Map(moveOrig.map((s) => [s.id, scaleShapeInFrame(s, origBounds, nb)]));
			mutate({ ...scene, shapes: scene.shapes.map((s) => scaled.get(s.id) ?? s) });
			return;
		}
		if (mode === 'resize' && origShape) {
			// Drag an elbow connector's middle segment across to dodge overlaps.
			// Stored as a signed delta from the segment's auto-centred position.
			if (resizeDir === 'emid') {
				if (origShape.type === 'line') {
					const seg = elbowMidSegment(origShape);
					if (seg) {
						const cross = seg.axis === 'x' ? p.x : p.y;
						replaceShape(origShape.id, {
							...origShape,
							elbowMid: cross - seg.auto,
							elbowMidAxis: seg.axis
						});
					}
				}
				return;
			}
			// Line/arrow endpoints move freely and can snap to shape anchors;
			// box shapes resize by bounds.
			if (resizeDir === 'p1' || resizeDir === 'p2') {
				if (origShape.type === 'line' || origShape.type === 'arrow') {
					const snap = snapEndpoint(e.clientX, e.clientY, origShape.id);
					anchorTargetId = snap.targetId;
					snappedAnchor = snap.anchor;
					const upd =
						resizeDir === 'p1'
							? { ...origShape, x1: snap.x, y1: snap.y, startRef: snap.ref }
							: { ...origShape, x2: snap.x, y2: snap.y, endRef: snap.ref };
					replaceShape(origShape.id, upd);
				}
				return;
			}
			const nb = nextBoundsForResize(resizeDir, p.x - moveStartScene.x, p.y - moveStartScene.y);
			replaceShape(origShape.id, resizeShape(origShape, origBounds, nb));
			return;
		}
	}

	function onPointerUp(e: PointerEvent) {
		try {
			viewportEl!.releasePointerCapture(e.pointerId);
		} catch {
			/* noop */
		}
		if (mode === 'create' && activeId) {
			const base = scene.shapes.find((s) => s.id === activeId);
			if (base) {
				const b = shapeBounds(base);
				// A click (no real drag) → drop a default-sized shape.
				if (b.w < 4 && b.h < 4) {
					const def = createShapeFromBox(tool, style, {
						x: createStart.x,
						y: createStart.y,
						w: tool === 'text' ? 180 : 140,
						h: tool === 'text' ? Math.round(style.fontSize * 1.6) : 100
					});
					if (def) replaceShape(activeId, { ...def, id: activeId });
				}
				onSelect([activeId]);
				if (tool === 'text') startEdit(activeId);
			}
			onToolDone();
		} else if (mode === 'pen' && activeId) {
			onSelect([activeId]);
			onToolDone();
		} else if (mode === 'marquee') {
			const rect = marqueeSceneRect();
			const hitIds = scene.shapes.filter((s) => rectsIntersect(shapeBounds(s), rect)).map((s) => s.id);
			const finalIds = marqueeAdditive
				? Array.from(new Set([...selectedIds, ...hitIds]))
				: hitIds;
			onSelect(finalIds);
		}
		mode = 'idle';
		activeId = null;
		origShape = null;
		moveOrig = [];
		marqueeActive = false;
		anchorTargetId = null;
		snappedAnchor = null;
	}

	function marqueeSceneRect(): Bounds {
		return {
			x: Math.min(marqueeStart.x, marqueeCur.x),
			y: Math.min(marqueeStart.y, marqueeCur.y),
			w: Math.abs(marqueeCur.x - marqueeStart.x),
			h: Math.abs(marqueeCur.y - marqueeStart.y)
		};
	}
	function rectsIntersect(a: Bounds, b: Bounds): boolean {
		return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
	}

	function onDblClick(e: MouseEvent) {
		const p = screenToScene(e.clientX, e.clientY);
		const hit = hitTest(p);
		if (hit && hit.type === 'text') startEdit(hit.id);
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		const rect = viewportEl!.getBoundingClientRect();
		const mx = e.clientX - rect.left,
			my = e.clientY - rect.top;
		const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
		const nz = Math.max(0.1, Math.min(8, zoom * factor));
		// Keep the point under the cursor fixed.
		const nx = mx - ((mx - pan.x) * nz) / zoom;
		const ny = my - ((my - pan.y) * nz) / zoom;
		onViewChange(nz, { x: nx, y: ny });
	}

	// ── text editing ────────────────────────────────────────────────────────
	function startEdit(id: string) {
		const shape = scene.shapes.find((s) => s.id === id);
		if (!shape || shape.type !== 'text') return;
		editingId = id;
		editValue = shape.text;
		onEditingChange(true);
		onSelect([id]);
	}
	function commitText() {
		if (!editingId) return;
		const id = editingId;
		const shape = scene.shapes.find((s) => s.id === id) as TextShape | undefined;
		editingId = null;
		onEditingChange(false);
		if (!shape) return;
		if (editValue.trim() === '') {
			// remove empty text box
			requestHistory();
			onSceneChange({ ...scene, shapes: scene.shapes.filter((s) => s.id !== id) });
			return;
		}
		if (editValue !== shape.text) {
			requestHistory();
			onSceneChange({
				...scene,
				shapes: scene.shapes.map((s) => (s.id === id ? { ...(s as TextShape), text: editValue } : s))
			});
		}
	}
	function editingShape(): TextShape | null {
		if (!editingId) return null;
		const s = scene.shapes.find((sh) => sh.id === editingId);
		return s && s.type === 'text' ? s : null;
	}

	// ── space-to-pan tracking ────────────────────────────────────────────────
	let spaceDown = $state(false);
	function onKeyDown(e: KeyboardEvent) {
		if (e.code === 'Space' && !editingId && !(e.target instanceof HTMLTextAreaElement)) {
			spaceDown = true;
		}
	}
	function onKeyUp(e: KeyboardEvent) {
		if (e.code === 'Space') spaceDown = false;
	}

	// Focus the text-edit box as soon as it appears so typing lands in it.
	function focusOnMount(node: HTMLTextAreaElement) {
		requestAnimationFrame(() => {
			node.focus();
			const len = node.value.length;
			try {
				node.setSelectionRange(len, len);
			} catch {
				/* noop */
			}
		});
	}

	let editScreen = $derived.by(() => {
		const s = editingShape();
		if (!s) return null;
		return boundsToScreen(shapeBounds(s));
	});
	let marqueeScreen = $derived(
		marqueeActive
			? boundsToScreen({
					x: Math.min(marqueeStart.x, marqueeCur.x),
					y: Math.min(marqueeStart.y, marqueeCur.y),
					w: Math.abs(marqueeCur.x - marqueeStart.x),
					h: Math.abs(marqueeCur.y - marqueeStart.y)
				})
			: null
	);
	// Combined bounding box around the whole multi-selection.
	let groupBoundsScreen = $derived(
		selectedShapes.length >= 2 ? boundsToScreen(unionBounds(selectedShapes)) : null
	);
	let cursorClass = $derived(
		spaceDown || tool === 'pan'
			? 'cursor-grab'
			: tool === 'select'
				? 'cursor-default'
				: 'cursor-crosshair'
	);
</script>

<svelte:window onkeydown={onKeyDown} onkeyup={onKeyUp} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	bind:this={viewportEl}
	class="drawing-canvas-viewport {cursorClass}"
	onpointerdown={onPointerDown}
	onpointermove={onPointerMove}
	onpointerup={onPointerUp}
	ondblclick={onDblClick}
	onwheel={onWheel}
>
	<div
		class="drawing-stage"
		style="transform: translate({pan.x}px, {pan.y}px) scale({zoom}); transform-origin: 0 0;"
	>
		<div class="drawing-page" style="width:{scene.width}px; height:{scene.height}px;">
			{@html sceneSvg}
		</div>
	</div>

	<!-- Selection chrome (screen space, constant handle size) -->
	{#if !editingId}
		{#if singleShape}
			{#if isLinearSel}
				<!-- Line/arrow: draggable endpoints, no bounding box -->
				{@const e = endpointScreens(singleShape)}
				<div class="sel-endpoint" style="left:{e.p1.x}px; top:{e.p1.y}px;"></div>
				<div class="sel-endpoint" style="left:{e.p2.x}px; top:{e.p2.y}px;"></div>
				<!-- Elbow: handle to slide the middle segment across -->
				{@const m = elbowMidScreen(singleShape)}
				{#if m}
					{@const mseg = singleShape.type === 'line' ? elbowMidSegment(singleShape) : null}
					<div
						class="sel-midhandle"
						style="left:{m.x}px; top:{m.y}px; cursor:{mseg?.axis === 'y'
							? 'ns-resize'
							: 'ew-resize'};"
					></div>
				{/if}
			{:else}
				{@const sb = boundsToScreen(shapeBounds(singleShape))}
				<div
					class="sel-outline"
					style="left:{sb.x}px; top:{sb.y}px; width:{sb.w}px; height:{sb.h}px;"
				></div>
				{@const centers = handleCenters(shapeBounds(singleShape))}
				{#each HANDLE_DIRS as d (d)}
					<div class="sel-handle" style="left:{centers[d].x}px; top:{centers[d].y}px;"></div>
				{/each}
			{/if}
		{:else if selectedShapes.length > 1}
			<!-- Multiple selected: a big box around the whole group, plus a faint
			     dashed outline on each member. -->
			{#each selectedShapes as s (s.id)}
				{@const sb = boundsToScreen(shapeBounds(s))}
				<div
					class="sel-outline multi"
					style="left:{sb.x}px; top:{sb.y}px; width:{sb.w}px; height:{sb.h}px;"
				></div>
			{/each}
			{#if groupBoundsScreen}
				{@const g = groupBoundsScreen}
				<div
					class="sel-group-outline"
					style="left:{g.x - GROUP_PAD}px; top:{g.y - GROUP_PAD}px; width:{g.w +
						GROUP_PAD * 2}px; height:{g.h + GROUP_PAD * 2}px;"
				></div>
				{@const corners = groupCornerScreens()}
				{#if corners}
					{#each CORNER_DIRS as d (d)}
						<div class="sel-handle" style="left:{corners[d].x}px; top:{corners[d].y}px;"></div>
					{/each}
				{/if}
			{/if}
		{/if}
	{/if}

	<!-- Rubber-band marquee -->
	{#if marqueeScreen}
		<div
			class="marquee-rect"
			style="left:{marqueeScreen.x}px; top:{marqueeScreen.y}px; width:{marqueeScreen.w}px; height:{marqueeScreen.h}px;"
		></div>
	{/if}

	<!-- Connection anchors shown while dragging a line/arrow endpoint -->
	{#if anchorTargetId}
		{@const tShape = scene.shapes.find((s) => s.id === anchorTargetId)}
		{#if tShape}
			{#each shapeAnchors(tShape) as a (a.id)}
				<div
					class="anchor-dot {snappedAnchor === a.id ? 'snapped' : ''}"
					style="left:{pan.x + a.x * zoom}px; top:{pan.y + a.y * zoom}px;"
				></div>
			{/each}
		{/if}
	{/if}

	<!-- Text editing overlay -->
	{#if editScreen && editingShape()}
		{@const es = editingShape()}
		<textarea
			class="text-edit"
			use:focusOnMount
			bind:value={editValue}
			onblur={commitText}
			onpointerdown={(e) => e.stopPropagation()}
			ondblclick={(e) => e.stopPropagation()}
			onkeydown={(e) => {
				if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
					e.preventDefault();
					commitText();
				}
				e.stopPropagation();
			}}
			style="left:{editScreen.x}px; top:{editScreen.y}px; width:{editScreen.w}px; height:{editScreen.h}px;
				font-size:{(es?.fontSize ?? 20) * zoom}px; font-family:{es?.fontFamily};
				color:{es?.fill}; text-align:{es?.align};
				font-weight:{es?.bold ? 'bold' : 'normal'}; font-style:{es?.italic ? 'italic' : 'normal'};"
		></textarea>
	{/if}
</div>

<style>
	.drawing-canvas-viewport {
		position: relative;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background:
			repeating-conic-gradient(#0000000a 0% 25%, transparent 0% 50%) 50% / 20px 20px;
		touch-action: none;
	}
	:global(.dark) .drawing-canvas-viewport {
		background:
			repeating-conic-gradient(#ffffff0a 0% 25%, transparent 0% 50%) 50% / 20px 20px;
	}
	.drawing-stage {
		position: absolute;
		left: 0;
		top: 0;
	}
	.drawing-page {
		position: absolute;
		left: 0;
		top: 0;
		box-shadow: 0 2px 18px rgba(0, 0, 0, 0.18);
	}
	.drawing-page :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
	}
	.sel-outline {
		position: absolute;
		border: 1.5px solid #4c8bf5;
		pointer-events: none;
		box-sizing: border-box;
	}
	.sel-outline.multi {
		border-style: dashed;
		border-color: rgba(76, 139, 245, 0.55);
	}
	.sel-group-outline {
		position: absolute;
		border: 1.5px solid #4c8bf5;
		border-radius: 3px;
		background: rgba(76, 139, 245, 0.06);
		pointer-events: none;
		box-sizing: border-box;
	}
	.marquee-rect {
		position: absolute;
		border: 1px solid #4c8bf5;
		background: rgba(76, 139, 245, 0.12);
		pointer-events: none;
		box-sizing: border-box;
	}
	.sel-handle {
		position: absolute;
		width: 10px;
		height: 10px;
		margin-left: -5px;
		margin-top: -5px;
		background: #fff;
		border: 1.5px solid #4c8bf5;
		border-radius: 2px;
		pointer-events: none;
	}
	.sel-endpoint {
		position: absolute;
		width: 12px;
		height: 12px;
		margin-left: -6px;
		margin-top: -6px;
		background: #fff;
		border: 2px solid #4c8bf5;
		border-radius: 50%;
		pointer-events: none;
	}
	.sel-midhandle {
		position: absolute;
		width: 12px;
		height: 12px;
		margin-left: -6px;
		margin-top: -6px;
		background: #4c8bf5;
		border: 1.5px solid #fff;
		border-radius: 3px;
		pointer-events: none;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
	}
	.anchor-dot {
		position: absolute;
		width: 11px;
		height: 11px;
		margin-left: -5.5px;
		margin-top: -5.5px;
		background: #fff;
		border: 2px solid var(--color-brand-gold-500);
		border-radius: 50%;
		pointer-events: none;
		box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-brand-gold-500) 22%, transparent);
	}
	.anchor-dot.snapped {
		background: var(--color-brand-gold-500);
		transform: scale(1.25);
	}
	.text-edit {
		position: absolute;
		border: 1px dashed #4c8bf5;
		background: rgba(255, 255, 255, 0.85);
		outline: none;
		resize: none;
		padding: 0;
		margin: 0;
		line-height: 1.25;
		overflow: hidden;
		box-sizing: border-box;
	}
</style>
