<script lang="ts">
    import { FORMAT_TEXT_COMMAND } from 'lexical';
    import { getContext } from 'svelte';
    import Icon from '@iconify/svelte';
    import { icons, toolBarBtnStyle, activeBtnStyle } from '$lib/data/toolbar/toolbar';
    import type { Writable } from 'svelte/store';
    import { getActiveEditor, getIsEditable } from '$lexical/core/composerContext.js';
    import InsertCodeDialog from './dialogs/InsertCodeDialog.svelte';
    import Portal from '../generic/portal/Portal.svelte';

    const isEditable = getIsEditable();
    const activeEditor = getActiveEditor();
    const isCode: Writable<boolean> = getContext('isCode');

    let showPopup = $state(false);
    let showCodeModal = $state(false);
    let buttonEl = $state<HTMLButtonElement | undefined>();
    let popupEl = $state<HTMLDivElement | undefined>();

    // Position popup below the button (like TripleDotsDropDown)
    $effect(() => {
        if (showPopup && buttonEl && popupEl) {
            const { top, left } = buttonEl.getBoundingClientRect();
            popupEl.style.top = `${top + 34}px`;
            popupEl.style.left = `${left}px`;
        }
    });

    function openInline() {
        showPopup = false;
        $activeEditor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');
    }

    function openBlock() {
        showPopup = false;
        showCodeModal = true;
    }

    function handleClickOutside(e: MouseEvent) {
        if (!showPopup) return;
        const target = e.target as Node;
        const inButton = buttonEl?.contains(target);
        const inPopup = popupEl?.contains(target);
        if (!inButton && !inPopup) {
            showPopup = false;
        }
    }
</script>

<svelte:window onclick={handleClickOutside} />

<button
    bind:this={buttonEl}
    disabled={!$isEditable}
    onclick={() => { showPopup = !showPopup; }}
    class={'p-1 ' + toolBarBtnStyle + ($isCode ? ' ' + activeBtnStyle : '')}
    title="Insert code"
    type="button"
    aria-label="Insert code"
>
    <Icon icon={icons['code']} width="1rem" />
</button>

{#if showPopup}
    <Portal>
        <div
            bind:this={popupEl}
            class="fixed z-50 w-36 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#292c3c] shadow-xl backdrop-blur-sm py-1"
        >
            <button
                onclick={openInline}
                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-brand-charcoal-500 dark:text-[#c6d0f5] hover:bg-brand-sand-200 dark:hover:bg-[#414559]"
            >
                <Icon icon="solar:code-bold-duotone" width="0.9rem" />
                Inline
            </button>
            <button
                onclick={openBlock}
                class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-brand-charcoal-500 dark:text-[#c6d0f5] hover:bg-brand-sand-200 dark:hover:bg-[#414559]"
            >
                <Icon icon="solar:code-square-bold-duotone" width="0.9rem" />
                Block
            </button>
        </div>
    </Portal>
{/if}

<InsertCodeDialog bind:showModal={showCodeModal} />
