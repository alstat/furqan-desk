import { Paragraph, ShadingType, TextRun } from "docx";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import r from "highlight.js/lib/languages/r";
import julia from "highlight.js/lib/languages/julia";
import css from "highlight.js/lib/languages/css";
import xml from "highlight.js/lib/languages/xml";
import sql from "highlight.js/lib/languages/sql";
import json from "highlight.js/lib/languages/json";

hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("r", r);
hljs.registerLanguage("julia", julia);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("json", json);

const HLJS_COLOR: Record<string, string> = {
    "hljs-keyword": "FA8D3E",
    "hljs-built_in": "F07171",
    "hljs-type": "399EE6",
    "hljs-literal": "A37ACC",
    "hljs-number": "A37ACC",
    "hljs-string": "86B300",
    "hljs-regexp": "4CBF99",
    "hljs-comment": "ABB0B6",
    "hljs-doctag": "ABB0B6",
    "hljs-meta": "ED9366",
    "hljs-tag": "55B4D4",
    "hljs-name": "55B4D4",
    "hljs-attr": "F07171",
    "hljs-attribute": "F07171",
    "hljs-variable": "F07171",
    "hljs-property": "F07171",
    "hljs-symbol": "A37ACC",
    "hljs-bullet": "ED9366",
    "hljs-operator": "ED9366",
    "hljs-punctuation": "575F66",
    "hljs-section": "FA8D3E",
    "hljs-title": "F07171",
    "hljs-function": "F07171",
    "hljs-class": "399EE6",
    "hljs-params": "575F66",
    "hljs-deletion": "F07171",
    "hljs-addition": "86B300",
};
const CODE_DEFAULT_COLOR = "5C6166";
const CODE_BG_FILL = "FAFAFA";

interface SerializedCodeNode {
    type: string;
    code?: unknown;
    language?: unknown;
    [key: string]: unknown;
}

type CodeToken = { text: string; color: string; italic: boolean };

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function tokenizeCode(code: string, language: string): CodeToken[][] {
    let html: string;
    const lang = language && hljs.getLanguage(language) ? language : "";
    if (lang) {
        try {
            html = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        } catch {
            html = escapeHtml(code);
        }
    } else {
        html = escapeHtml(code);
    }

    const root = document.createElement("div");
    root.innerHTML = html;

    const lines: CodeToken[][] = [[]];
    const walk = (el: Node, color: string, italic: boolean) => {
        if (el.nodeType === Node.TEXT_NODE) {
            const parts = (el.textContent ?? "").split("\n");
            parts.forEach((part, i) => {
                if (i > 0) lines.push([]);
                if (part.length > 0) {
                    lines[lines.length - 1].push({ text: part, color, italic });
                }
            });
            return;
        }
        if (el.nodeType !== Node.ELEMENT_NODE) return;
        const elem = el as HTMLElement;
        let nextColor = color;
        let nextItalic = italic;
        for (const cls of Array.from(elem.classList)) {
            if (HLJS_COLOR[cls]) nextColor = HLJS_COLOR[cls];
            if (cls === "hljs-comment") nextItalic = true;
        }
        for (const child of Array.from(elem.childNodes)) {
            walk(child, nextColor, nextItalic);
        }
    };
    for (const child of Array.from(root.childNodes)) {
        walk(child, CODE_DEFAULT_COLOR, false);
    }
    return lines;
}

export function codeBlockParagraphs(node: SerializedCodeNode): Paragraph[] {
    const code = typeof node.code === "string" ? node.code : "";
    const language = typeof node.language === "string" ? node.language : "";
    const lines = tokenizeCode(code, language);

    const paragraphs: Paragraph[] = [];
    if (language) {
        paragraphs.push(
            new Paragraph({
                children: [
                    new TextRun({
                        text: language,
                        italics: true,
                        color: "888888",
                        size: 18,
                    }),
                ],
                shading: { type: ShadingType.CLEAR, color: "auto", fill: CODE_BG_FILL },
            }),
        );
    }
    for (const lineTokens of lines) {
        const runs =
            lineTokens.length === 0
                ? [new TextRun({ text: "", font: "Courier New", size: 20 })]
                : lineTokens.map(
                      (t) =>
                          new TextRun({
                              text: t.text,
                              font: "Courier New",
                              size: 20,
                              color: t.color,
                              italics: t.italic || undefined,
                          }),
                  );
        paragraphs.push(
            new Paragraph({
                children: runs,
                shading: { type: ShadingType.CLEAR, color: "auto", fill: CODE_BG_FILL },
                spacing: { before: 0, after: 0 },
            }),
        );
    }
    return paragraphs;
}
