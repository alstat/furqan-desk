import {
  CHECK_LIST,
  CODE,
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

export const ALL_TRANSFORMERS: Array<Transformer> = [
  HR,
  IMAGE,
  CHECK_LIST,
  LINK,
  CODE,
  ...ELEMENT_TRANSFORMERS,
  ...TEXT_FORMAT_TRANSFORMERS,
];

export {TEXT_FORMAT_TRANSFORMERS} from '@lexical/markdown';
