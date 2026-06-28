import { writable } from "svelte/store";
import {
    type Reference,
    ensureCiteKeys,
    newRefId,
} from "$lib/utils/references";

const STORAGE_KEY = "references-library";

function loadLibrary(): Reference[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        // Tolerate older/partial shapes by filling defaults.
        return parsed.map((r) => ({
            id: r.id || newRefId(),
            citeKey: r.citeKey || "",
            kind: r.kind || "misc",
            title: r.title || "",
            authors: Array.isArray(r.authors) ? r.authors : [],
            year: r.year || "",
            container: r.container || "",
            doi: r.doi || "",
            url: r.url || "",
            identifier: r.identifier || "",
            extra: r.extra && typeof r.extra === "object" ? r.extra : {},
        })) as Reference[];
    } catch {
        return [];
    }
}

/** Whether the References dialog is open. */
export const referencesOpen = writable(false);

/** Bounding rect of the References sidebar button, so the panel can open
 *  anchored next to it (mirrors the Table of Contents panel). */
export const referencesAnchorRect = writable<DOMRect | null>(null);

/** The persisted reference library (global, survives restarts). */
export const references = writable<Reference[]>(loadLibrary());

references.subscribe((list) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
        /* ignore quota / unavailable storage */
    }
});

/** Append references, skipping ones that are clear duplicates. */
export function addReferences(incoming: Reference[]): number {
    if (!incoming.length) return 0;
    let added = 0;
    references.update((list) => {
        const next = [...list];
        for (const ref of incoming) {
            const dup = next.some((r) => isSameReference(r, ref));
            if (dup) continue;
            next.push(ref);
            added += 1;
        }
        return ensureCiteKeys(next);
    });
    return added;
}

export function removeReference(id: string): void {
    references.update((list) => list.filter((r) => r.id !== id));
}

export function clearReferences(): void {
    references.set([]);
}

export function replaceReferences(next: Reference[]): void {
    references.set(ensureCiteKeys(next));
}

function isSameReference(a: Reference, b: Reference): boolean {
    if (a.doi && b.doi) return a.doi.toLowerCase() === b.doi.toLowerCase();
    if (a.identifier && b.identifier && a.identifier === b.identifier)
        return true;
    if (a.title && b.title)
        return (
            a.title.toLowerCase().trim() === b.title.toLowerCase().trim() &&
            a.year === b.year
        );
    return false;
}
