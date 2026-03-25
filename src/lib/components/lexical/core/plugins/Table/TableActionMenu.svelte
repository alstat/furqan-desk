<script lang="ts">
    import ColorPickerDialog from "$lexical/components/generic/colorpicker/ColorPickerDialog.svelte";
    import { getEditor } from "$lexical/core/composerContext.js";
    import {
        $unmergeCell as unmergeCell,
        TableCellNode,
        $insertTableRow__EXPERIMENTAL as insertTableRow__EXPERIMENTAL,
        $insertTableColumn__EXPERIMENTAL as insertTableColumn__EXPERIMENTAL,
        $deleteTableRow__EXPERIMENTAL as deleteTableRow__EXPERIMENTAL,
        $deleteTableColumn__EXPERIMENTAL as deleteTableColumn__EXPERIMENTAL,
        $getTableRowIndexFromTableCellNode as getTableRowIndexFromTableCellNode,
        $isTableRowNode as isTableRowNode,
        TableCellHeaderStates,
        TableRowNode,
        $getTableColumnIndexFromTableCellNode as getTableColumnIndexFromTableCellNode,
    } from "@lexical/table";
    import {
        $getSelection as getSelection,
        $isRangeSelection as isRangeSelection,
        type LexicalEditor,
        $getRoot as getRoot,
        $isParagraphNode as isParagraphNode,
        $createParagraphNode as createParagraphNode,
        ElementNode,
        $isTextNode as isTextNode,
        $isElementNode as isElementNode,
    } from "lexical";
    import {
        $isTableSelection as isTableSelection,
        $getNodeTriplet as getNodeTriplet,
        $isTableCellNode as isTableCellNode,
        type TableSelection,
        $getTableNodeFromLexicalNodeOrThrow as getTableNodeFromLexicalNodeOrThrow,
        type HTMLTableElementWithWithTableSelectionState,
        getTableObserverFromTableElement,
    } from "@lexical/table";
    import { onMount } from "svelte";
    import { mergeRegister } from "@lexical/utils";
    import { writable } from "svelte/store";
    import Portal from "$lexical/components/generic/portal/Portal.svelte";
    import Icon from "@iconify/svelte";

    interface Props {
        onClose: () => void;
        _tableCellNode: TableCellNode;
        setIsMenuOpen: (isOpen: boolean) => void;
        contextRef: null | HTMLElement;
        cellMerge: boolean;
    }

    let {
        onClose,
        _tableCellNode,
        setIsMenuOpen,
        contextRef,
        cellMerge,
    }: Props = $props();

    let colorPicker: ColorPickerDialog;

    const editor = getEditor();
    let dropDownRef: HTMLDivElement | null = $state(null);
    let tableCellNode = $state(_tableCellNode);
    let selectionCounts = $state({
        columns: 1,
        rows: 1,
    });
    let canMergeCells = $state(false);
    let canUnmergeCell = $state(false);

    function currentCellBackgroundColor(editor: LexicalEditor): null | string {
        return editor.getEditorState().read(() => {
            const selection = getSelection();
            if (isRangeSelection(selection) || isTableSelection(selection)) {
                const [cell] = getNodeTriplet(selection.anchor);
                if (isTableCellNode(cell)) {
                    return cell.getBackgroundColor();
                }
            }
            return null;
        });
    }

    function computeSelectionCount(selection: TableSelection): {
        columns: number;
        rows: number;
    } {
        const selectionShape = selection.getShape();
        return {
            columns: selectionShape.toX - selectionShape.fromX + 1,
            rows: selectionShape.toY - selectionShape.fromY + 1,
        };
    }

    function canUnmerge(): boolean {
        const selection = getSelection();
        if (
            (isRangeSelection(selection) && !selection.isCollapsed()) ||
            (isTableSelection(selection) &&
                !selection.anchor.is(selection.focus)) ||
            (!isRangeSelection(selection) && !isTableSelection(selection))
        ) {
            return false;
        }
        const [cell] = getNodeTriplet(selection.anchor);
        return cell.__colSpan > 1 || cell.__rowSpan > 1;
    }

    function cellContainsEmptyParagraph(cell: TableCellNode): boolean {
        if (cell.getChildrenSize() !== 1) {
            return false;
        }
        const firstChild = cell.getFirstChildOrThrow();
        if (!isParagraphNode(firstChild) || !firstChild.isEmpty()) {
            return false;
        }
        return true;
    }

    function selectLastDescendant(node: ElementNode): void {
        const lastDescendant = node.getLastDescendant();
        if (isTextNode(lastDescendant)) {
            lastDescendant.select();
        } else if (isElementNode(lastDescendant)) {
            lastDescendant.selectEnd();
        } else if (lastDescendant !== null) {
            lastDescendant.selectNext();
        }
    }

    let backgroundColor = writable(currentCellBackgroundColor(editor) || "");

    onMount(() => {
        editor.getEditorState().read(() => {
            const selection = getSelection();
            if (isTableSelection(selection)) {
                const currentSelectionCounts = computeSelectionCount(selection);
                selectionCounts = computeSelectionCount(selection);
                canMergeCells =
                    currentSelectionCounts.columns > 1 ||
                    currentSelectionCounts.rows > 1;
            }
            canUnmergeCell = canUnmerge();
        });

        return mergeRegister(
            editor.registerMutationListener(
                TableCellNode,
                (nodeMutations) => {
                    const nodeUpdated =
                        nodeMutations.get(tableCellNode.getKey()) === "updated";

                    if (nodeUpdated) {
                        editor.getEditorState().read(() => {
                            tableCellNode = tableCellNode.getLatest();
                        });
                        $backgroundColor =
                            currentCellBackgroundColor(editor) || "";
                    }
                },
                { skipInitialization: true },
            ),
        );
    });

    // Position the dropdown next to the trigger button (fixed positioning = viewport coords)
    $effect(() => {
        const menuButtonElement = contextRef;
        const dropDownElement = dropDownRef;
        const rootElement = editor.getRootElement();

        if (
            menuButtonElement != null &&
            dropDownElement != null &&
            rootElement != null
        ) {
            const rootEleRect = rootElement.getBoundingClientRect();
            const menuButtonRect = menuButtonElement.getBoundingClientRect();
            dropDownElement.style.opacity = "1";
            const dropDownElementRect = dropDownElement.getBoundingClientRect();
            const margin = 5;
            let leftPosition = menuButtonRect.right + margin;
            if (
                leftPosition + dropDownElementRect.width > window.innerWidth ||
                leftPosition + dropDownElementRect.width > rootEleRect.right
            ) {
                const position =
                    menuButtonRect.left - dropDownElementRect.width - margin;
                leftPosition = position < 0 ? margin : position;
            }
            dropDownElement.style.left = `${leftPosition}px`;

            let topPosition = menuButtonRect.top;
            if (topPosition + dropDownElementRect.height > window.innerHeight) {
                const position =
                    menuButtonRect.bottom - dropDownElementRect.height;
                topPosition = position < 0 ? margin : position;
            }
            dropDownElement.style.top = `${topPosition}px`;
        }
    });

    onMount(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                dropDownRef != null &&
                contextRef != null &&
                !dropDownRef.contains(event.target as Node) &&
                !contextRef.contains(event.target as Node)
            ) {
                setIsMenuOpen(false);
            }
        }

        window.addEventListener("click", handleClickOutside);

        return () => window.removeEventListener("click", handleClickOutside);
    });

    const clearTableSelection = () => {
        editor.update(() => {
            if (tableCellNode.isAttached()) {
                const tableNode =
                    getTableNodeFromLexicalNodeOrThrow(tableCellNode);
                const tableElement = editor.getElementByKey(
                    tableNode.getKey(),
                ) as HTMLTableElementWithWithTableSelectionState;

                if (!tableElement) {
                    throw new Error("Expected to find tableElement in DOM");
                }

                const tableObserver =
                    getTableObserverFromTableElement(tableElement);
                if (tableObserver !== null) {
                    tableObserver.$clearHighlight();
                }

                tableNode.markDirty();
                tableCellNode = tableCellNode.getLatest();
            }

            const rootNode = getRoot();
            rootNode.selectStart();
        });
    };

    const mergeTableCellsAtSelection = () => {
        editor.update(() => {
            const selection = getSelection();
            if (isTableSelection(selection)) {
                const { columns, rows } = computeSelectionCount(selection);
                const nodes = selection.getNodes();
                let firstCell: null | TableCellNode = null;
                for (let i = 0; i < nodes.length; i++) {
                    const node = nodes[i];
                    if (isTableCellNode(node)) {
                        if (firstCell === null) {
                            node.setColSpan(columns).setRowSpan(rows);
                            firstCell = node;
                            const isEmpty = cellContainsEmptyParagraph(node);
                            let firstChild;
                            if (
                                isEmpty &&
                                isParagraphNode(
                                    (firstChild = node.getFirstChild()),
                                )
                            ) {
                                firstChild.remove();
                            }
                        } else if (isTableCellNode(firstCell)) {
                            const isEmpty = cellContainsEmptyParagraph(node);
                            if (!isEmpty) {
                                firstCell.append(...node.getChildren());
                            }
                            node.remove();
                        }
                    }
                }
                if (firstCell !== null) {
                    if (firstCell.getChildrenSize() === 0) {
                        firstCell.append(createParagraphNode());
                    }
                    selectLastDescendant(firstCell);
                }
                onClose();
            }
        });
    };

    const unmergeTableCellsAtSelection = () => {
        editor.update(() => {
            unmergeCell();
        });
    };

    const insertTableRowAtSelection = (shouldInsertAfter: boolean) => {
        editor.update(() => {
            insertTableRow__EXPERIMENTAL(shouldInsertAfter);
            onClose();
        });
    };

    const insertTableColumnAtSelection = (shouldInsertAfter: boolean) => {
        editor.update(() => {
            for (let i = 0; i < selectionCounts.columns; i++) {
                insertTableColumn__EXPERIMENTAL(shouldInsertAfter);
            }
            onClose();
        });
    };

    const deleteTableRowAtSelection = () => {
        editor.update(() => {
            deleteTableRow__EXPERIMENTAL();
            onClose();
        });
    };

    const deleteTableAtSelection = () => {
        editor.update(() => {
            const tableNode = getTableNodeFromLexicalNodeOrThrow(tableCellNode);
            tableNode.remove();

            clearTableSelection();
            onClose();
        });
    };

    const deleteTableColumnAtSelection = () => {
        editor.update(() => {
            deleteTableColumn__EXPERIMENTAL();
            onClose();
        });
    };

    const toggleTableRowIsHeader = () => {
        editor.update(() => {
            const tableNode = getTableNodeFromLexicalNodeOrThrow(tableCellNode);

            const tableRowIndex =
                getTableRowIndexFromTableCellNode(tableCellNode);

            const tableRows = tableNode.getChildren();

            if (tableRowIndex >= tableRows.length || tableRowIndex < 0) {
                throw new Error(
                    "Expected table cell to be inside of table row.",
                );
            }

            const tableRow = tableRows[tableRowIndex];

            if (!isTableRowNode(tableRow)) {
                throw new Error("Expected table row");
            }

            tableRow.getChildren().forEach((tableCell) => {
                if (!isTableCellNode(tableCell)) {
                    throw new Error("Expected table cell");
                }

                tableCell.toggleHeaderStyle(TableCellHeaderStates.ROW);
            });

            clearTableSelection();
            onClose();
        });
    };

    const toggleTableColumnIsHeader = () => {
        editor.update(() => {
            const tableNode = getTableNodeFromLexicalNodeOrThrow(tableCellNode);

            const tableColumnIndex =
                getTableColumnIndexFromTableCellNode(tableCellNode);

            const tableRows = tableNode.getChildren<TableRowNode>();
            const maxRowsLength = Math.max(
                ...tableRows.map((row) => row.getChildren().length),
            );

            if (tableColumnIndex >= maxRowsLength || tableColumnIndex < 0) {
                throw new Error(
                    "Expected table cell to be inside of table row.",
                );
            }

            for (let r = 0; r < tableRows.length; r++) {
                const tableRow = tableRows[r];

                if (!isTableRowNode(tableRow)) {
                    throw new Error("Expected table row");
                }

                const tableCells = tableRow.getChildren();
                if (tableColumnIndex >= tableCells.length) {
                    continue;
                }

                const tableCell = tableCells[tableColumnIndex];

                if (!isTableCellNode(tableCell)) {
                    throw new Error("Expected table cell");
                }

                tableCell.toggleHeaderStyle(TableCellHeaderStates.COLUMN);
            }
            clearTableSelection();
            onClose();
        });
    };

    const handleCellBackgroundColor = (value: string) => {
        editor.update(() => {
            const selection = getSelection();
            if (isRangeSelection(selection) || isTableSelection(selection)) {
                const [cell] = getNodeTriplet(selection.anchor);
                if (isTableCellNode(cell)) {
                    cell.setBackgroundColor(value);
                }

                if (isTableSelection(selection)) {
                    const nodes = selection.getNodes();

                    for (let i = 0; i < nodes.length; i++) {
                        const node = nodes[i];
                        if (isTableCellNode(node)) {
                            node.setBackgroundColor(value);
                        }
                    }
                }
            }
        });
    };

    const isRowHeader = $derived(
        (tableCellNode.__headerState & TableCellHeaderStates.ROW) ===
            TableCellHeaderStates.ROW,
    );
    const isColumnHeader = $derived(
        (tableCellNode.__headerState & TableCellHeaderStates.COLUMN) ===
            TableCellHeaderStates.COLUMN,
    );
