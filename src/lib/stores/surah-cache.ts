/**
 * Memoization for the per-surah datasets behind the Parchment view.
 *
 * Morphology, translation, transliteration, word-by-word and tafsir are each
 * fetched with their own `invoke` whenever the surah — or the chosen
 * translator, tafsir author or word-by-word language — changes. None of it was
 * remembered, so paging back to a surah you just left re-ran every query and
 * re-crossed the IPC boundary for data the app had already had.
 *
 * The underlying queries are all indexed and quick; what this avoids is the
 * work stacked on top of them. Assembling al-Baqarah's morphology alone is
 * ~27 ms of parsing across 10,243 rows before serialization, and word-by-word
 * for the same surah is several thousand more.
 *
 * The dataset is a read-only bundled database, so a cached answer can never go
 * stale — which is what makes caching safe here rather than merely convenient.
 *
 * ## Two invariants
 *
 * Entries are the *promise*, not the resolved value, so several callers asking
 * for the same surah at once share one request instead of racing. A rejected
 * request evicts itself, so a transient failure is retried rather than
 * remembered.
 *
 * Cached values are handed out by reference and must be treated as read-only.
 * Everything that consumes them renders them; the one caller that narrows a
 * surah to selected ayahs builds new objects rather than splicing the original.
 */

interface Lru {
    entries: Map<string, Promise<unknown>>;
    max: number;
}

function lru(max: number): Lru {
    return { entries: new Map(), max };
}

/**
 * Morphology is by far the heaviest payload — al-Baqarah is over ten thousand
 * tokens, each with several string fields — so only a few are kept. That still
 * covers the common movements: flipping between neighbouring surahs, or
 * stepping away and coming back.
 */
const morphologyCache = lru(4);

/** Translations, transliterations, word-by-word and tafsir: far smaller rows,
 *  and keyed by translator/author/language as well as surah, so a reader who
 *  compares two translations of a surah wants several live at once. */
const textCache = lru(32);

function through<T>(cache: Lru, key: string, run: () => Promise<T>): Promise<T> {
    const hit = cache.entries.get(key);
    if (hit) {
        // Re-insert to mark most-recently-used; Map preserves insertion order.
        cache.entries.delete(key);
        cache.entries.set(key, hit);
        return hit as Promise<T>;
    }

    const pending = run().catch((error) => {
        // Never remember a failure — the next attempt must reach the backend.
        if (cache.entries.get(key) === pending) cache.entries.delete(key);
        throw error;
    });

    cache.entries.set(key, pending);
    while (cache.entries.size > cache.max) {
        const oldest = cache.entries.keys().next().value;
        if (oldest === undefined) break;
        cache.entries.delete(oldest);
    }
    return pending;
}

/** Memoize a surah's morphology. */
export function cachedMorphology<T>(surah: number, run: () => Promise<T>): Promise<T> {
    return through(morphologyCache, `morph:${surah}`, run);
}

/**
 * Memoize one of the lighter per-surah datasets.
 *
 * `variant` distinguishes the translator, tafsir author or language, so
 * switching translator does not serve the previous one's text.
 */
export function cachedSurahText<T>(
    kind: string,
    surah: number,
    variant: string | number,
    run: () => Promise<T>,
): Promise<T> {
    return through(textCache, `${kind}:${surah}:${variant}`, run);
}

/** Drop everything. Exposed for tests and for a future "reload data" action. */
export function clearSurahCache(): void {
    morphologyCache.entries.clear();
    textCache.entries.clear();
}
