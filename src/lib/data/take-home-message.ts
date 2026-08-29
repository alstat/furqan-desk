// "Take-Home Message" history — frontend API.
//
// Every generated reflection (source label, the ayah-reference context sent
// to the model, and the raw structured result) is recorded in the
// `take_home_messages` table so users can browse, copy, export, or delete
// their past reflections. Mirrors `$lib/data/verse-of-day.ts`.

import { invoke } from "@tauri-apps/api/core";

/** One recorded take-home message entry. */
export interface TakeHomeMessageEntry {
    id: number;
    source_label: string;
    context: string;
    result: string;
    locale: string;
    created_at: string; // UTC, as stored by SQLite's datetime('now')
}

export interface TakeHomeMessageStorage {
    entries: number;
    bytes: number;
}

/** Record a freshly generated take-home message; resolves to the saved row. */
export function saveTakeHomeMessage(args: {
    sourceLabel: string;
    context: string;
    result: string;
    locale: string;
}): Promise<TakeHomeMessageEntry> {
    return invoke<TakeHomeMessageEntry>("save_take_home_message", {
        sourceLabel: args.sourceLabel,
        context: args.context,
        result: args.result,
        locale: args.locale,
    });
}

/** All recorded take-home messages, most recent first. */
export function fetchTakeHomeMessageHistory(): Promise<TakeHomeMessageEntry[]> {
    return invoke<TakeHomeMessageEntry[]>("get_take_home_message_history");
}

export function deleteTakeHomeMessageEntry(id: number): Promise<void> {
    return invoke("delete_take_home_message", { id });
}

export function clearTakeHomeMessageHistory(): Promise<void> {
    return invoke("clear_take_home_message_history");
}

/** Entry count and approximate bytes the history occupies in the user DB. */
export function fetchTakeHomeMessageStorage(): Promise<TakeHomeMessageStorage> {
    return invoke<TakeHomeMessageStorage>("get_take_home_message_storage");
}

/** Export the history as CSV into Downloads; resolves to the saved path. */
export function exportTakeHomeMessageHistory(): Promise<string> {
    return invoke<string>("export_take_home_message_history");
}
