// Reference manager — shared types, parsers (BibTeX / RIS), serializers and
// helpers used by the references store and the ReferencesDialog component.

export type ReferenceKind =
    | "article"
    | "book"
    | "inproceedings"
    | "incollection"
    | "techreport"
    | "phdthesis"
    | "misc";

export interface Reference {
    /** Stable client id (uuid-ish) — used as the list key. */
    id: string;
    /** BibTeX entry key. Parsed from .bib when present, else synthesized. */
    citeKey: string;
    kind: ReferenceKind;
    title: string;
    authors: string[];
    year: string;
    /** Journal, publisher, conference… */
    container: string;
    doi: string;
    url: string;
    /** The DOI/PMID/ISBN/arXiv id this entry was resolved from, if any. */
    identifier: string;
    /** Any remaining BibTeX-ish fields not captured above. */
    extra: Record<string, string>;
}

export type IdKind = "doi" | "pmid" | "isbn" | "arxiv";

let _seq = 0;
export function newRefId(): string {
    _seq += 1;
    return `ref-${Date.now().toString(36)}-${_seq.toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 8)}`;
}

function emptyRef(): Reference {
    return {
        id: newRefId(),
        citeKey: "",
        kind: "misc",
        title: "",
        authors: [],
        year: "",
        container: "",
        doi: "",
        url: "",
        identifier: "",
        extra: {},
    };
}

// ── Cite-key synthesis ────────────────────────────────────────────────────
function slugSurname(author: string): string {
    if (!author) return "anon";
    // "Last, First" or "First Last" → surname token
    const surname = author.includes(",")
        ? author.split(",")[0]
        : author.trim().split(/\s+/).pop() || author;
    return surname.replace(/[^A-Za-z0-9]/g, "").toLowerCase() || "anon";
}

export function makeCiteKey(ref: Reference, taken: Set<string>): string {
    const base =
        `${slugSurname(ref.authors[0] || "")}${ref.year || ""}` || "ref";
    let key = base;
    let n = 1;
    while (taken.has(key)) {
        key = `${base}${String.fromCharCode(96 + n)}`; // base, basea, baseb…
        n += 1;
    }
    taken.add(key);
    return key;
}

/** Ensure every reference has a unique, non-empty citeKey. */
export function ensureCiteKeys(refs: Reference[]): Reference[] {
    const taken = new Set<string>();
    for (const r of refs) {
        if (r.citeKey && !taken.has(r.citeKey)) taken.add(r.citeKey);
    }
    for (const r of refs) {
        if (!r.citeKey) r.citeKey = makeCiteKey(r, taken);
    }
    return refs;
}

