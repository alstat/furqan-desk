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
                const idx = src.search(/(?<!\$)\$(?!\$)/);
                return idx < 0 ? undefined : idx;
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
        ADD_ATTR: ["style"],
    });
}
