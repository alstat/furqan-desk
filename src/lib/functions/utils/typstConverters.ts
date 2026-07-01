/**
 * Converters between Lexical editor state JSON and Typst markup.
 */

const PREAMBLE = `#import "@preview/ilm:1.4.2": *

#set text(lang: "en")

#show: ilm.with(
  title: [Document Title],
  author: "Author Name",
)

`;

// ── Inline format bitmask (Lexical) ─────────────────────────────────────────
const IS_BOLD        = 1;
const IS_ITALIC      = 2;
const IS_STRIKETHROUGH = 4;
const IS_UNDERLINE   = 8;
const IS_CODE        = 16;
const IS_SUBSCRIPT   = 32;
const IS_SUPERSCRIPT = 64;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyInlineFormat(text: string, format: number): string {
    if (format & IS_CODE)        return `\`${text}\``;
    if (format & IS_BOLD)        text = `*${text}*`;
    if (format & IS_ITALIC)      text = `_${text}_`;
    if (format & IS_STRIKETHROUGH) text = `#strike[${text}]`;
    if (format & IS_UNDERLINE)   text = `#underline[${text}]`;
    if (format & IS_SUBSCRIPT)   text = `#sub[${text}]`;
    if (format & IS_SUPERSCRIPT) text = `#super[${text}]`;
    return text;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inlineChildren(children: any[]): string {
    return children.map(child => nodeToTypst(child)).join('');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nodeToTypst(node: any): string {
    switch (node.type) {
        case 'text': {
            const text = (node.text as string) ?? '';
            const fmt  = (node.format as number) ?? 0;
            return fmt ? applyInlineFormat(text, fmt) : text;
        }
        case 'linebreak':
            return '\\\n';
        case 'paragraph':
        case 'extended-paragraph':
            return inlineChildren(node.children ?? []);
        case 'heading': {
            const tag    = (node.tag as string) ?? 'h1';
            const prefix = tag === 'h1' ? '=' : tag === 'h2' ? '==' : '===';
            return `${prefix} ${inlineChildren(node.children ?? [])}`;
        }
        case 'listitem': {
            const checked = node.checked;
            const content = inlineChildren(node.children ?? []);
            if (checked === true)  return `- [x] ${content}`;
            if (checked === false) return `- [ ] ${content}`;
            return `- ${content}`;
        }
        case 'quote':
            return `#quote[${inlineChildren(node.children ?? [])}]`;
        case 'horizontalrule':
            return '---';
        case 'image': {
            const src = (node.src as string) ?? '';
            const alt = (node.altText as string) ?? '';
            return `#figure(image("${src}"), caption: [${alt}])`;
        }
        case 'equation': {
            const eq      = (node.equation as string) ?? '';
            const isInline = (node.inline as boolean) ?? true;
            return isInline ? `$${eq}$` : `$ ${eq} $`;
        }
        case 'code': {
            const lang = (node.language as string) ?? '';
            const code = (node.code as string) ?? '';
            return `\`\`\`${lang}\n${code}\n\`\`\``;
        }
        default:
            // fallback: try to render children if any
            if (Array.isArray(node.children)) return inlineChildren(node.children);
            return '';
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function blockToTypst(node: any): string {
    switch (node.type) {
        case 'paragraph':
        case 'extended-paragraph':
            return inlineChildren(node.children ?? []);
        case 'heading': {
            const tag    = (node.tag as string) ?? 'h1';
            const prefix = tag === 'h1' ? '=' : tag === 'h2' ? '==' : '===';
            return `${prefix} ${inlineChildren(node.children ?? [])}`;
        }
        case 'list': {
            const listType = (node.listType as string) ?? 'bullet';
            const items: string[] = (node.children ?? []).map((item: any) => {
                const checked = item.checked;
                const content = inlineChildren(item.children ?? []);
                if (listType === 'number') return `+ ${content}`;
                if (checked === true)      return `- [x] ${content}`;
                if (checked === false)     return `- [ ] ${content}`;
                return `- ${content}`;
            });
            return items.join('\n');
        }
        case 'quote':
            return `#quote[${inlineChildren(node.children ?? [])}]`;
        case 'horizontalrule':
            return '---';
        case 'image': {
            const src = (node.src as string) ?? '';
            const alt = (node.altText as string) ?? '';
            return `#figure(image("${src}"), caption: [${alt}])`;
        }
        case 'equation': {
            const eq      = (node.equation as string) ?? '';
            const isInline = (node.inline as boolean) ?? false;
            return isInline ? `$${eq}$` : `$ ${eq} $`;
        }
        case 'code': {
            const lang = (node.language as string) ?? '';
            const code = (node.code as string) ?? '';
            return `\`\`\`${lang}\n${code}\n\`\`\``;
        }
        default:
            if (Array.isArray(node.children)) return inlineChildren(node.children);
            return '';
    }
}

/**
 * Convert a Lexical editor state JSON string into a Typst markup string.
 */
export function lexicalToTypst(editorStateJson: string): string {
    let parsed: { root?: { children?: unknown[] } };
    try {
        parsed = JSON.parse(editorStateJson);
    } catch {
        return PREAMBLE;
    }

    const children = parsed?.root?.children ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blocks = (children as any[]).map(blockToTypst).filter(b => b !== '');
    return PREAMBLE + blocks.join('\n\n');
}

/**
 * Convert Typst markup into a minimal Lexical editor state JSON string.
 *
 * NOTE: This is a lossy, regex-based approximation. It handles only basic
 * headings, lists, and inline formatting. It is NOT used in the primary
 * Typst→Lexical flow (switching back always restores the saved snapshot).
 * Provided for round-trip curiosity only.
 */
export function typstToLexical(source: string): string {
    // Strip preamble lines starting with #set
    const body = source.replace(/^#set[^\n]*\n/gm, '').trim();
    const lines = body.split('\n');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children: any[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Heading
        const headingMatch = line.match(/^(={1,3})\s+(.*)/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const tag   = level === 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
            children.push({
                type: 'heading', tag, version: 1,
                direction: 'ltr', format: '', indent: 0,
                children: [{ type: 'text', text: headingMatch[2], format: 0, version: 1 }],
            });
            i++;
            continue;
        }

        // Bullet list item
        const bulletMatch = line.match(/^-\s+(.*)/);
        if (bulletMatch) {
            children.push({
                type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0,
                children: [{ type: 'text', text: `• ${bulletMatch[1]}`, format: 0, version: 1 }],
            });
            i++;
            continue;
        }

        // Numbered list item
        const numberedMatch = line.match(/^\+\s+(.*)/);
        if (numberedMatch) {
            children.push({
                type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0,
                children: [{ type: 'text', text: numberedMatch[1], format: 0, version: 1 }],
            });
            i++;
            continue;
        }

        // Paragraph (skip empty lines)
        if (line.trim() === '') { i++; continue; }

        // Parse inline formatting within the line
        const inlineChildren = parseTypstInline(line);
        children.push({
            type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0,
            children: inlineChildren,
        });
        i++;
    }

    if (children.length === 0) {
        children.push({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [] });
    }

    return JSON.stringify({
        root: { children, direction: 'ltr', format: '', indent: 0, type: 'root', version: 1 },
    });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseTypstInline(text: string): any[] {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any[] = [];
    // Very simple: split on *bold*, _italic_, `code`
    const regex = /(\*[^*]+\*|_[^_]+_|`[^`]+`)/g;
    let last = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
        if (match.index > last) {
            result.push({ type: 'text', text: text.slice(last, match.index), format: 0, version: 1 });
        }
        const token = match[1];
        if (token.startsWith('*') && token.endsWith('*')) {
            result.push({ type: 'text', text: token.slice(1, -1), format: IS_BOLD, version: 1 });
        } else if (token.startsWith('_') && token.endsWith('_')) {
            result.push({ type: 'text', text: token.slice(1, -1), format: IS_ITALIC, version: 1 });
        } else if (token.startsWith('`') && token.endsWith('`')) {
            result.push({ type: 'text', text: token.slice(1, -1), format: IS_CODE, version: 1 });
        }
        last = match.index + token.length;
    }
    if (last < text.length) {
        result.push({ type: 'text', text: text.slice(last), format: 0, version: 1 });
    }
    if (result.length === 0) {
        result.push({ type: 'text', text, format: 0, version: 1 });
    }
    return result;
}
