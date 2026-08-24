/**
 * Whitespace tidier for Lean 4 source.
 *
 * Lean has no formatter of its own — nothing in the toolchain corresponds to
 * JuliaFormatter.jl, and the language server does not implement
 * `textDocument/formatting` — so this deliberately does far less than the Julia
 * formatter button does. It normalises whitespace and nothing else.
 *
 * In particular it does NOT re-indent. Lean's layout is significant: `by`
 * blocks, `do` blocks and `·` focus bullets all delimit by column, so moving a
 * line's indentation can change which tactic belongs to which goal — or stop
 * the file elaborating. Re-indenting safely needs a real parser.
 *
 * What it does, outside string literals:
 *   - normalise CRLF / lone CR to LF
 *   - expand tabs to the next indent stop
 *   - strip trailing whitespace
 *   - collapse runs of blank lines to at most one
 *   - end the file with exactly one newline
 *
 * Everything inside a string literal is left byte-for-byte alone, since
 * whitespace there is data.
 */

/** Columns, per line, that fall inside a string literal. */
type StringMask = boolean[];

interface Scan {
    /** Per line, which columns sit inside a string literal. */
    mask: StringMask[];
    /** Per line, whether a string literal was already open at column 0. */
    openAtStart: boolean[];
}

/**
 * Walk the source once and mark every character that sits inside a string
 * literal. Handles Lean's escapes, raw strings (`r"…"`, `r#"…"#`), char
 * literals, line comments and nestable block comments — the last two only so
 * that a quote written inside a comment does not open a phantom string.
 */
function maskStrings(text: string): Scan {
    const lines = text.split("\n");
    const mask: StringMask[] = lines.map((l) => new Array(l.length).fill(false));
    const openAtStart: boolean[] = new Array(lines.length).fill(false);

    let inString = false;
    let inLineComment = false;
    let blockDepth = 0;
    // Number of `#` in the open raw-string delimiter; -1 when not in one.
    let rawHashes = -1;

    for (let row = 0; row < lines.length; row++) {
        const line = lines[row];
        inLineComment = false;
        openAtStart[row] = inString;

        for (let col = 0; col < line.length; col++) {
            const c = line[col];
            const next = line[col + 1] ?? "";

            if (inLineComment) continue;

            if (inString) {
                mask[row][col] = true;
                if (rawHashes >= 0) {
                    // Raw string: closed by `"` plus the same number of `#`.
                    if (c === '"') {
                        const hashes = /^#*/.exec(line.slice(col + 1))![0].length;
                        if (hashes >= rawHashes) {
                            for (let k = 0; k <= rawHashes; k++) {
                                if (col + k < line.length) mask[row][col + k] = true;
                            }
                            col += rawHashes;
                            inString = false;
                            rawHashes = -1;
                        }
                    }
                } else if (c === "\\") {
                    // Escape: consume the next character too.
                    if (col + 1 < line.length) mask[row][col + 1] = true;
                    col++;
                } else if (c === '"') {
                    inString = false;
                }
                continue;
            }

            if (blockDepth > 0) {
                if (c === "/" && next === "-") {
                    blockDepth++;
                    col++;
                } else if (c === "-" && next === "/") {
                    blockDepth--;
                    col++;
                }
                continue;
            }

            if (c === "-" && next === "-") {
                inLineComment = true;
                continue;
            }
            if (c === "/" && next === "-") {
                blockDepth++;
                col++;
                continue;
            }
            if (c === "'") {
                // Char literal: 'a' or '\n'. A lone `'` is also a valid suffix
                // on Lean identifiers (`foo'`), so only treat it as a literal
                // when it closes within a few characters on this line.
                const rest = line.slice(col);
                const m = /^'(\\.|[^'\\])'/.exec(rest);
                if (m) col += m[0].length - 1;
                continue;
            }
            if (c === "r" && (next === '"' || next === "#")) {
                const m = /^r(#*)"/.exec(line.slice(col));
                if (m) {
                    rawHashes = m[1].length;
                    inString = true;
                    for (let k = 0; k < m[0].length; k++) {
                        if (col + k < line.length) mask[row][col + k] = true;
                    }
                    col += m[0].length - 1;
                }
                continue;
            }
            if (c === '"') {
                inString = true;
                mask[row][col] = true;
            }
        }
    }

    return { mask, openAtStart };
}

/** Expand tabs in `text` to the next multiple of `indentSize`. */
function expandTabs(text: string, indentSize: number, inString: StringMask): string {
    if (!text.includes("\t")) return text;
    let out = "";
    for (let i = 0; i < text.length; i++) {
        if (text[i] === "\t" && !inString[i]) {
            const width = indentSize - (out.length % indentSize);
            out += " ".repeat(width);
        } else {
            out += text[i];
        }
    }
    return out;
}

export interface LeanFormatOptions {
    /** Spaces a tab expands to. Defaults to 2, Lean's conventional indent. */
    indentSize?: number;
}

/**
 * Tidy Lean source. Pure and total: it never throws and never changes anything
 * inside a string literal, so the result always elaborates exactly as the input
 * did.
 */
export function formatLeanSource(
    source: string,
    { indentSize = 2 }: LeanFormatOptions = {},
): string {
    const normalized = source.replace(/\r\n?/g, "\n");
    const { mask, openAtStart } = maskStrings(normalized);
    const lines = normalized.split("\n");

    const out: string[] = [];
    let pendingBlank = false;

    for (let row = 0; row < lines.length; row++) {
        const line = lines[row];
        const inString = mask[row] ?? [];
        // Any line a string literal spans owns data all the way to the newline
        // — including a line that is blank because the literal contains a blank
        // line — so leave it exactly as written.
        const spannedByString =
            openAtStart[row] === true || inString[line.length - 1] === true;

        if (spannedByString) {
            if (pendingBlank) {
                out.push("");
                pendingBlank = false;
            }
            out.push(line);
            continue;
        }

        const tidied = expandTabs(line, indentSize, inString).replace(/[ \t]+$/, "");

        if (tidied === "") {
            // Hold blank lines back: at most one survives, and only if more
            // content follows.
            pendingBlank = out.length > 0;
            continue;
        }
        if (pendingBlank) {
            out.push("");
            pendingBlank = false;
        }
        out.push(tidied);
    }

    // Exactly one trailing newline, and none at all for an empty document.
    return out.length ? out.join("\n") + "\n" : "";
}
