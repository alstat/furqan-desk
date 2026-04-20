<script lang="ts">
    import { onMount } from "svelte";
    import { fly } from "svelte/transition";
    import Icon from "@iconify/svelte";
    import { icons } from "$lib/data/toolbar/toolbar.js";
    import { getEditor } from "$lexical/core/composerContext.js";
    import {
        $getSelection as getSelection,
        $isRangeSelection as isRangeSelection,
        $isTextNode as isTextNode,
        $getNodeByKey as getNodeByKey,
        $createParagraphNode as createParagraphNode,
        COMMAND_PRIORITY_CRITICAL,
        KEY_ARROW_DOWN_COMMAND,
        KEY_ARROW_UP_COMMAND,
        KEY_ENTER_COMMAND,
        KEY_ESCAPE_COMMAND,
        KEY_TAB_COMMAND,
    } from "lexical";
    import {
        mergeRegister,
        $insertNodeToNearestRoot as insertNodeToNearestRoot,
    } from "@lexical/utils";
    import { $createTableNodeWithDimensions as createTableNodeWithDimensions } from "@lexical/table";
    import { $createEquationNode as createEquationNode } from "../Equation/EquationNode.js";
    import { $setBlocksType as setBlocksType } from "@lexical/selection";
    import { $createQuoteNode as createQuoteNode } from "@lexical/rich-text";
    import { INSERT_CHECK_LIST_COMMAND } from "@lexical/list";
    import { t } from "$lib/i18n";

    const editor = getEditor();

    interface SlashCommand {
        id: string;
        label: string;
        description: string;
        icon: string;
    }

    const COMMANDS: SlashCommand[] = $derived([
        {
            id: "math",
            label: $t("slash.math_label"),
            description: $t("slash.math_desc"),
            icon: icons["math"],
        },
        {
            id: "math-block",
            label: $t("slash.math_block_label"),
            description: $t("slash.math_block_desc"),
            icon: icons["math"],
        },
        {
            id: "table",
            label: $t("slash.table_label"),
            description: $t("slash.table_desc"),
            icon: "fluent:table-16-filled",
        },
        {
            id: "quote",
            label: $t("slash.quote_label"),
            description: $t("slash.quote_desc"),
            icon: icons["quote"],
        },
        {
            id: "checklist",
            label: $t("slash.checklist_label"),
            description: $t("slash.checklist_desc"),
            icon: icons["checklist"],
        },
    ]);

    let isOpen = $state(false);
    let query = $state("");
    let selectedIndex = $state(0);
    let menuRect = $state<DOMRect | null>(null);

    // Captured each time the menu (re)opens
    let anchorNodeKey = "";
    let slashOffset = 0;

    let filteredCommands = $derived(
        COMMANDS.filter((cmd) => {
            if (!query) return true;
            if (cmd.id === "table") return /^table(-\d+(-\d+)?)?$/.test(query);
            return cmd.id.startsWith(query);
        }),
    );

    function closeMenu() {
        isOpen = false;
        selectedIndex = 0;
    }

    function selectCommand(cmdId: string) {
        const capturedKey = anchorNodeKey;
        const capturedOffset = slashOffset;
        const capturedQuery = query;
        closeMenu();

        editor.update(() => {
            const textNode = getNodeByKey(capturedKey);
            if (!isTextNode(textNode)) return;

            // Delete the slash + query text, collapsing cursor to the slash position
            const sel = textNode.select(
                capturedOffset,
                capturedOffset + 1 + capturedQuery.length,
            );
            sel.insertText("");

            const freshSel = getSelection();
            if (!isRangeSelection(freshSel)) return;

            if (cmdId === "math") {
                freshSel.insertNodes([createEquationNode("", true, true)]);
            } else if (cmdId === "math-block") {
                const eqNode = createEquationNode("", false, true);
                freshSel.insertNodes([eqNode]);
                // Block decorator nodes don't auto-create a trailing paragraph — add one
                // so the cursor can navigate past the block.
                if (eqNode.getNextSibling() === null) {
                    const para = createParagraphNode();
                    eqNode.insertAfter(para);
                    para.select();
                }
            } else if (cmdId === "table") {
                const match = capturedQuery.match(/^table-(\d+)-(\d+)$/);
                const rows = match ? parseInt(match[1]) : 5;
                const cols = match ? parseInt(match[2]) : 5;
                const tableNode = createTableNodeWithDimensions(rows, cols, {
                    rows: true,
                    columns: false,
                });
                insertNodeToNearestRoot(tableNode);
                if (tableNode.getNextSibling() === null) {
                    const para = createParagraphNode();
                    tableNode.insertAfter(para);
                }
            } else if (cmdId === "quote") {
                const sel = getSelection();
                setBlocksType(sel, () => createQuoteNode());
            }
        });

        if (cmdId === "checklist") {
            editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
        }
    }

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return {
            destroy() {
                node.remove();
            },
        };
    }

    let menuLeft = $derived(
        menuRect ? Math.min(menuRect.left, window.innerWidth - 264) : 0,
    );
    let menuTop = $derived(menuRect ? menuRect.bottom + 6 : 0);

    onMount(() => {
        return mergeRegister(
            editor.registerUpdateListener(({ editorState }) => {
                let found: { q: string; offset: number; key: string } | null =
                    null;

                editorState.read(() => {
                    const selection = getSelection();
                    if (
                        !isRangeSelection(selection) ||
                        !selection.isCollapsed()
                    )
                        return;

                    const anchor = selection.anchor;
                    const anchorNode = anchor.getNode();
                    if (!isTextNode(anchorNode)) return;

                    const textBefore = anchorNode
                        .getTextContent()
                        .slice(0, anchor.offset);
                    const slashIdx = textBefore.lastIndexOf("/");
                    if (slashIdx === -1) return;

                    // Only trigger if slash is at start of text or preceded by whitespace
                    if (slashIdx > 0 && !/\s/.test(textBefore[slashIdx - 1]))
                        return;

                    const afterSlash = textBefore.slice(slashIdx + 1);
                    // Stop if the user typed a space after the slash
                    if (afterSlash.includes(" ")) return;

                    found = {
                        q: afterSlash,
                        offset: slashIdx,
                        key: anchorNode.getKey(),
                    };
                });

                if (found) {
                    const { q, offset, key } = found as {
                        q: string;
                        offset: number;
                        key: string;
                    };
                    const filtered = COMMANDS.filter((cmd) => {
                        if (!q) return true;
                        if (cmd.id === "table")
                            return /^table(-\d+(-\d+)?)?$/.test(q);
                        return cmd.id.startsWith(q);
                    });

                    if (filtered.length > 0) {
                        const rect =
                            window
                                .getSelection()
                                ?.getRangeAt(0)
                                ?.getBoundingClientRect() ?? null;
                        anchorNodeKey = key;
                        slashOffset = offset;
                        query = q;
                        isOpen = true;
                        if (rect) menuRect = rect;
                        if (selectedIndex >= filtered.length) selectedIndex = 0;
                    } else {
                        closeMenu();
                    }
                } else if (isOpen) {
                    closeMenu();
                }
            }),

            editor.registerCommand(
                KEY_ARROW_DOWN_COMMAND,
                (e) => {
                    if (!isOpen || filteredCommands.length === 0) return false;
                    e?.preventDefault();
                    selectedIndex =
                        (selectedIndex + 1) % filteredCommands.length;
                    return true;
                },
                COMMAND_PRIORITY_CRITICAL,
            ),

            editor.registerCommand(
                KEY_ARROW_UP_COMMAND,
                (e) => {
                    if (!isOpen || filteredCommands.length === 0) return false;
                    e?.preventDefault();
                    selectedIndex =
                        (selectedIndex - 1 + filteredCommands.length) %
                        filteredCommands.length;
                    return true;
                },
                COMMAND_PRIORITY_CRITICAL,
            ),

            editor.registerCommand(
                KEY_ENTER_COMMAND,
                (e) => {
                    if (!isOpen || filteredCommands.length === 0) return false;
                    e?.preventDefault();
                    selectCommand(filteredCommands[selectedIndex].id);
                    return true;
                },
                COMMAND_PRIORITY_CRITICAL,
            ),

            editor.registerCommand(
                KEY_TAB_COMMAND,
                (e) => {
                    if (!isOpen || filteredCommands.length === 0) return false;
                    e?.preventDefault();
                    selectCommand(filteredCommands[selectedIndex].id);
                    return true;
                },
                COMMAND_PRIORITY_CRITICAL,
            ),

            editor.registerCommand(
                KEY_ESCAPE_COMMAND,
                () => {
                    if (!isOpen) return false;
                    closeMenu();
                    return true;
                },
                COMMAND_PRIORITY_CRITICAL,
            ),
        );
    });
