<script lang="ts">
    import { getEditor } from "$lexical/core/composerContext.js";
    import { INSERT_TABLE_COMMAND } from "@lexical/table";
    import { getCommands } from "$lexical/core/commands.js";
    import { tick, onDestroy } from "svelte";
    import { fly } from "svelte/transition";
    import Icon from "@iconify/svelte";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import DialogPanelHeader from "$lib/components/shared/DialogPanelHeader.svelte";
    import { t } from '$lib/i18n';

    let rows = $state("5");
    let columns = $state("5");
    let isDisabled = $derived(
        (() => {
            const row = Number(rows);
            const column = Number(columns);
            return !(row > 0 && row <= 500 && column > 0 && column <= 50);
        })(),
    );

    const editor = getEditor();

    interface Props {
        showModal?: boolean;
    }

    let { showModal = $bindable(false) }: Props = $props();

    export function open() {
        showModal = true;
    }

    async function close() {
        showModal = false;
        await tick();
        getCommands().FocusEditor.execute(editor);
    }

    function onConfirm() {
        editor.dispatchCommand(INSERT_TABLE_COMMAND, {
            columns,
            rows,
            includeHeaders: { rows: true, columns: false },
        });
        rows = "5";
        columns = "5";
    }

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }

    // ── Drag ────────────────────────────────────────────────────────────────
    const PANEL_W = 384; // matches max-w-sm

    let x = $state(0);
    let y = $state(0);
    let zIndex = $state(500);
    let isDragging = $state(false);
    let dragStartX = 0,
        dragStartY = 0,
        startX = 0,
        startY = 0;
    let initialized = false;

    $effect(() => {
        if (showModal && !initialized) {
            x = Math.max(0, (window.innerWidth - PANEL_W) / 2);
            y = Math.max(8, (window.innerHeight - 340) * 0.25);
            zIndex = bringToFront();
            initialized = true;
        }
        if (!showModal) initialized = false;
    });

    function startDrag(e: PointerEvent) {
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startX = x;
        startY = y;
        window.addEventListener("pointermove", onDrag);
        window.addEventListener("pointerup", stopDrag, { once: true });
    }

    function onDrag(e: PointerEvent) {
        x = Math.max(
            0,
            Math.min(
                window.innerWidth - PANEL_W,
                startX + (e.clientX - dragStartX),
            ),
        );
        y = Math.max(
            0,
            Math.min(
                window.innerHeight - 60,
                startY + (e.clientY - dragStartY),
            ),
        );
    }

    function stopDrag() {
        isDragging = false;
        window.removeEventListener("pointermove", onDrag);
    }

    onDestroy(() => {
        if (typeof window !== "undefined")
            window.removeEventListener("pointermove", onDrag);
    });
</script>

{#if showModal}
    <div
        use:portal
        transition:fly={{ y: 8, duration: 180, opacity: 0 }}
        role="dialog"
        aria-modal="true"
        aria-label={$t('dialog.insert_table')}
        tabindex="-1"
        class="fixed flex flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
        style="left:{x}px; top:{y}px; width:{PANEL_W}px; z-index:{zIndex};"
        onpointerdown={() => {
            zIndex = bringToFront();
        }}
        onkeydown={(e) => {
            if (e.key === "Escape") close();
        }}
    >
        <!-- Header -->
        <DialogPanelHeader
            icon="fluent:table-16-filled"
            title={$t('dialog.insert_table')}
            {isDragging}
            onClose={close}
            onpointerdown={startDrag}
        />

        <!-- Body -->
        <div
            class="px-5 py-5 bg-brand-sand-50 dark:bg-[#232634] flex flex-col gap-3"
        >
            <!-- Rows -->
            <div class="flex flex-col gap-1.5">
                <label
                    class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                    >{$t('dialog.rows')}</label
                >
                <input
                    type="number"
                    bind:value={rows}
                    placeholder={$t('dialog.rows_placeholder')}
                    min="1"
                    max="500"
                    data-test-id="table-modal-rows"
                    class="h-9 w-full rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors dark:[color-scheme:dark]"
                />
            </div>

            <!-- Columns -->
            <div class="flex flex-col gap-1.5">
                <label
                    class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                    >{$t('dialog.columns')}</label
                >
                <input
                    type="number"
                    bind:value={columns}
                    placeholder={$t('dialog.columns_placeholder')}
                    min="1"
                    max="50"
                    data-test-id="table-modal-columns"
                    class="h-9 w-full rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors dark:[color-scheme:dark]"
                />
            </div>

            <!-- Action -->
            <button
                disabled={isDisabled}
                onclick={onConfirm}
                data-test-id="table-model-confirm-insert"
                class="cursor-pointer flex items-center justify-center gap-1.5 rounded-full py-1.5 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 bg-brand-gold-400 hover:bg-brand-gold-600 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
            >
                <Icon icon="tabler:table" width="0.8rem" />
                {$t('dialog.insert_table')}
            </button>
        </div>
    </div>
{/if}
