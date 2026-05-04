// Parses the slash-command query for Quran insertion.
//
// Accepted forms (the leading "q-" is part of the query passed in):
//   q-S-A
//   q-S-[A1:A2]
//   q-S-[A1,A2,...]
//   q-[S1:S2]-(A | [A1:A2] | [A1,...])
//   q-[S1,S2,...]-(A | [A1:A2] | [A1,...])
//
// Cross-product semantics: for each surah in the resolved surah list,
// emit every ayah in the resolved ayah list. Ayahs that don't exist in
// a given surah are dropped later by the consumer (this parser only
// handles syntax, not bounds).

const SPEC_RE = /^(\d+|\[\d+(?::\d+|(?:,\d+)+)\])$/;
const PARTIAL_PREFIX_RE =
    /^q(?:-(?:\d+|\[\d*(?::\d*|(?:,\d*)*)?\]?)?(?:-(?:\d+|\[\d*(?::\d*|(?:,\d*)*)?\]?)?)?)?$/;

// Used by the slash menu's filter to surface the menu while the user is
// typing. Permissive — accepts partial prefixes like "q", "q-", "q-2", etc.
export const QURAN_SLASH_REGEX = PARTIAL_PREFIX_RE;

// Used by selectCommand to confirm the query is a complete, executable form.
export const QURAN_SLASH_COMPLETE_REGEX = new RegExp(
    `^q-(\\d+|\\[\\d+(?::\\d+|(?:,\\d+)+)\\])-(\\d+|\\[\\d+(?::\\d+|(?:,\\d+)+)\\])$`,
);

export type ParsedQuranQuery =
    | { ok: true; pairs: Array<{ surah: number; ayah: number }> }
    | { ok: false; error: string };

function expandSpec(spec: string): number[] | null {
    if (!SPEC_RE.test(spec)) return null;
    if (!spec.startsWith("[")) {
        const n = parseInt(spec, 10);
        return Number.isFinite(n) && n > 0 ? [n] : null;
    }
    const inner = spec.slice(1, -1);
    if (inner.includes(":")) {
        const [a, b] = inner.split(":").map((s) => parseInt(s, 10));
        if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < a) return null;
        const out: number[] = [];
        for (let i = a; i <= b; i++) out.push(i);
        return out;
    }
    const list = inner.split(",").map((s) => parseInt(s, 10));
    if (list.some((n) => !Number.isFinite(n) || n < 1)) return null;
    return list;
}

export function parseQuranSlashQuery(query: string): ParsedQuranQuery {
    if (!QURAN_SLASH_COMPLETE_REGEX.test(query)) {
        return { ok: false, error: "syntax" };
    }
    // Strip the leading "q-" then split into surahSpec and ayahSpec on the
    // dash that sits at the top level (i.e. not inside brackets).
    const body = query.slice(2);
    let depth = 0;
    let splitAt = -1;
    for (let i = 0; i < body.length; i++) {
        const c = body[i];
        if (c === "[") depth++;
        else if (c === "]") depth--;
        else if (c === "-" && depth === 0) {
            splitAt = i;
            break;
        }
    }
    if (splitAt === -1) return { ok: false, error: "syntax" };
    const surahSpec = body.slice(0, splitAt);
    const ayahSpec = body.slice(splitAt + 1);

    const surahs = expandSpec(surahSpec);
    const ayahs = expandSpec(ayahSpec);
    if (!surahs || !ayahs) return { ok: false, error: "syntax" };
    if (surahs.some((s) => s < 1 || s > 114)) return { ok: false, error: "surah-range" };

    const seen = new Set<string>();
    const pairs: Array<{ surah: number; ayah: number }> = [];
    for (const s of surahs) {
        for (const a of ayahs) {
            const k = `${s}:${a}`;
            if (seen.has(k)) continue;
            seen.add(k);
            pairs.push({ surah: s, ayah: a });
        }
    }
    return { ok: true, pairs };
}