// ── Format / id detection ─────────────────────────────────────────────────
export function detectFormat(text: string): "bibtex" | "ris" | null {
    const t = text.trim();
    if (!t) return null;
    if (/^\s*@\w+\s*\{/m.test(t)) return "bibtex";
    if (/^\s*TY\s+-\s+/m.test(t)) return "ris";
    return null;
}

const DOI_RE = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/i;
const ARXIV_RE = /(?:arxiv:)?\d{4}\.\d{4,5}(v\d+)?/i;
const ARXIV_OLD_RE = /[a-z-]+(\.[A-Z]{2})?\/\d{7}/i; // e.g. hep-th/9901001

export function detectIdKind(raw: string): IdKind | null {
    const s = raw.trim();
    if (!s) return null;
    if (/^doi:/i.test(s) || DOI_RE.test(s)) return "doi";
    if (/^arxiv:/i.test(s) || ARXIV_RE.test(s) || ARXIV_OLD_RE.test(s))
        return "arxiv";
    if (/^pmid:/i.test(s)) return "pmid";
    if (/^isbn:/i.test(s)) return "isbn";
    const digits = s.replace(/[-\s]/g, "");
    if (/^\d{10}$/.test(digits) || /^\d{13}$/.test(digits) || /^\d{9}[\dxX]$/.test(digits))
        return "isbn";
    if (/^\d{1,8}$/.test(digits)) return "pmid";
    return null;
}

/** Strip a leading scheme/label and return the bare id for the lookup. */
export function normalizeId(raw: string, kind: IdKind): string {
    let s = raw.trim();
    s = s.replace(/^(doi|arxiv|pmid|isbn)\s*:\s*/i, "");
    if (kind === "doi") {
        const m = s.match(DOI_RE);
        return m ? m[0] : s;
    }
    if (kind === "arxiv") {
        const m = s.match(ARXIV_RE) || s.match(ARXIV_OLD_RE);
        return m ? m[0].replace(/^arxiv:/i, "") : s;
    }
    if (kind === "isbn") return s.replace(/[-\s]/g, "");
    return s;
}

// ── BibTeX parser ─────────────────────────────────────────────────────────
const KIND_ALIASES: Record<string, ReferenceKind> = {
    article: "article",
    book: "book",
    booklet: "book",
    inbook: "incollection",
    incollection: "incollection",
    inproceedings: "inproceedings",
    conference: "inproceedings",
    proceedings: "inproceedings",
    techreport: "techreport",
    phdthesis: "phdthesis",
    mastersthesis: "phdthesis",
    misc: "misc",
    unpublished: "misc",
    online: "misc",
};

function normalizeKind(raw: string): ReferenceKind {
    return KIND_ALIASES[raw.toLowerCase()] ?? "misc";
}

function cleanBibValue(v: string): string {
    return v
        .replace(/[{}]/g, "")
        .replace(/\\&/g, "&")
        .replace(/\s+/g, " ")
        .trim();
}

function splitAuthors(value: string): string[] {
    return value
        .split(/\s+and\s+/i)
        .map((a) => a.trim())
        .filter(Boolean);
}

export function parseBibtex(text: string): Reference[] {
    const refs: Reference[] = [];
    const entryRe = /@(\w+)\s*\{\s*([^,]*),/g;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(text)) !== null) {
        const kind = normalizeKind(m[1]);
        const citeKey = m[2].trim();
        // Find the matching closing brace for this entry, starting at the `{`.
        const open = text.indexOf("{", m.index);
        let depth = 0;
        let end = open;
        for (let i = open; i < text.length; i++) {
            const ch = text[i];
            if (ch === "{") depth++;
            else if (ch === "}") {
                depth--;
                if (depth === 0) {
                    end = i;
                    break;
                }
            }
        }
        const body = text.slice(text.indexOf(",", open) + 1, end);
        const ref = emptyRef();
        ref.kind = kind;
        ref.citeKey = citeKey;

        // field = value  (value: {…} | "…" | bareword), balanced braces
        const fieldRe = /(\w+)\s*=\s*/g;
        let fm: RegExpExecArray | null;
        while ((fm = fieldRe.exec(body)) !== null) {
            const fieldName = fm[1].toLowerCase();
            let i = fm.index + fm[0].length;
            let value = "";
            if (body[i] === "{") {
                let d = 0;
                for (; i < body.length; i++) {
                    const ch = body[i];
                    if (ch === "{") d++;
                    else if (ch === "}") {
                        d--;
                        if (d === 0) {
                            i++;
                            break;
                        }
                    } else if (d >= 1) value += ch;
                }
            } else if (body[i] === '"') {
                i++;
                for (; i < body.length && body[i] !== '"'; i++) value += body[i];
                i++;
            } else {
                for (; i < body.length && !/[,\n]/.test(body[i]); i++)
                    value += body[i];
            }
            fieldRe.lastIndex = i;
            assignBibField(ref, fieldName, cleanBibValue(value));
        }
        refs.push(ref);
    }
    return refs;
}

function assignBibField(ref: Reference, field: string, value: string) {
    switch (field) {
        case "title":
            ref.title = value;
            break;
        case "author":
        case "editor":
            if (!ref.authors.length) ref.authors = splitAuthors(value);
            break;
        case "year":
            ref.year = value.replace(/[^\d]/g, "").slice(0, 4) || value;
            break;
        case "date":
            if (!ref.year) ref.year = value.slice(0, 4);
            break;
        case "journal":
        case "journaltitle":
        case "booktitle":
        case "publisher":
        case "institution":
            if (!ref.container) ref.container = value;
            break;
        case "doi":
            ref.doi = value;
            break;
        case "url":
            ref.url = value;
            break;
        default:
            ref.extra[field] = value;
    }
}

// ── RIS parser ────────────────────────────────────────────────────────────
const RIS_KIND: Record<string, ReferenceKind> = {
    JOUR: "article",
    BOOK: "book",
    CHAP: "incollection",
    CONF: "inproceedings",
    CPAPER: "inproceedings",
    RPRT: "techreport",
    THES: "phdthesis",
};

export function parseRis(text: string): Reference[] {
    const refs: Reference[] = [];
    let ref: Reference | null = null;
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const m = line.match(/^([A-Z][A-Z0-9])\s{1,2}-\s?(.*)$/);
        if (!m) continue;
        const tag = m[1];
        const value = m[2].trim();
        if (tag === "TY") {
            ref = emptyRef();
            ref.kind = RIS_KIND[value] ?? "misc";
            refs.push(ref);
            continue;
        }
        if (!ref) continue;
        switch (tag) {
            case "TI":
            case "T1":
                ref.title = ref.title || value;
                break;
            case "AU":
            case "A1":
                if (value) ref.authors.push(value);
                break;
            case "PY":
            case "Y1":
                if (!ref.year) ref.year = value.replace(/[^\d]/g, "").slice(0, 4);
                break;
            case "JO":
            case "JF":
            case "T2":
            case "PB":
                if (!ref.container) ref.container = value;
                break;
            case "DO":
                ref.doi = value;
                break;
            case "UR":
            case "L1":
                if (!ref.url) ref.url = value;
                break;
            case "SN":
                if (!ref.identifier) ref.identifier = value;
                ref.extra.isbn = value;
                break;
            case "ER":
                ref = null;
                break;
            default:
                if (value) ref.extra[tag] = value;
        }
    }
    return refs;
}