</script>

{#if isOpen && filteredCommands.length > 0 && menuRect}
    <!-- svelte-ignore a11y_interactive_supports_focus -->
    <div
        use:portal
        transition:fly={{ y: 4, duration: 120, opacity: 0 }}
        role="listbox"
        class="fixed z-50 w-64 rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
        style="top: {menuTop}px; left: {menuLeft}px;"
    >
        {#each filteredCommands as cmd, i}
            <!-- svelte-ignore a11y_interactive_supports_focus -->
            <div
                role="option"
                aria-selected={i === selectedIndex}
                class="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer transition-colors {i ===
                selectedIndex
                    ? 'bg-brand-gold-100 dark:bg-[#414559]'
                    : 'hover:bg-brand-sand-50 dark:hover:bg-[#292c3c]'}"
                onmousedown={(e) => {
                    e.preventDefault();
                    selectCommand(cmd.id);
                }}
            >
                <span
                    class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-gold-100 dark:bg-[#414559]"
                >
                    <Icon
                        icon={cmd.icon}
                        class="text-brand-gold-600"
                        width="0.9rem"
                    />
                </span>
                <span class="flex flex-col min-w-0">
                    <span
                        class="text-[11px] font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                    >
                        {cmd.label}
                    </span>
                    <span
                        class="text-[10px] text-brand-charcoal-300 dark:text-[#626880] truncate"
                    >
                        {cmd.description}
                    </span>
                </span>
            </div>
        {/each}
    </div>
{/if}
