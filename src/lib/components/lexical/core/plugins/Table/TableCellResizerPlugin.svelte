<script lang="ts">
  import {onMount} from 'svelte';
  import {getEditor} from '$lexical/core/composerContext.js';
  import {$isTableNode as isTableNode, TableNode} from '@lexical/table';
  import {$getNodeByKey as getNodeByKey} from 'lexical';

  const RESIZE_EDGE_PX = 8;
  const MIN_COL_WIDTH = 30;
  const MIN_ROW_HEIGHT = 20;

  const editor = getEditor();

  // Visual indicator (reactive so the div updates)
  let showIndicator = $state(false);
  let indicatorTop = $state(0);
  let indicatorLeft = $state(0);
  let indicatorWidth = $state(2);
  let indicatorHeight = $state(2);

  // Drag state — plain vars, not $state (no reactivity needed inside handlers)
  let isDragging = false;
  let resizeType: 'col' | 'row' = 'col';
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartSize = 0;
  let dragTableKey = '';
  let dragColIndex = 0;
  let dragColWidths: number[] = [];
  let dragRowEl: HTMLTableRowElement | null = null;

  // Linux's transformed app shell is a containing block for fixed descendants.
  // Keep this viewport-positioned indicator outside it so DOMRect coordinates
  // are not offset again by the client-side window frame.
  function portalToBody(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      },
    };
  }

  /** Get the Lexical node key attached by the editor to a DOM element. */
  function getLexicalKey(el: HTMLElement): string | null {
    // Lexical stores key as __lexicalKey_EDITORKEY on every owned DOM element
    const k = (el as any)[`__lexicalKey_${(editor as any)._key}`];
    return typeof k === 'string' ? k : null;
  }

  function getTableCellFromTarget(target: EventTarget | null): HTMLTableCellElement | null {
    if (!(target instanceof HTMLElement)) return null;
    return target.closest<HTMLTableCellElement>('td, th');
  }

  function isInEditor(el: Element): boolean {
    const rootEl = editor.getRootElement();
    return rootEl !== null && rootEl.contains(el);
  }

  /**
   * Set cursor on both body AND the editor root with !important so it beats
   * the contenteditable's own `cursor: text` CSS rule.
   */
  function setCursor(cursor: string) {
    document.body.style.setProperty('cursor', cursor, 'important');
    editor.getRootElement()?.style.setProperty('cursor', cursor, 'important');
  }

  function clearCursor() {
    document.body.style.removeProperty('cursor');
    editor.getRootElement()?.style.removeProperty('cursor');
  }

  function isNearRightEdge(cell: HTMLElement, clientX: number): boolean {
    const rect = cell.getBoundingClientRect();
    return clientX >= rect.right - RESIZE_EDGE_PX && clientX <= rect.right + RESIZE_EDGE_PX;
  }

  function isNearBottomEdge(cell: HTMLElement, clientY: number): boolean {
    const rect = cell.getBoundingClientRect();
    return clientY >= rect.bottom - RESIZE_EDGE_PX && clientY <= rect.bottom + RESIZE_EDGE_PX;
  }

  function getColIndexFromCell(cell: HTMLTableCellElement): number {
    let idx = 0;
    let sib: Element | null = cell.previousElementSibling;
    while (sib) {
      idx += (sib as HTMLTableCellElement).colSpan || 1;
      sib = sib.previousElementSibling;
    }
    return idx;
  }

  function handleMouseMove(event: MouseEvent) {
    if (isDragging) return;

    const cell = getTableCellFromTarget(event.target);
    if (!cell || !isInEditor(cell)) {
      if (showIndicator) showIndicator = false;
      document.body.style.removeProperty('cursor');
      return;
    }

    const nearRight = isNearRightEdge(cell, event.clientX);
    const nearBottom = isNearBottomEdge(cell, event.clientY);

    if (nearRight) {
      const tableEl = cell.closest<HTMLTableElement>('table');
      const tableRect = tableEl?.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      showIndicator = true;
      indicatorTop = tableRect?.top ?? cellRect.top;
      indicatorLeft = cellRect.right - 1;
      indicatorWidth = 2;
      indicatorHeight = tableRect?.height ?? cellRect.height;
      setCursor('col-resize');
    } else if (nearBottom) {
      const tableEl = cell.closest<HTMLTableElement>('table');
      const tableRect = tableEl?.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      showIndicator = true;
      indicatorTop = cellRect.bottom - 1;
      indicatorLeft = tableRect?.left ?? cellRect.left;
      indicatorWidth = tableRect?.width ?? cellRect.width;
      indicatorHeight = 2;
      setCursor('row-resize');
    } else {
      showIndicator = false;
      clearCursor();
    }
  }

  function handleMouseDown(event: MouseEvent) {
    const cell = getTableCellFromTarget(event.target);
    if (!cell || !isInEditor(cell)) return;

    const nearRight = isNearRightEdge(cell, event.clientX);
    const nearBottom = isNearBottomEdge(cell, event.clientY);
    if (!nearRight && !nearBottom) return;

    event.preventDefault();
    event.stopPropagation();

    // Get table key directly from the DOM element (avoids needing active editor context)
    const tableEl = cell.closest<HTMLTableElement>('table');
    if (!tableEl) return;
    const tableKey = getLexicalKey(tableEl);
    if (!tableKey) return;

    if (nearRight) {
      resizeType = 'col';
      dragStartX = event.clientX;
      dragStartSize = cell.offsetWidth;
      dragColIndex = getColIndexFromCell(cell);

      let initialColWidths: number[] = [];
      // $getNodeByKey only needs activeEditorState (set by getEditorState().read), not activeEditor
      editor.getEditorState().read(() => {
        const tableNode = getNodeByKey<TableNode>(tableKey);
        if (tableNode && isTableNode(tableNode)) {
          const stored = tableNode.getColWidths();
          if (stored && stored.length > 0) {
            initialColWidths = [...stored];
          }
        }
      });

      // Fall back to current DOM widths if no stored widths
      if (initialColWidths.length === 0) {
        const cols = Array.from(tableEl.querySelectorAll('col'));
        if (cols.length > 0) {
          initialColWidths = cols.map(c => {
            const w = parseInt((c as HTMLElement).style.width);
            return isNaN(w) ? 75 : w;
          });
        } else {
          const firstRow = tableEl.querySelector('tr');
          if (firstRow) {
            initialColWidths = Array.from(firstRow.querySelectorAll('td,th')).map(
              c => (c as HTMLElement).offsetWidth,
            );
          }
        }
      }

      dragTableKey = tableKey;
      dragColWidths = initialColWidths;
      while (dragColWidths.length <= dragColIndex) dragColWidths.push(75);

    } else {
      resizeType = 'row';
      dragStartY = event.clientY;
      const row = cell.closest('tr') as HTMLTableRowElement | null;
      if (!row) return;
      dragStartSize = row.offsetHeight;
      dragRowEl = row;
      dragTableKey = tableKey;
    }

    isDragging = true;
    setCursor(resizeType === 'col' ? 'col-resize' : 'row-resize');
    document.addEventListener('mousemove', handleDragMove);
    document.addEventListener('mouseup', handleDragEnd, {once: true});
  }

  function handleDragMove(event: MouseEvent) {
    if (!isDragging) return;

    if (resizeType === 'col') {
      const dx = event.clientX - dragStartX;
      const newWidth = Math.max(MIN_COL_WIDTH, dragStartSize + dx);

      const tableEl = editor.getElementByKey(dragTableKey) as HTMLTableElement | null;
      if (tableEl) {
        const cols = tableEl.querySelectorAll('col');
        if (cols.length > dragColIndex) {
          (cols[dragColIndex] as HTMLElement).style.width = `${newWidth}px`;
        }
        // Keep indicator following mouse
        const tableRect = tableEl.getBoundingClientRect();
        indicatorLeft = event.clientX;
        indicatorTop = tableRect.top;
        indicatorHeight = tableRect.height;
        indicatorWidth = 2;
      }
    } else {
      const dy = event.clientY - dragStartY;
      const newHeight = Math.max(MIN_ROW_HEIGHT, dragStartSize + dy);
      if (dragRowEl) {
        dragRowEl.style.height = `${newHeight}px`;
        const tableEl = editor.getElementByKey(dragTableKey) as HTMLTableElement | null;
        const tableRect = tableEl?.getBoundingClientRect();
        indicatorTop = event.clientY;
        indicatorLeft = tableRect?.left ?? 0;
        indicatorWidth = tableRect?.width ?? 0;
        indicatorHeight = 2;
      }
    }
  }

  function handleDragEnd(event: MouseEvent) {
    if (!isDragging) return;

    if (resizeType === 'col') {
      const dx = event.clientX - dragStartX;
      const newWidth = Math.round(Math.max(MIN_COL_WIDTH, dragStartSize + dx));

      const newColWidths = [...dragColWidths];
      while (newColWidths.length <= dragColIndex) newColWidths.push(75);
      newColWidths[dragColIndex] = newWidth;

      const tableKey = dragTableKey;
      editor.update(() => {
        const tableNode = getNodeByKey<TableNode>(tableKey);
        if (tableNode && isTableNode(tableNode)) {
          tableNode.setColWidths(newColWidths);
        }
      });
    }
    // Row height: already applied visually to the TR element (no Lexical API for persistence)

    isDragging = false;
    showIndicator = false;
    clearCursor();
    document.removeEventListener('mousemove', handleDragMove);
    dragRowEl = null;
  }

  onMount(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousedown', handleMouseDown, {capture: true});

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mousedown', handleMouseDown, {capture: true});
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
      clearCursor();
    };
  });
</script>

{#if showIndicator}
  <div
    use:portalToBody
    style="position:fixed;z-index:9999;pointer-events:none;background:var(--color-brand-gold-400,#e8a844);top:{indicatorTop}px;left:{indicatorLeft}px;width:{indicatorWidth}px;height:{indicatorHeight}px;"
  ></div>
{/if}
