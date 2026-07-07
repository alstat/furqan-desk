import { writable } from 'svelte/store';
import type { Scene } from './drawingScene.js';

// The DrawingEditorDialog registers its `open` handler here on mount so any
// DrawingComponent can reopen the (single, shared) editor when its drawing is
// double-clicked. `scene`/`nodeKey` null → a fresh "Insert drawing".
export type OpenDrawingEditor = (scene: Scene | null, nodeKey: string | null) => void;

export const openDrawingEditor = writable<OpenDrawingEditor | null>(null);
