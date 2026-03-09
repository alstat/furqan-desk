// Tajweed rules coloring utility
// Operates on Arabic Unicode text (post-Buckwalter conversion)

// ── Diacritics ──────────────────────────────────────────────────────────────
const SHADDA       = '\u0651'; // ّ
const SUKUN        = '\u0652'; // ْ
const FATHATAN     = '\u064B'; // ً
const DAMMATAN     = '\u064C'; // ٌ
const KASRATAN     = '\u064D'; // ٍ
const SUPERSCRIPT_ALEF = '\u0670'; // ٰ
const DIACRITIC_RE = /[\u064B-\u065F\u0610-\u061A\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/;

// ── Base letters ─────────────────────────────────────────────────────────────
const NOON         = '\u0646'; // ن
const MEEM         = '\u0645'; // م
const WAW          = '\u0648'; // و
const YA           = '\u064A'; // ي
const ALEF         = '\u0627'; // ا
const ALEF_MADDA   = '\u0622'; // آ
const ALEF_MAKSURA = '\u0649'; // ى
const LAM          = '\u0644'; // ل
const HA           = '\u0647'; // ه (taa marbuta becomes ة but lam+ha+ha = الله)

// ── Rule letter sets ─────────────────────────────────────────────────────────
// Qalqalah: ق ط ب ج د
const QALQALAH = new Set(['\u0642', '\u0637', '\u0628', '\u062C', '\u062F']);

// Izhar halqi (throat letters): ء ه ع ح غ خ + hamza variants
const IZHAR = new Set([
    '\u0621', '\u0647', '\u0639', '\u062D', '\u063A', '\u062E',
    '\u0623', '\u0625', '\u0626', '\u0624',
]);

// Ikhfa: 15 letters — ت ث ج د ذ ز س ش ص ض ط ظ ف ق ك
const IKHFA = new Set([
    '\u062A', '\u062B', '\u062C', '\u062F', '\u0630',
    '\u0632', '\u0633', '\u0634', '\u0635', '\u0636',
    '\u0637', '\u0638', '\u0641', '\u0642', '\u0643',
]);

// Idgham with ghunnah: ي ن م و
const IDGHAM_GHUNNAH = new Set(['\u064A', '\u0646', '\u0645', '\u0648']);

// Idgham without ghunnah: ر ل
const IDGHAM_NO_GHUNNAH = new Set(['\u0631', '\u0644']);

// Iqlab: ب
const IQLAB_BA = '\u0628';

// ── Colors ───────────────────────────────────────────────────────────────────
export const TAJWEED_COLORS = {
    ghunnah:           '#00a550', // bright green  — نّ / مّ
    qalqalah:          '#9b59b6', // purple        — ق ط ب ج د + sukun
    ikhfa:             '#b8860b', // dark gold     — noon/meem sakin + ikhfa letter
    idgham_ghunnah:    '#00a550', // bright green  — idgham with ghunnah
    idgham_no_ghunnah: '#e67e22', // orange        — idgham without ghunnah
    iqlab:             '#e74c3c', // red           — noon/meem + ب
    izhar:             '#3498db', // blue          — noon/meem + throat letters
    madd:              '#1a6eb5', // dark blue     — elongation letters
    lam_jalalah:       '#b7950b', // gold          — lam in الله
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────
function isDiacritic(ch: string): boolean {
    return DIACRITIC_RE.test(ch);
}

function has(diacritics: string, mark: string): boolean {
    return diacritics.includes(mark);
}

function isTanwin(diacritics: string): boolean {
    return has(diacritics, FATHATAN) || has(diacritics, DAMMATAN) || has(diacritics, KASRATAN);
}

function isAllahWord(word: string): boolean {
    // Strip all diacritics and compare
    const s = word.replace(DIACRITIC_RE, '');
    return s === '\u0644\u0644\u0647'       // لله
        || s === '\u0627\u0644\u0644\u0647'  // الله
        || s === '\u0671\u0644\u0644\u0647'; // ٱلله
}

function noonRule(next: string | null): string | null {
    if (!next) return null;
    if (IZHAR.has(next))            return TAJWEED_COLORS.izhar;
    if (next === IQLAB_BA)          return TAJWEED_COLORS.iqlab;
    if (IDGHAM_GHUNNAH.has(next))   return TAJWEED_COLORS.idgham_ghunnah;
    if (IDGHAM_NO_GHUNNAH.has(next))return TAJWEED_COLORS.idgham_no_ghunnah;
    if (IKHFA.has(next))            return TAJWEED_COLORS.ikhfa;
    return null;
}

function meemSakinRule(next: string | null): string | null {
    if (!next) return null;
    if (next === IQLAB_BA) return TAJWEED_COLORS.ikhfa;   // ikhfa shafawi
    if (next === MEEM)     return TAJWEED_COLORS.idgham_ghunnah; // idgham shafawi
    return TAJWEED_COLORS.izhar;                           // izhar shafawi
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface TajweedChunk {
    text:  string;
    color: string | null;
}

/**
 * Parse an Arabic word into colored chunks based on tajweed rules.
 * @param word                 Arabic Unicode word string (from combined_arabic)
 * @param nextWordFirstLetter  First base letter of the following word (for cross-word rules)
 */
export function applyTajweed(
    word: string,
    nextWordFirstLetter: string | null = null,
): TajweedChunk[] {
    const chars   = [...word]; // spread to handle any surrogate pairs safely
    const chunks: TajweedChunk[] = [];
    const isAllah = isAllahWord(word);
    let i = 0;

    while (i < chars.length) {
        const ch = chars[i];

        // Lone diacritics: include as null-color chunk so positions stay aligned with the text node
        if (isDiacritic(ch)) {
            chunks.push({ text: ch, color: null });
            i++;
            continue;
        }

        // Gather this base letter + all following diacritics
        let diacritics = '';
        let j = i + 1;
        while (j < chars.length && isDiacritic(chars[j])) {
            diacritics += chars[j++];
        }
        const text  = ch + diacritics;
        const nextI = j;

        // Peek at next base letter within this word
        let nextBase: string | null = null;
        let k = nextI;
        while (k < chars.length) {
            if (!isDiacritic(chars[k])) { nextBase = chars[k]; break; }
            k++;
        }
        const effectiveNext = nextBase ?? nextWordFirstLetter;

        let color: string | null = null;

        // ── Rule priority order ──────────────────────────────────────────────

        // 1. Lam Jalalah (overrides everything for the lam in الله)
        if (isAllah && ch === LAM) {
            color = TAJWEED_COLORS.lam_jalalah;
        }
        // 2. Ghunnah: noon or meem with shadda
        else if ((ch === NOON || ch === MEEM) && has(diacritics, SHADDA)) {
            color = TAJWEED_COLORS.ghunnah;
        }
        // 3. Qalqalah: five letters with sukun
        else if (QALQALAH.has(ch) && has(diacritics, SUKUN)) {
            color = TAJWEED_COLORS.qalqalah;
        }
        // 4. Noon sakin
        else if (ch === NOON && has(diacritics, SUKUN)) {
            color = noonRule(effectiveNext);
        }
        // 5. Tanwin (acts like noon sakin — cross-word only)
        else if (isTanwin(diacritics)) {
            color = noonRule(nextWordFirstLetter);
        }
        // 6. Meem sakin
        else if (ch === MEEM && has(diacritics, SUKUN)) {
            color = meemSakinRule(effectiveNext);
        }
        // 7. Madd letters
        else if (ch === ALEF_MADDA) {
            color = TAJWEED_COLORS.madd; // آ — madd with built-in madda
        }
        else if (ch === ALEF && !has(diacritics, SHADDA)) {
            color = TAJWEED_COLORS.madd; // bare alef — madd asli
        }
        else if (ch === ALEF_MAKSURA && !has(diacritics, SHADDA)) {
            color = TAJWEED_COLORS.madd; // ى — madd alef maksura
        }
        else if ((ch === WAW || ch === YA) && has(diacritics, SUKUN)) {
            color = TAJWEED_COLORS.madd; // waw/ya saakin — madd letter
        }
        else if (has(diacritics, SUPERSCRIPT_ALEF)) {
            color = TAJWEED_COLORS.madd; // hidden alef (e.g. رَٰحْمَٰن)
        }

        chunks.push({ text, color });
        i = nextI;
    }

    return chunks;
}

/**
 * Returns the first base (non-diacritic) letter of an Arabic string,
 * used to determine cross-word tajweed rules.
 */
export function firstBaseLetter(word: string): string | null {
    for (const ch of word) {
        if (!isDiacritic(ch)) return ch;
    }
    return null;
}

/**
 * Returns a single CSS color for the whole word based on its primary tajweed rule.
 * Coloring the entire word (not individual chars) preserves Arabic letter shaping/ligatures.
 *
 * Priority follows the order rules are detected in applyTajweed:
 * lam_jalalah → ghunnah → qalqalah → noon-sakin rules → tanwin rules → meem-sakin rules → madd
 */
export function getWordTajweedColor(
    word: string,
    nextWordFirstLetter: string | null = null,
): string | null {
    const chunks = applyTajweed(word, nextWordFirstLetter);
    for (const chunk of chunks) {
        if (chunk.color) return chunk.color;
    }
    return null;
}
