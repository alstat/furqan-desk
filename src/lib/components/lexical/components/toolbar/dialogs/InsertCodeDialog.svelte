<script lang="ts">
    import { getActiveEditor } from "$lexical/core/composerContext.js";
    import { INSERT_CODE_COMMAND } from "$lexical/core/plugins/CodeHighlighter/CodePlugin.svelte";
    import { getCommands } from "$lexical/core/commands.js";
    import { tick, onDestroy } from "svelte";
    import Icon from "@iconify/svelte";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import DialogPanelHeader from "$lib/components/shared/DialogPanelHeader.svelte";

    const activeEditor = getActiveEditor();

    interface Props {
        showModal?: boolean;
    }

    let { showModal = $bindable(false) }: Props = $props();

    let language = $state("javascript");
    let code = $state("");

    async function close() {
        showModal = false;
        await tick();
        getCommands().FocusEditor.execute($activeEditor);
    }

    function onConfirm() {
        $activeEditor.dispatchCommand(INSERT_CODE_COMMAND, { code, language });
        code = "";
    }

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }

    const languages = [
        "javascript",
        "typescript",
        "python",
        "julia",
        "r",
        "css",
        "html",
        "sql",
        "json",
        "yaml",
        "bash",
    ];

    // ── Drag ────────────────────────────────────────────────────────────────
    const PANEL_W = 448; // matches max-w-md

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
            y = Math.max(8, (window.innerHeight - 500) * 0.25);
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
    const selectClass =
        "w-full appearance-none cursor-pointer rounded-xl border border-brand-sand-200 bg-brand-sand-50/80 px-3 py-1.5 pr-8 text-xs text-brand-charcoal-500 transition-all focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 hover:border-brand-sand-400 hover:bg-brand-sand-100";
</script>

{#if showModal}
    <div
        use:portal
        role="dialog"
        aria-modal="true"
        aria-label="Insert Code Block"
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
            icon="solar:code-square-bold-duotone"
            title="Insert Code Block"
            {isDragging}
            onClose={close}
            onpointerdown={startDrag}
        />

        <!-- Body -->
        <div
            class="px-5 py-4 bg-brand-sand-50 dark:bg-[#232634] flex flex-col gap-3"
        >
            <!-- Language selector -->
            <div class="flex flex-col gap-1.5">
                <label
                    class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                    >Language</label
                >
                <div class="relative">
                    <select bind:value={language} class={selectClass}>
                        {#each languages as lang}
                            <option class="cursor-pointer" value={lang}
                                >{lang}</option
                            >
                        {/each}
                    </select>
                    <span
                        class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                    >
                        <Icon icon="charm:chevron-down" width="0.75rem" />
                    </span>
                </div>
            </div>

            <!-- Code textarea -->
            <div class="flex flex-col gap-1.5">
                <label
                    class="text-[10px] font-semibold uppercase tracking-widest text-brand-charcoal-300"
                    >Code</label
                >
                <textarea
                    bind:value={code}
                    placeholder="Paste or type your code here..."
                    rows="8"
                    class="w-full resize-y rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-100 dark:bg-[#1e2030] px-3 py-2.5 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 transition-colors font-mono"
                ></textarea>
            </div>

            <!-- Action -->
            <button
                disabled={!code.trim()}
                onclick={onConfirm}
                class="cursor-pointer flex items-center justify-center gap-1.5 rounded-full bg-brand-gold-400 py-2 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 active:bg-brand-gold-600/90 disabled:opacity-50 transition-colors"
            >
                <Icon icon="solar:code-square-bold" width="0.8rem" />
                Insert Code Block
            </button>
        </div>
    </div>
{/if}
