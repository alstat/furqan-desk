<script lang="ts">
  import {
    $getTableCellNodeFromLexicalNode as getTableCellNodeFromLexicalNode,
    TableCellNode,
  } from '@lexical/table';
  import {
    $getSelection as getSelection,
    $isRangeSelection as isRangeSelection,
  } from 'lexical';

  import {onMount} from 'svelte';
  import TableActionMenu from './TableActionMenu.svelte';
  import ColorPickerDialog from '$lexical/components/generic/colorpicker/ColorPickerDialog.svelte';
  import {writable, type Writable} from 'svelte/store';
  import {getEditor, getIsEditable} from '$lexical/core/composerContext.js';

  interface Props {
    anchorElem: HTMLElement;
    cellMerge: boolean;
  }

  let {anchorElem, cellMerge}: Props = $props();

  const editor = getEditor();
  const isEditable = getIsEditable();

  let menuButtonRef: HTMLElement | null = $state(null);
  let menuRootRef: HTMLButtonElement | null = $state(null);
  const isMenuOpen = writable(false);

  let colorPickerDialog: ColorPickerDialog;
  let cellPickerColor = $state('');

  function openCellColorPicker(
    cb: (value: string, skipHistoryStack: boolean) => void,
    color: string,
    anchor?: HTMLElement,
  ) {
    cellPickerColor = color;
    colorPickerDialog.open(cb, anchor);
  }

  const tableCellNode: Writable<TableCellNode | null> = writable(null);

  const moveMenu = () => {
    const menu = menuButtonRef;
    const selection = getSelection();
    const nativeSelection = window.getSelection();
    const activeElement = document.activeElement;

    if (selection == null || menu == null) {
      $tableCellNode = null;
      return;
    }

    const rootElement = editor.getRootElement();

    if (
      isRangeSelection(selection) &&
      rootElement !== null &&
      nativeSelection !== null &&
      rootElement.contains(nativeSelection.anchorNode)
    ) {
      const tableCellNodeFromSelection = getTableCellNodeFromLexicalNode(
        selection.anchor.getNode(),
      );

      if (tableCellNodeFromSelection == null) {
        $tableCellNode = null;
        return;
      }

      const tableCellParentNodeDOM = editor.getElementByKey(
        tableCellNodeFromSelection.getKey(),
      );

      if (tableCellParentNodeDOM == null) {
        $tableCellNode = null;
        return;
      }

      $tableCellNode = tableCellNodeFromSelection;
    } else if (!activeElement) {
      $tableCellNode = null;
    }
  };

  onMount(() => {
    return editor.registerUpdateListener(() => {
      editor.getEditorState().read(() => {
        moveMenu();
      });
    });
  });

  $effect(() => {
    const menuButtonDOM = menuButtonRef as HTMLButtonElement | null;
    const currentTableCellNode = $tableCellNode;

    if (menuButtonDOM != null && currentTableCellNode != null) {
      const tableCellNodeDOM = editor.getElementByKey(
        currentTableCellNode.getKey(),
      );

      if (tableCellNodeDOM != null) {
        const tableCellRect = tableCellNodeDOM.getBoundingClientRect();
        const menuRect = menuButtonDOM.getBoundingClientRect();

        // The button is absolutely positioned at 0,0 and moved by transform,
        // so those coordinates resolve against its *offset parent* — the
        // nearest positioned ancestor — and not against `anchorElem`.
        // Upstream the two are the same element, because there the button is
        // portalled into the anchor; here it is rendered inline, one level in,
        // so the anchor is the whole editor shell while the offset parent is
        // the container below the toolbar. Measuring from the anchor therefore
        // added the toolbar's height to every position, dropping the button
        // about a row: it lined up with the row *under* the cell holding the
        // cursor, which made it look like the menu acted on the wrong cell.
        //
        // `top`/`left` are offsets into the offset parent's padding box, so the
        // origin has to include its border — that is what clientTop/clientLeft
        // are. `anchorElem` stays the fallback for the case where there is no
        // offset parent to measure.
        const origin = menuButtonDOM.offsetParent ?? anchorElem;
        const originRect = origin.getBoundingClientRect();
        const originTop = originRect.top + origin.clientTop;
        const originLeft = originRect.left + origin.clientLeft;

        const top = tableCellRect.top - originTop + 4;
        const left = tableCellRect.right - menuRect.width - 10 - originLeft;

        menuButtonDOM.style.opacity = '1';
        menuButtonDOM.style.transform = `translate(${left}px, ${top}px)`;
      } else {
        menuButtonDOM.style.opacity = '0';
        menuButtonDOM.style.transform = 'translate(-10000px, -10000px)';
      }
    }
  });

  // Close menu when the active cell changes (non-reactive prev avoids recursive loop)
  let prevTableCellNode: TableCellNode | null = null;
  $effect(() => {
    const current = $tableCellNode;
    if (prevTableCellNode !== current) {
      $isMenuOpen = false;
      prevTableCellNode = current;
    }
  });
</script>

{#if $isEditable}
  <div class="table-cell-action-button-container" bind:this={menuButtonRef}>
    {#if $tableCellNode != null}
      <!-- svelte-ignore a11y_consider_explicit_label -->
      <button
        type="button"
        class="table-cell-action-button chevron-down"
        onclick={(e) => {
          e.stopPropagation();
          $isMenuOpen = !$isMenuOpen;
        }}
        bind:this={menuRootRef}>
        <i class="chevron-down"></i>
      </button>
      {#if $isMenuOpen}
        <TableActionMenu
          contextRef={menuRootRef}
          setIsMenuOpen={(val) => ($isMenuOpen = val)}
          onClose={() => ($isMenuOpen = false)}
          _tableCellNode={$tableCellNode}
          {cellMerge}
          onOpenColorPicker={openCellColorPicker} />
      {/if}
    {/if}
  </div>

  <!-- Rendered outside {#if $isMenuOpen} so dragging the picker doesn't destroy it -->
  <ColorPickerDialog
    title="Cell background color"
    color={cellPickerColor}
    bind:this={colorPickerDialog} />
{/if}
