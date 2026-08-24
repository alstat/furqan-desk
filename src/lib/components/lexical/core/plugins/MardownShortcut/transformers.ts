import {
  CHECK_LIST,
  HEADING,
  LINK,
  ORDERED_LIST,
  QUOTE,
  TEXT_FORMAT_TRANSFORMERS,
  UNORDERED_LIST,
  type ElementTransformer,
  type TextMatchTransformer,
  type Transformer,
} from '@lexical/markdown';
import { $createParagraphNode as createParagraphNode } from 'lexical';
import {
  CodeNode,
  $createCodeNode as createCodeNode,
  $isCodeNode as isCodeNode,
} from '../CodeHighlighter/CodeNode.js';
import {
  $isHorizontalRuleNode as isHorizontalRuleNode,
  HorizontalRuleNode,
  $createHorizontalRuleNode as createHorizontalRuleNode,
} from '../HorizontalRuleNode.js';
import type {LexicalNode} from 'lexical';
import {
  ImageNode,
  $createImageNode as createImageNode,
  $isImageNode as isImageNode,
} from '../Image/ImageNode.js';
import {
  ListNode,
  ListItemNode,
  $createListNode as createListNode,
  $createListItemNode as createListItemNode,
  $isListNode as isListNode,
} from '@lexical/list';
import {
  EquationNode,
  $createEquationNode as createEquationNode,
  $isEquationNode as isEquationNode,
} from '../Equation/EquationNode.js';

export const HR: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node: LexicalNode) => {
    return isHorizontalRuleNode(node) ? '***' : null;
  },
  regExp: /^(---|\*\*\*|___)\s?$/,
  replace: (parentNode, _1, _2, isImport) => {
    const line = createHorizontalRuleNode();

    // TODO: Get rid of isImport flag
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(line);
    } else {
      parentNode.insertBefore(line);
    }

    line.selectNext();
  },
  type: 'element',
};

