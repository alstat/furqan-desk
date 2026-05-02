import { Marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js";

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

export function renderMarkdown(md: string): string {
    const raw = marked.parse(md) as string;
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
}
