<script lang="ts">
  import {onMount} from 'svelte';
  import {
    $handleListInsertParagraph as handleListInsertParagraph,
    $isListItemNode as isListItemNode,
    $createListNode as createListNode,
    $createListItemNode as createListItemNode,
    ListItemNode,
    INSERT_ORDERED_LIST_COMMAND,
    INSERT_UNORDERED_LIST_COMMAND,
    insertList,
    REMOVE_LIST_COMMAND,
    removeList,
  } from '@lexical/list';
  import {mergeRegister} from '@lexical/utils';
  import {
    $getSelection as getSelection,
    $isRangeSelection as isRangeSelection,
    $isParagraphNode as isParagraphNode,
    $createTextNode as createTextNode,
    COMMAND_PRIORITY_LOW,
    INSERT_PARAGRAPH_COMMAND,
    KEY_ENTER_COMMAND,
    KEY_SPACE_COMMAND,
    KEY_TAB_COMMAND,
    KEY_BACKSPACE_COMMAND,
    INDENT_CONTENT_COMMAND,
    OUTDENT_CONTENT_COMMAND,
  } from 'lexical';
  import {getEditor} from '../composerContext.js';

  const BULLET_RE  = /^[-*]\s(.*)/s;
  const ORDERED_RE = /^\d+\.\s(.*)/s;

  const editor = getEditor();

  onMount(() => {
    // returns callback to unregister
    return mergeRegister(
      editor.registerCommand(
        INSERT_ORDERED_LIST_COMMAND,
        () => {
          insertList(editor, 'number');
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        INSERT_UNORDERED_LIST_COMMAND,
        () => {
          insertList(editor, 'bullet');
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        REMOVE_LIST_COMMAND,
        () => {
          removeList(editor);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      editor.registerCommand(
        INSERT_PARAGRAPH_COMMAND,
        () => handleListInsertParagraph(),
        COMMAND_PRIORITY_LOW,
      ),
      // Markdown-style list creation: "-" + Space  or  "1." + Space
      editor.registerCommand(
        KEY_SPACE_COMMAND,
        (event) => {
          const selection = getSelection();
          if (!isRangeSelection(selection) || !selection.isCollapsed()) return false;

          const anchorNode = selection.anchor.getNode();
          const parent = anchorNode.getParent();
          if (!isParagraphNode(parent)) return false;

          const text = anchorNode.getTextContent();
          const isBullet  = /^[-*]$/.test(text);
          const isOrdered = !isBullet && /^\d+\.$/.test(text);
          if (!isBullet && !isOrdered) return false;

          event.preventDefault();

          const list = createListNode(isBullet ? 'bullet' : 'number');
          const item = createListItemNode();
          list.append(item);
          parent.replace(list);
          item.select(0, 0);

          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // Markdown-style list creation: "- text" or "1. text" + Enter
      editor.registerCommand(
        KEY_ENTER_COMMAND,
        (event) => {
          const selection = getSelection();
          if (!isRangeSelection(selection) || !selection.isCollapsed()) return false;

          const anchorNode = selection.anchor.getNode();
          const parent = anchorNode.getParent();
          if (!isParagraphNode(parent)) return false;

          const text = parent.getTextContent();

          const bulletMatch  = BULLET_RE.exec(text);
          const orderedMatch = !bulletMatch && ORDERED_RE.exec(text);

          if (!bulletMatch && !orderedMatch) return false;

          event?.preventDefault();

          const listType  = bulletMatch ? 'bullet' : 'number';
          const itemText  = (bulletMatch ?? orderedMatch)![1];

          const list      = createListNode(listType);
          const item1     = createListItemNode();
          const item2     = createListItemNode();

          item1.append(createTextNode(itemText));
          list.append(item1);
          list.append(item2);
          parent.replace(list);
          item2.select(0, 0);

          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // Tab → indent, Shift+Tab → outdent
      editor.registerCommand(
        KEY_TAB_COMMAND,
        (event) => {
          const selection = getSelection();
          if (!isRangeSelection(selection)) return false;

          const node = selection.anchor.getNode();
          const listItem = isListItemNode(node) ? node : node.getParent();
          if (isListItemNode(listItem)) {
            // Inside a list: create/remove sublist
            event.preventDefault();
            editor.dispatchCommand(
              event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND,
              undefined,
            );
            return true;
          }

          if (selection.isCollapsed()) {
            // Collapsed cursor in a paragraph: indent only the first line via text-indent
            const anchorNode = selection.anchor.getNode();
            const paragraph = isParagraphNode(anchorNode) ? anchorNode : anchorNode.getParent();
            if (isParagraphNode(paragraph)) {
              event.preventDefault();
              const TAB_SIZE = 2; // em
              const dom = editor.getElementByKey(paragraph.getKey()) as HTMLElement | null;
              const currentStr = dom?.style.textIndent ?? '';
              const current = currentStr ? parseFloat(currentStr) : 0;
              const next = event.shiftKey ? Math.max(0, current - TAB_SIZE) : current + TAB_SIZE;
              // Apply directly to DOM for immediate visual update
              if (dom) {
                if (next === 0) {
                  dom.style.removeProperty('text-indent');
                } else {
                  dom.style.textIndent = `${next}em`;
                }
              }
              // Also persist in Lexical state so it survives serialization
              const existingStyle = paragraph.getStyle() ?? '';
              const cleaned = existingStyle.replace(/text-indent\s*:[^;]*(;|$)\s*/g, '').trim().replace(/;$/, '');
              const newStyle = next === 0 ? cleaned : (cleaned ? `${cleaned}; text-indent: ${next}em` : `text-indent: ${next}em`);
              paragraph.setStyle(newStyle);
              return true;
            }
          }
          // Range selection or non-paragraph block: indent/outdent the block(s)
          event.preventDefault();
          editor.dispatchCommand(
            event.shiftKey ? OUTDENT_CONTENT_COMMAND : INDENT_CONTENT_COMMAND,
            undefined,
          );

          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // Backspace at paragraph start removes one level of text-indent
      editor.registerCommand(
        KEY_BACKSPACE_COMMAND,
        (event) => {
          const selection = getSelection();
          if (!isRangeSelection(selection) || !selection.isCollapsed()) return false;
          if (selection.anchor.offset !== 0) return false;

          const anchorNode = selection.anchor.getNode();
          const paragraph = isParagraphNode(anchorNode) ? anchorNode : anchorNode.getParent();
          if (!isParagraphNode(paragraph)) return false;

          // Only trigger when cursor is at the very start of the paragraph
          if (!isParagraphNode(anchorNode) && anchorNode.getPreviousSibling() !== null) return false;

          const dom = editor.getElementByKey(paragraph.getKey()) as HTMLElement | null;
          const currentStr = dom?.style.textIndent ?? '';
          if (!currentStr) return false;

          const current = parseFloat(currentStr);
          if (current <= 0) return false;

          event.preventDefault();
          const TAB_SIZE = 2;
          const next = Math.max(0, current - TAB_SIZE);
          if (dom) {
            if (next === 0) {
              dom.style.removeProperty('text-indent');
            } else {
              dom.style.textIndent = `${next}em`;
            }
          }
          const existingStyle = paragraph.getStyle() ?? '';
          const cleaned = existingStyle.replace(/text-indent\s*:[^;]*(;|$)\s*/g, '').trim().replace(/;$/, '');
          const newStyle = next === 0 ? cleaned : (cleaned ? `${cleaned}; text-indent: ${next}em` : `text-indent: ${next}em`);
          paragraph.setStyle(newStyle);
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
      // When a new ListItemNode is created (e.g. via Enter), inherit the
      // font-size from the previous sibling so the marker scales correctly.
      editor.registerNodeTransform(ListItemNode, (node) => {
        const curStyle = node.getStyle() ?? '';
        if (/font-size/.test(curStyle)) return;

        const prev = node.getPreviousSibling();
        if (!isListItemNode(prev)) return;

        const prevStyle = prev.getStyle() ?? '';
        const match = /font-size\s*:\s*([^;]+)/.exec(prevStyle);
        if (!match) return;

        node.setStyle(`font-size: ${match[1].trim()}`);
      }),
    );
  });
</script>
