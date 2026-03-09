import { invoke } from '@tauri-apps/api/core';
import type { Bookmark, LastRead, Highlight } from '$lib/types/bookmarks';
import { bookmarks, lastRead, highlights } from '$lib/stores/bookmarks.store';

// ── Bookmarks ────────────────────────────────────────────────────────────────

export async function loadBookmarks(): Promise<void> {
    const data = await invoke<Bookmark[]>('get_bookmarks');
    bookmarks.set(data);
}

export async function addBookmark(surah: number, ayah: number, note: string | null): Promise<Bookmark> {
    const bookmark = await invoke<Bookmark>('add_bookmark', { surah, ayah, note });
    bookmarks.update(list => [bookmark, ...list]);
    return bookmark;
}

export async function deleteBookmark(id: number): Promise<void> {
    await invoke('delete_bookmark', { id });
    bookmarks.update(list => list.filter(b => b.id !== id));
}

// ── Last read ────────────────────────────────────────────────────────────────

export async function loadLastRead(): Promise<void> {
    const data = await invoke<LastRead | null>('get_last_read');
    lastRead.set(data);
}

export async function setLastRead(surah: number, ayah: number): Promise<void> {
    await invoke('set_last_read', { surah, ayah });
    lastRead.set({ surah, ayah, updated_at: new Date().toISOString() });
}

// ── Highlights ───────────────────────────────────────────────────────────────

export async function loadHighlights(): Promise<void> {
    const data = await invoke<Highlight[]>('get_highlights');
    highlights.set(data);
}

export async function addHighlight(surah: number, ayah: number, text: string): Promise<Highlight> {
    const highlight = await invoke<Highlight>('add_highlight', { surah, ayah, text });
    highlights.update(list => [highlight, ...list]);
    return highlight;
}

export async function deleteHighlight(id: number): Promise<void> {
    await invoke('delete_highlight', { id });
    highlights.update(list => list.filter(h => h.id !== id));
}

// ── Helpers ──────────────────────────────────────────────────────────────────

export function formatDate(dateStr: string): string {
    try {
        const d = new Date(dateStr.replace(' ', 'T') + 'Z');
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
        return dateStr;
    }
}