</script>

<Portal>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
        bind:this={dropDownRef}
        onclick={(e) => e.stopPropagation()}
        class="fixed z-[9999] min-w-[190px] rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#292c3c] shadow-xl py-1.5 opacity-0"
        style="left: -10000px; top: -10000px;"
    >
        {#if cellMerge}
            {#if canMergeCells}
                <button
                    type="button"
                    onclick={() => mergeTableCellsAtSelection()}
                    data-test-id="table-merge-cells"
                    class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] hover:bg-brand-sand-100 dark:hover:bg-[#303446] transition-colors"
                >
                    <Icon
                        icon="mdi:table-merge-cells"
                        width="14"
                        class="shrink-0 text-brand-charcoal-400 dark:text-[#8087a2]"
                    />
                    Merge cells
                </button>
            {:else if canUnmergeCell}
                <button
                    type="button"
                    onclick={() => unmergeTableCellsAtSelection()}
                    data-test-id="table-unmerge-cells"
                    class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] hover:bg-brand-sand-100 dark:hover:bg-[#303446] transition-colors"
                >
                    <Icon
                        icon="mdi:table-split-cell"
                        width="14"
                        class="shrink-0 text-brand-charcoal-400 dark:text-[#8087a2]"
                    />
                    Unmerge cells
                </button>
            {/if}
        {/if}

        <button
            type="button"
            onclick={() => colorPicker.open(handleCellBackgroundColor)}
            data-test-id="table-background-color"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] hover:bg-brand-sand-100 dark:hover:bg-[#303446] transition-colors"
        >
            <Icon
                icon="fluent:paint-bucket-16-filled"
                width="14"
                class="shrink-0 text-brand-charcoal-400 dark:text-[#8087a2]"
            />
            Cell background color
        </button>

        <div class="my-1 mx-2 h-px bg-brand-sand-200 dark:bg-[#414559]"></div>

        <button
            type="button"
            onclick={() => insertTableRowAtSelection(false)}
            data-test-id="table-insert-row-above"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] hover:bg-brand-sand-100 dark:hover:bg-[#303446] transition-colors"
        >
            <Icon
                icon="tabler:row-insert-top"
                width="14"
                class="shrink-0 text-brand-charcoal-400 dark:text-[#8087a2]"
            />
            Insert {selectionCounts.rows === 1
                ? "row"
                : `${selectionCounts.rows} rows`} above
        </button>
        <button
            type="button"
            onclick={() => insertTableRowAtSelection(true)}
            data-test-id="table-insert-row-below"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] hover:bg-brand-sand-100 dark:hover:bg-[#303446] transition-colors"
        >
            <Icon
                icon="tabler:row-insert-bottom"
                width="14"
                class="shrink-0 text-brand-charcoal-400 dark:text-[#8087a2]"
            />
            Insert {selectionCounts.rows === 1
                ? "row"
                : `${selectionCounts.rows} rows`} below
        </button>

        <div class="my-1 mx-2 h-px bg-brand-sand-200 dark:bg-[#414559]"></div>

        <button
            type="button"
            onclick={() => insertTableColumnAtSelection(false)}
            data-test-id="table-insert-column-before"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] hover:bg-brand-sand-100 dark:hover:bg-[#303446] transition-colors"
        >
            <Icon
                icon="tabler:column-insert-left"
                width="14"
                class="shrink-0 text-brand-charcoal-400 dark:text-[#8087a2]"
            />
            Insert {selectionCounts.columns === 1
                ? "column"
                : `${selectionCounts.columns} columns`} left
        </button>
        <button
            type="button"
            onclick={() => insertTableColumnAtSelection(true)}
            data-test-id="table-insert-column-after"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] hover:bg-brand-sand-100 dark:hover:bg-[#303446] transition-colors"
        >
            <Icon
                icon="tabler:column-insert-right"
                width="14"
                class="shrink-0 text-brand-charcoal-400 dark:text-[#8087a2]"
            />
            Insert {selectionCounts.columns === 1
                ? "column"
                : `${selectionCounts.columns} columns`} right
        </button>

        <div class="my-1 mx-2 h-px bg-brand-sand-200 dark:bg-[#414559]"></div>

        <button
            type="button"
            onclick={() => deleteTableColumnAtSelection()}
            data-test-id="table-delete-columns"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-amber-500 dark:text-amber-400 hover:bg-brand-sand-100 dark:hover:bg-[#303446] transition-colors"
        >
            <Icon icon="tabler:column-remove" width="14" class="shrink-0" />
            Delete column
        </button>
        <button
            type="button"
            onclick={() => deleteTableRowAtSelection()}
            data-test-id="table-delete-rows"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-amber-500 dark:text-amber-400 hover:bg-brand-sand-100 dark:hover:bg-[#303446] transition-colors"
        >
            <Icon icon="tabler:row-remove" width="14" class="shrink-0" />
            Delete row
        </button>
        <button
            type="button"
            onclick={() => deleteTableAtSelection()}
            data-test-id="table-delete"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-amber-500 dark:text-amber-400 hover:bg-brand-sand-100 dark:hover:bg-[#303446] transition-colors"
        >
            <Icon icon="tabler:trash" width="14" class="shrink-0" />
            Delete table
        </button>

        <div class="my-1 mx-2 h-px bg-brand-sand-200 dark:bg-[#414559]"></div>

        <button
            type="button"
            onclick={() => toggleTableRowIsHeader()}
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] hover:bg-brand-sand-100 dark:hover:bg-[#303446] transition-colors"
        >
            <Icon
                icon="tabler:layout-rows"
                width="14"
                class="shrink-0 text-brand-charcoal-400 dark:text-[#8087a2]"
            />
            {isRowHeader ? "Remove" : "Add"} row header
        </button>
        <button
            type="button"
            onclick={() => toggleTableColumnIsHeader()}
            data-test-id="table-column-header"
            class="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-brand-charcoal-900 dark:text-[#c6d0f5] hover:bg-brand-sand-100 dark:hover:bg-[#303446] transition-colors"
        >
            <Icon
                icon="tabler:layout-columns"
                width="14"
                class="shrink-0 text-brand-charcoal-400 dark:text-[#8087a2]"
            />
            {isColumnHeader ? "Remove" : "Add"} column header
        </button>
    </div>
</Portal>

<ColorPickerDialog
    title="Cell background color"
    color={$backgroundColor}
    bind:this={colorPicker}
/>
