<script lang="ts">
  import {run} from 'svelte/legacy';

  import './FloatingLinkEditor.css';
  import {
    $isLinkNode as isLinkNode,
    $isAutoLinkNode as isAutoLinkNode,
    TOGGLE_LINK_COMMAND,
    $createLinkNode as createLinkNode,
  } from '@lexical/link';
  import {
    mergeRegister,
    $findMatchingParent as findMatchingParent,
  } from '@lexical/utils';
  import {
    $getSelection as getSelection,
    $isRangeSelection as isRangeSelection,
    COMMAND_PRIORITY_HIGH,
    COMMAND_PRIORITY_LOW,
    KEY_ESCAPE_COMMAND,
    SELECTION_CHANGE_COMMAND,
    type LexicalEditor,
    type BaseSelection,
  } from 'lexical';
  import {onMount} from 'svelte';
  import type {Writable} from 'svelte/store';
  import Icon from '@iconify/svelte';
  import {t} from '$lib/i18n';
  import getSelectedNode from '../../../components/toolbar/getSelectionInfo.js';
  import {setFloatingElemPositionForLinkEditor} from './setFloatingElemPositionForLinkEditor.js';
  import {sanitizeUrl} from './url.js';

  let editorRef: HTMLDivElement;
  let inputRef: HTMLInputElement | undefined = $state();
  let linkUrl = $state('');
  let editedLinkUrl = $state('');
  interface Props {
    editor: LexicalEditor;
    isLink: Writable<boolean>;
    anchorElem: HTMLElement;
    isEditMode: Writable<boolean>;
  }

  let {editor, isLink, anchorElem, isEditMode}: Props = $props();
  let lastSelection: BaseSelection | null = null;

  run(() => {
    if ($isEditMode && inputRef) {
      inputRef.focus();
    }
  });

  run(() => {
    if (anchorElem && editorRef) {
      anchorElem.appendChild(editorRef as Node);
    }
  });

  onMount(() => {
    const scrollerElem = anchorElem.parentElement;

    const update = () => {
      editor.getEditorState().read(() => {
        updateLinkEditor();
      });
    };

    window.addEventListener('resize', update);

    if (scrollerElem) {
      scrollerElem.addEventListener('scroll', update);
    }

    return mergeRegister(
      () => {
        window.removeEventListener('resize', update);

        if (scrollerElem) {
          scrollerElem.removeEventListener('scroll', update);
        }
      },

      editor.registerUpdateListener(({editorState}) => {
        editorState.read(() => {
          updateLinkEditor();
        });
      }),

      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateLinkEditor();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),

      editor.registerCommand(
        KEY_ESCAPE_COMMAND,
        () => {
          if ($isLink) {
            $isLink = false;
            return true;
          }
          return false;
        },
        COMMAND_PRIORITY_HIGH,
      ),
    );
  });

  function updateLinkEditor() {
    const selection = getSelection();
    if (isRangeSelection(selection)) {
      const node = getSelectedNode(selection);
      const linkParent = findMatchingParent(node, isLinkNode);
      if (isLinkNode(linkParent)) {
        linkUrl = linkParent.getURL();
      } else if (isLinkNode(node)) {
        linkUrl = node.getURL();
      } else {
        linkUrl = '';
      }
    }
    // Keep the input in sync with the link's URL unless the user is actively
    // typing in it (so editing isn't clobbered by editor updates).
    if (!inputRef || document.activeElement !== inputRef) {
      editedLinkUrl = linkUrl;
    }
    const editorElem = editorRef;
    const nativeSelection = window.getSelection();
    const activeElement = document.activeElement;

    if (editorElem === null) {
      return;
    }

    const rootElement = editor.getRootElement();

    if (
      selection !== null &&
      nativeSelection !== null &&
      rootElement !== null &&
      rootElement.contains(nativeSelection.anchorNode) &&
      editor.isEditable()
    ) {
      const domRect: DOMRect | undefined =
        nativeSelection.focusNode?.parentElement?.getBoundingClientRect();
      if (domRect) {
        domRect.y += 40;
        setFloatingElemPositionForLinkEditor(domRect, editorElem, anchorElem);
      }
      lastSelection = selection;
    } else if (
      !(activeElement instanceof HTMLElement) ||
      !activeElement.classList.contains('floating-link-input')
    ) {
      if (rootElement !== null) {
        setFloatingElemPositionForLinkEditor(null, editorElem, anchorElem);
      }
      lastSelection = null;
      $isEditMode = false;
      linkUrl = '';
    }

    return true;
  }

  function monitorInputInteraction(
    event: KeyboardEvent & {currentTarget: EventTarget & HTMLInputElement},
  ) {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleLinkSubmission();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      $isEditMode = false;
    }
  }

  function handleLinkSubmission() {
    if (lastSelection !== null) {
      if (linkUrl !== '') {
        editor.dispatchCommand(TOGGLE_LINK_COMMAND, sanitizeUrl(editedLinkUrl));
        editor.update(() => {
          const selection = getSelection();
          if (isRangeSelection(selection)) {
            const parent = getSelectedNode(selection).getParent();
            if (isAutoLinkNode(parent)) {
              const linkNode = createLinkNode(parent.getURL(), {
                rel: parent.__rel,
                target: parent.__target,
                title: parent.__title,
              });
              parent.replace(linkNode, true);
            }
          }
        });
      }
      $isEditMode = false;
    }
  }
</script>

<div
  bind:this={editorRef}
  class="floating-link-editor {$isLink
    ? 'flex w-80 items-center gap-1 rounded-3xl border border-brand-sand-200 bg-white/95 py-1 pl-3 pr-1 shadow-xl backdrop-blur-sm dark:border-[#414559] dark:bg-[#363a4f]/95 dark:shadow-black/40'
    : ''}"
>
  {#if $isLink}
    <input
      bind:this={inputRef}
      bind:value={editedLinkUrl}
      placeholder={$t('link.placeholder')}
      class="floating-link-input min-w-0 flex-1 bg-transparent text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] outline-none"
      onfocus={() => {
        $isEditMode = true;
      }}
      onkeydown={(event) => {
        monitorInputInteraction(event);
      }} />
    <button
      onclick={handleLinkSubmission}
      onmousedown={(event) => event.preventDefault()}
      disabled={!editedLinkUrl.trim()}
      aria-label={$t('link.save')}
      title={$t('link.save')}
      class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 text-gray-100 dark:text-gray-700 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 hover:dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      <Icon icon="solar:check-circle-bold" width="0.9rem" />
    </button>
  {/if}
</div>