/** Parse pasted/loaded text in whichever supported format it is. */
export function parseReferenceText(text: string): Reference[] {
    const fmt = detectFormat(text);
    if (fmt === "bibtex") return parseBibtex(text);
    if (fmt === "ris") return parseRis(text);
    return [];
}

// ── BibTeX serializer (canonical save format) ─────────────────────────────
function escapeBib(v: string): string {
    return v.replace(/[{}]/g, "");
}

export function toBibtex(refs: Reference[]): string {
    const taken = new Set<string>();
    return refs
        .map((ref) => {
            const key = ref.citeKey || makeCiteKey(ref, taken);
            taken.add(key);
            const fields: [string, string][] = [];
            if (ref.title) fields.push(["title", ref.title]);
            if (ref.authors.length)
                fields.push(["author", ref.authors.join(" and ")]);
            if (ref.year) fields.push(["year", ref.year]);
            if (ref.container) {
                const f = ref.kind === "book" ? "publisher" : "journal";
                fields.push([f, ref.container]);
            }
            if (ref.doi) fields.push(["doi", ref.doi]);
            if (ref.url) fields.push(["url", ref.url]);
            for (const [k, v] of Object.entries(ref.extra)) {
                if (v) fields.push([k.toLowerCase(), v]);
            }
            const body = fields
                .map(([k, v]) => `  ${k} = {${escapeBib(v)}}`)
                .join(",\n");
            return `@${ref.kind}{${key},\n${body}\n}`;
        })
        .join("\n\n");
}

// ── Human-readable citation (Copy button) ─────────────────────────────────
function formatAuthorList(authors: string[]): string {
    if (!authors.length) return "";
    const names = authors.map((a) => {
        if (a.includes(",")) {
            const [last, first] = a.split(",").map((s) => s.trim());
            const initials = first
                ? first
                      .split(/\s+/)
                      .map((p) => p[0]?.toUpperCase() + ".")
                      .join(" ")
                : "";
            return initials ? `${last}, ${initials}` : last;
        }
        return a;
    });
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]} & ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}`;
}

export function shortAuthorLabel(ref: Reference): string {
    const a = ref.authors;
    let who = "";
    if (a.length === 1) who = surnameOf(a[0]);
    else if (a.length === 2)
        who = `${surnameOf(a[0])} & ${surnameOf(a[1])}`;
    else if (a.length > 2) who = `${surnameOf(a[0])} et al.`;
    const year = ref.year ? ` (${ref.year})` : "";
    return who ? `${who}${year}` : ref.year ? ref.year : ref.citeKey;
}

function surnameOf(author: string): string {
    if (!author) return "";
    return (
        author.includes(",")
            ? author.split(",")[0]
            : author.trim().split(/\s+/).pop() || author
    ).trim();
}

/** "Smith", "Smith & Jones", or "Smith et al." — no year. */
export function shortAuthors(ref: Reference): string {
    const a = ref.authors;
    if (a.length === 0) return "";
    if (a.length === 1) return surnameOf(a[0]);
    if (a.length === 2) return `${surnameOf(a[0])} & ${surnameOf(a[1])}`;
    return `${surnameOf(a[0])} et al.`;
}

export interface CitationStyle {
    id: string;
    label: string;
    text: string;
}

/**
 * In-text citation variants offered after the user picks a reference in the
 * Lexical /cite menu. `number` is the reference's 1-based position in the
 * library (used for the numbered [n] style).
 */
export function citationStyles(ref: Reference, number: number): CitationStyle[] {
    const who = shortAuthors(ref);
    const year = ref.year;
    const parenInner = who
        ? year
            ? `${who}, ${year}`
            : who
        : year || ref.title || ref.citeKey;
    const narrative = who
        ? year
            ? `${who} (${year})`
            : who
        : year || ref.title || ref.citeKey;
    return [
        { id: "numeric", label: "Numbered", text: `[${number}]` },
        { id: "parenthetical", label: "Parenthetical", text: `(${parenInner})` },
        { id: "narrative", label: "Narrative", text: narrative },
        { id: "code", label: "Code name", text: ref.citeKey },
        { id: "typst", label: "Typst @key", text: `@${ref.citeKey}` },
    ];
}

export function formatCitation(ref: Reference): string {
    const parts: string[] = [];
    const authors = formatAuthorList(ref.authors);
    if (authors) parts.push(`${authors}${ref.year ? ` (${ref.year}).` : "."}`);
    else if (ref.year) parts.push(`(${ref.year}).`);
    if (ref.title) parts.push(`${ref.title}.`);
    if (ref.container) parts.push(`${ref.container}.`);
    if (ref.doi) parts.push(`https://doi.org/${ref.doi}`);
    else if (ref.url) parts.push(ref.url);
    return parts.join(" ").replace(/\s+/g, " ").trim();
}
