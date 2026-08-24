import { Marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js";
import katex from "katex";

const marked = new Marked({
    breaks: true,
    gfm: true,
    renderer: {
        code({ text, lang }) {
            const language =
                lang && hljs.getLanguage(lang) ? lang : undefined;
            const highlighted = language
                ? hljs.highlight(text, { language }).value
                : hljs.highlightAuto(text).value;
            const cls = language ? ` language-${language}` : "";
            return `<pre class="hljs"><code class="hljs${cls}">${highlighted}</code></pre>`;
        },
    },
});

function renderMath(tex: string, displayMode: boolean): string {
    try {
        return katex.renderToString(tex, {
            displayMode,
            throwOnError: false,
            output: "html",
            strict: "ignore",
        });
    } catch {
        const safe = tex
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        return displayMode ? `<pre>${safe}</pre>` : `<code>${safe}</code>`;
    }
}

marked.use({
    extensions: [
        // Display math: $$...$$
        {
            name: "mathBlockDollar",
            level: "block",
            start(src: string) {
                const idx = src.indexOf("$$");
                return idx < 0 ? undefined : idx;
            },
            tokenizer(src: string) {
                const m = /^\$\$([\s\S]+?)\$\$(?:\n|$)/.exec(src);
                if (m) {
                    return {
                        type: "mathBlockDollar",
                        raw: m[0],
                        text: m[1].trim(),
                    };
                }
            },
            renderer(token: { text?: string } & Record<string, unknown>) {
                return `<div class="math math-display">${renderMath(token.text ?? "", true)}</div>`;
            },
        },
        // Display math: \[ ... \]  (LaTeX bracket form)
        {
            name: "mathBlockBracket",
            level: "block",
            start(src: string) {
                const idx = src.indexOf("\\[");
                return idx < 0 ? undefined : idx;
            },
            tokenizer(src: string) {
                const m = /^\\\[([\s\S]+?)\\\](?:\n|$)/.exec(src);
                if (m) {
                    return {
                        type: "mathBlockBracket",
                        raw: m[0],
                        text: m[1].trim(),
                    };
                }
            },
            renderer(token: { text?: string } & Record<string, unknown>) {
                return `<div class="math math-display">${renderMath(token.text ?? "", true)}</div>`;
            },
        },
        // Inline math: $...$
        {
            name: "mathInlineDollar",
            level: "inline",
            start(src: string) {
                // A lone `$` — not one half of a `$$` display delimiter. The
                // obvious spelling is /(?<!\$)\$(?!\$)/, but WebKit before
                // Safari 16.4 (anything on a pre-2017 Mac, and the WKWebView
                // this app runs in there) rejects lookbehind *while parsing the
                // module*, taking the whole chunk down with "invalid regular
                // expression: invalid group specifier name". Scanning by hand
                // is the same test with no syntax to trip over.
                for (let i = src.indexOf("$"); i >= 0; i = src.indexOf("$", i + 1)) {
                    if (src[i - 1] === "$" || src[i + 1] === "$") continue;
                    return i;
                }
                return undefined;
            },
            tokenizer(src: string) {
                const m = /^\$(?!\$)((?:\\\$|[^\$\n])+?)\$(?!\d)/.exec(src);
                if (m) {
                    return {
                        type: "mathInlineDollar",
                        raw: m[0],
                        text: m[1].trim(),
                    };
                }
            },
            renderer(token: { text?: string } & Record<string, unknown>) {
                return `<span class="math math-inline">${renderMath(token.text ?? "", false)}</span>`;
            },
        },
        // Inline math: \( ... \)  (LaTeX paren form)
        {
            name: "mathInlineParen",
            level: "inline",
            start(src: string) {
                const idx = src.indexOf("\\(");
                return idx < 0 ? undefined : idx;
            },
            tokenizer(src: string) {
                const m = /^\\\(([\s\S]+?)\\\)/.exec(src);
                if (m) {
                    return {
                        type: "mathInlineParen",
                        raw: m[0],
                        text: m[1].trim(),
                    };
                }
            },
            renderer(token: { text?: string } & Record<string, unknown>) {
                return `<span class="math math-inline">${renderMath(token.text ?? "", false)}</span>`;
            },
        },
    ],
});

export function renderMarkdown(md: string): string {
    const raw = marked.parse(md) as string;
    return DOMPurify.sanitize(raw, {
        USE_PROFILES: { html: true },
        // `tabindex`/`role` let injected interactive spans (e.g. the take-home
        // message's clickable ayah references) survive sanitisation; `data-*`
        // attributes are already allowed by default.
        ADD_ATTR: ["style", "tabindex", "role"],
    });
}
