// "Verse of the Day" — frontend API.
//
// Selection lives in the Rust backend (src-tauri/src/commands.rs): a random
// per-machine seed (generated once and stored in the user DB) is mixed with
// the calendar day, so the verse is stable for the whole day on one machine
// but differs across machines/users. Each day's pick is recorded in the
// `verse_of_day` table (verse numbers only — the UI resolves the actual text)
// so users can browse, export, or delete their history. Muqattaʿāt verses
// (e.g. Alif Lām Mīm at 2:1) are excluded by the backend.

import { invoke } from "@tauri-apps/api/core";

export interface VerseRef {
    surah: number;
    ayah: number;
}

/** One recorded verse-of-the-day entry. */
export interface VerseOfDayEntry {
    day: string; // local calendar date, YYYY-MM-DD
    surah: number;
    ayah: number;
    shown_at: string;
}

export interface VerseOfDayStorage {
    entries: number;
    bytes: number;
}

/** localStorage key holding the YYYY-MM-DD on which the dialog last auto-opened. */
export const VERSE_OF_DAY_SEEN_KEY = "verseOfDayLastShown";

/** Local calendar date as YYYY-MM-DD, used to show the dialog once per day. */
export function localDateKey(date: Date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

/** Today's verse — picked and persisted by the backend on first call of the day. */
export function fetchVerseOfDay(date: Date = new Date()): Promise<VerseOfDayEntry> {
    return invoke<VerseOfDayEntry>("get_verse_of_day", { day: localDateKey(date) });
}

/** All recorded daily verses, most recent first. */
export function fetchVerseOfDayHistory(): Promise<VerseOfDayEntry[]> {
    return invoke<VerseOfDayEntry[]>("get_verse_of_day_history");
}

export function deleteVerseOfDayEntry(day: string): Promise<void> {
    return invoke("delete_verse_of_day", { day });
}

export function clearVerseOfDayHistory(): Promise<void> {
    return invoke("clear_verse_of_day_history");
}

/** Entry count and approximate bytes the history occupies in the user DB. */
export function fetchVerseOfDayStorage(): Promise<VerseOfDayStorage> {
    return invoke<VerseOfDayStorage>("get_verse_of_day_storage");
}

/** Export the history as CSV into Downloads; resolves to the saved path. */
export function exportVerseOfDayHistory(): Promise<string> {
    return invoke<string>("export_verse_of_day_history");
}

/** Arabic text + optional translation for one verse. */
export interface VerseText {
    surah: number;
    ayah: number;
    arabic: string;
    translation: string | null;
}

/** Batch-fetch Arabic (and a translation, when a translator is given) for individual verses. */
export function fetchVerseTexts(
    refs: VerseRef[],
    translatorId?: number,
): Promise<VerseText[]> {
    return invoke<VerseText[]>("get_verse_texts", {
        refs,
        translatorId: translatorId ?? null,
    });
}

/** Human-readable size, e.g. "1.2 KB". */
export function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