export const IMAGE: TextMatchTransformer = {
  dependencies: [ImageNode],
  export: (node) => {
    if (!isImageNode(node)) {
      return null;
    }

    return `![${node.getAltText()}](${node.getSrc()})`;
  },
  importRegExp: /!(?:\[([^[]*)\])(?:\(([^(]+)\))/,
  regExp: /!(?:\[([^[]*)\])(?:\(([^(]+)\))$/,
  replace: (textNode, match) => {
    const [, altText, src] = match;
    const imageNode = createImageNode({
      altText,
      maxWidth: 800,
      src,
    });
    textNode.replace(imageNode);
  },
  trigger: ')',
  type: 'text-match',
};

// U+0660–U+0669: Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩)
// U+06F0–U+06F9: Extended Arabic-Indic digits used in Persian/Urdu (۰۱۲۳۴۵۶۷۸۹)
const LIST_INDENT_SIZE = 4;

function arabicToWestern(str: string): string {
  return str.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (c) => {
    const code = c.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) return String(code - 0x0660);
    if (code >= 0x06F0 && code <= 0x06F9) return String(code - 0x06F0);
    return c;
  });
}

function getIndentLevel(whitespaces: string): number {
  const tabs = whitespaces.match(/\t/g);
  const spaces = whitespaces.match(/ /g);
  let indent = 0;
  if (tabs != null) indent += tabs.length;
  if (spaces != null) indent += Math.floor(spaces.length / LIST_INDENT_SIZE);
  return indent;
}

export const ARABIC_ORDERED_LIST: ElementTransformer = {
  dependencies: [ListNode, ListItemNode],
  export: () => null, // export handled by ORDERED_LIST
  regExp: /^(\s*)([\u0660-\u0669\u06F0-\u06F9]{1,})\.\s/,
  replace: (parentNode, children, match, isImport) => {
    const startNumber = Number(arabicToWestern(match[2]));
    const previousNode = parentNode.getPreviousSibling();
    const nextNode = parentNode.getNextSibling();
    const listItem = createListItemNode();

    if (isListNode(nextNode) && nextNode.getListType() === 'number') {
      const firstChild = nextNode.getFirstChild();
      if (firstChild !== null) {
        firstChild.insertBefore(listItem);
      } else {
        nextNode.append(listItem);
      }
      parentNode.remove();
    } else if (isListNode(previousNode) && previousNode.getListType() === 'number') {
      previousNode.append(listItem);
      parentNode.remove();
    } else {
      const listNode = createListNode('number', startNumber);
      listNode.append(listItem);
      parentNode.replace(listNode);
    }

    listItem.append(...children);
    if (!isImport) {
      listItem.select(0, 0);
    }
    const indent = getIndentLevel(match[1]);
    if (indent) {
      listItem.setIndent(indent);
    }
  },
  type: 'element',
};

export const ELEMENT_TRANSFORMERS: Array<ElementTransformer> = [
  HEADING,
  QUOTE,
  UNORDERED_LIST,
  ARABIC_ORDERED_LIST,
  ORDERED_LIST,
];

export const CODE_BLOCK: ElementTransformer = {
  dependencies: [CodeNode],
  export: (node) => {
    if (!isCodeNode(node)) return null;
    const lang = node.getLanguage() || '';
    const code = node.getCode() || '';
    return '```' + lang + '\n' + code + '\n```';
  },
  regExp: /^```(\w{1,10})?\s/,
  replace: (parentNode, _children, match, isImport) => {
    const [, language] = match;
    const codeNode = createCodeNode('', language || 'javascript', true);
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(codeNode);
    } else {
      parentNode.insertBefore(codeNode);
    }
    // Guarantee a paragraph after the block so the cursor can navigate past it
    if (codeNode.getNextSibling() === null) {
      const para = createParagraphNode();
      codeNode.insertAfter(para);
    }
    codeNode.selectNext();
  },
  type: 'element',
};

// Block math: matches a single line that is exactly \[...\] or $$...$$.
// We accept the opening delimiter on its own line (LaTeX style) or all on one
// line. The MarkdownShortcut/import path passes one line at a time, so for
// multi-line display equations we collapse intra-equation newlines to spaces
// in the matched text.
export const EQUATION_BLOCK: ElementTransformer = {
  dependencies: [EquationNode],
  export: (node: LexicalNode) => {
    if (!isEquationNode(node) || node.isInline()) return null;
    return `\\[\n${node.getEquation()}\n\\]`;
  },
  regExp: /^\s*(?:\\\[\s*([\s\S]*?)\s*\\\]|\$\$\s*([\s\S]*?)\s*\$\$)\s*$/,
  replace: (parentNode, _children, match, isImport) => {
    const latex = (match[1] ?? match[2] ?? '').trim();
    if (!latex) return;
    const eq = createEquationNode(latex, false);
    const para = createParagraphNode();
    para.append(eq);
    if (isImport || parentNode.getNextSibling() != null) {
      parentNode.replace(para);
    } else {
      parentNode.insertBefore(para);
    }
    para.selectEnd();
  },
  type: 'element',
};

// Inline math: \(...\) or $...$ within a paragraph.
export const EQUATION_INLINE: TextMatchTransformer = {
  dependencies: [EquationNode],
  export: (node) => {
    if (!isEquationNode(node) || !node.isInline()) return null;
    return `\\(${node.getEquation()}\\)`;
  },
  // The `$…$` half carried a `(?<!\$)` guard so it could not fire on the inner
  // half of a `$$…$$` display block. WebKit before Safari 16.4 rejects
  // lookbehind while *parsing* the module — the whole chunk dies with "invalid
  // regular expression: invalid group specifier name" — so the same rule is
  // spelled two ways that every engine understands:
  //
  //  - a `$$…$$` alternative that swallows a display block whole. It captures
  //    nothing and `replace` declines it, which leaves the text alone and sends
  //    the importer on to scan what follows (it recurses into the node after
  //    each match), so `$$a$$ then $b$` still finds `$b$`.
  //  - the preceding-character check in `replace`, for the anchored `regExp`:
  //    mid-typing there is no closing `$$` to match yet, so `$$x$` has to be
  //    turned down by looking at what sits before the match.
  importRegExp:
    /\\\(([\s\S]+?)\\\)|\$\$(?:[^$\n]|\$(?!\$))*\$\$|\$(?!\$)((?:\\\$|[^\$\n])+?)\$(?!\d)/,
  regExp:
    /(?:\\\(([\s\S]+?)\\\)|\$\$(?:[^$\n]|\$(?!\$))*\$\$|\$(?!\$)((?:\\\$|[^\$\n])+?)\$(?!\d))$/,
  replace: (textNode, match) => {
    // Display math: EQUATION_BLOCK owns it, so leave the text as it is.
    if (match[0].startsWith('$$')) return;
    // An opening `$` sitting right after another one is the tail of a `$$`
    // delimiter the user is still typing.
    if (
      match[0].startsWith('$') &&
      match.index !== undefined &&
      match.input?.[match.index - 1] === '$'
    ) {
      return;
    }
    const latex = (match[1] ?? match[2] ?? '').trim();
    if (!latex) return;
    const eq = createEquationNode(latex, true);
    textNode.replace(eq);
  },
  trigger: ')',
  type: 'text-match',
};

export const ALL_TRANSFORMERS: Array<Transformer> = [
  HR,
  IMAGE,
  CHECK_LIST,
  LINK,
  EQUATION_BLOCK,
  CODE_BLOCK,
  EQUATION_INLINE,
  ...ELEMENT_TRANSFORMERS,
  ...TEXT_FORMAT_TRANSFORMERS,
];

export {TEXT_FORMAT_TRANSFORMERS} from '@lexical/markdown';
