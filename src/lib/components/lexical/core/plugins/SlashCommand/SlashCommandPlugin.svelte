<script lang="ts">
    import { onMount } from "svelte";
    import { fly } from "svelte/transition";
    import Icon from "@iconify/svelte";
    // Registers the Julia slash-command icon offline (no Iconify API call).
    import "$lib/icons/julia-cell-icons";
    // Same for the Lean entry's icon.
    import "$lib/icons/lean-cell-icons";
    import { icons } from "$lib/data/toolbar/toolbar.js";
    import { getEditor } from "$lexical/core/composerContext.js";
    import {
        $getSelection as getSelection,
        $isRangeSelection as isRangeSelection,
        $isTextNode as isTextNode,
        $getNodeByKey as getNodeByKey,
        $createParagraphNode as createParagraphNode,
        $createTextNode as createTextNode,
        $isParagraphNode as isParagraphNode,
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
    import { $createCodeNode as createCodeNode } from "../CodeHighlighter/CodeNode.js";
    import {
        $setBlocksType as setBlocksType,
        $patchStyleText as patchStyleText,
    } from "@lexical/selection";
    import {
        $createQuoteNode as createQuoteNode,
        $createHeadingNode as createHeadingNode,
        type HeadingTagType,
    } from "@lexical/rich-text";
    import { INSERT_CHECK_LIST_COMMAND } from "@lexical/list";
    import { t } from "$lib/i18n";
    import { invoke } from "@tauri-apps/api/core";
    import type { SurahMorphology } from "$lib/types/morphology";
    import {
        parseQuranSlashQuery,
        QURAN_SLASH_REGEX,
        QURAN_SLASH_COMPLETE_REGEX,
        parseQuranTranslationSlashQuery,
        QURAN_TRANSLATION_SLASH_REGEX,
        QURAN_TRANSLATION_SLASH_COMPLETE_REGEX,
    } from "$lib/utils/quranSlashParser";
    import { get } from "svelte/store";
    import {
        activeTranslatorId,
        availableTranslators,
        type AyahTranslation,
    } from "$lib/stores/translation.store";
    import {
        $createQuranBlockNode as createQuranBlockNode,
        type QuranVerse,
    } from "../Quran/QuranBlockNode";
    import { INSERT_JULIA_CELL_COMMAND } from "../JuliaCell/JuliaCellPlugin.svelte";
    import { INSERT_LEAN_CELL_COMMAND } from "../LeanCell/LeanCellPlugin.svelte";
    import { OPEN_CITE_MENU_COMMAND } from "../Cite/CiteMenuPlugin.svelte";

    const editor = getEditor();

    interface SlashCommand {
        id: string;
        label: string;
        description: string;
        icon: string;
        // When set, selecting the command inserts this raw text in place of the
        // slash query (used by the /s-* Arabic phrase shortcuts).
        insertText?: string;
    }

    // Commonly used Arabic / Islamic phrases. These are language-agnostic (the
    // inserted text is always Arabic regardless of UI locale), so they are kept
    // as a plain list with transliteration labels rather than i18n keys.
    const SHORTCUT_ICON = "material-symbols:mosque-outline";
    const ARABIC_SHORTCUTS: SlashCommand[] = [
        {
            id: "s-saw",
            label: "Ṣallā Allāhu ʿalayhi wa sallam",
            description: "صلى الله عليه وسلم",
            icon: SHORTCUT_ICON,
            insertText: "صلى الله عليه وسلم",
        },
        {
            id: "s-rd",
            label: "Raḍiya Allāhu ʿanhu (r.a.)",
            description: "رضي الله عنه",
            icon: SHORTCUT_ICON,
            insertText: "رضي الله عنه",
        },
        {
            id: "s-rha",
            label: "Raḍiya Allāhu ʿanhā",
            description: "رضي الله عنها",
            icon: SHORTCUT_ICON,
            insertText: "رضي الله عنها",
        },
        {
            id: "s-rhm",
            label: "Raḍiya Allāhu ʿanhum",
            description: "رضي الله عنهم",
            icon: SHORTCUT_ICON,
            insertText: "رضي الله عنهم",
        },
        {
            id: "s-as",
            label: "ʿAlayhi as-salām",
            description: "عليه السلام",
            icon: SHORTCUT_ICON,
            insertText: "عليه السلام",
        },
        {
            id: "s-aha",
            label: "ʿAlayhā as-salām",
            description: "عليها السلام",
            icon: SHORTCUT_ICON,
            insertText: "عليها السلام",
        },
        {
            id: "s-god",
            label: "Allāh",
            description: "الله",
            icon: SHORTCUT_ICON,
            insertText: "الله",
        },
        {
            id: "s-swt",
            label: "Subḥānahu wa taʿālā",
            description: "سبحانه وتعالى",
            icon: SHORTCUT_ICON,
            insertText: "سبحانه وتعالى",
        },
        {
            id: "s-azza",
            label: "ʿAzza wa jall",
            description: "عز وجل",
            icon: SHORTCUT_ICON,
            insertText: "عز وجل",
        },
        {
            id: "s-jj",
            label: "Jalla jalāluhu",
            description: "جل جلاله",
            icon: SHORTCUT_ICON,
            insertText: "جل جلاله",
        },
        {
            id: "s-rh",
            label: "Raḥimahu Allāh",
            description: "رحمه الله",
            icon: SHORTCUT_ICON,
            insertText: "رحمه الله",
        },
        {
            id: "s-bmh",
            label: "Bismillāh ar-Raḥmān ar-Raḥīm",
            description: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
            icon: SHORTCUT_ICON,
            insertText: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
        },
        {
            id: "s-isa",
            label: "In shāʾ Allāh",
            description: "إن شاء الله",
            icon: SHORTCUT_ICON,
            insertText: "إن شاء الله",
        },
        {
            id: "s-msa",
            label: "Mā shāʾ Allāh",
            description: "ما شاء الله",
            icon: SHORTCUT_ICON,
            insertText: "ما شاء الله",
        },
        {
            id: "s-alh",
            label: "Al-ḥamdu lillāh",
            description: "الحمد لله",
            icon: SHORTCUT_ICON,
            insertText: "الحمد لله",
        },
        {
            id: "s-sub",
            label: "Subḥān Allāh",
            description: "سبحان الله",
            icon: SHORTCUT_ICON,
            insertText: "سبحان الله",
        },
        {
            id: "s-akb",
            label: "Allāhu akbar",
            description: "الله أكبر",
            icon: SHORTCUT_ICON,
            insertText: "الله أكبر",
        },
        {
            id: "s-tah",
            label: "Lā ilāha illā Allāh",
            description: "لا إله إلا الله",
            icon: SHORTCUT_ICON,
            insertText: "لا إله إلا الله",
        },
        {
            id: "s-jzk",
            label: "Jazāka Allāhu khayran",
            description: "جزاك الله خيرا",
            icon: SHORTCUT_ICON,
            insertText: "جزاك الله خيرا",
        },
        {
            id: "s-bfk",
            label: "Bārak Allāhu fīk",
            description: "بارك الله فيك",
            icon: SHORTCUT_ICON,
            insertText: "بارك الله فيك",
        },
        {
            id: "s-stg",
            label: "Astaghfiru Allāh",
            description: "أستغفر الله",
            icon: SHORTCUT_ICON,
            insertText: "أستغفر الله",
        },
        {
            id: "s-slm",
            label: "As-salāmu ʿalaykum wa raḥmatullāhi wa barakātuh",
            description: "السلام عليكم ورحمة الله وبركاته",
            icon: SHORTCUT_ICON,
            insertText: "السلام عليكم ورحمة الله وبركاته",
        },
        {
            id: "s-inna",
            label: "Innā lillāhi wa innā ilayhi rājiʿūn",
            description: "إنا لله وإنا إليه راجعون",
            icon: SHORTCUT_ICON,
            insertText: "إنا لله وإنا إليه راجعون",
        },
        {
            id: "s-hsb",
            label: "Ḥasbunā Allāhu wa niʿma al-wakīl",
            description: "حسبنا الله ونعم الوكيل",
            icon: SHORTCUT_ICON,
            insertText: "حسبنا الله ونعم الوكيل",
        },
        // Compressed single-glyph Unicode ligatures (Arabic Presentation
        // Forms-A) for the most common honorifics — e.g. /sc-saw inserts ﷺ.
        {
            id: "sc-saw",
            label: "ﷺ — Ṣallā Allāhu ʿalayhi wa sallam (ligature)",
            description: "ﷺ",
            icon: SHORTCUT_ICON,
            insertText: "ﷺ",
        },
        {
            id: "sc-jj",
            label: "ﷻ — Jalla jalāluhu (ligature)",
            description: "ﷻ",
            icon: SHORTCUT_ICON,
            insertText: "ﷻ",
        },
        {
            id: "sc-bmh",
            label: "﷽ — Bismillāh ar-Raḥmān ar-Raḥīm (ligature)",
            description: "﷽",
            icon: SHORTCUT_ICON,
            insertText: "﷽",
        },
        {
            id: "sc-god",
            label: "ﷲ — Allāh (ligature)",
            description: "ﷲ",
            icon: SHORTCUT_ICON,
            insertText: "ﷲ",
        },
    ];

    const COMMANDS: SlashCommand[] = $derived([
        {
            id: "h1",
            label: $t("slash.h1_label"),
            description: $t("slash.h1_desc"),
            icon: icons["heading"],
        },
        {
            id: "h2",
            label: $t("slash.h2_label"),
            description: $t("slash.h2_desc"),
            icon: icons["heading"],
        },
        {
            id: "h3",
            label: $t("slash.h3_label"),
            description: $t("slash.h3_desc"),
            icon: icons["heading"],
        },
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
            id: "code",
            label: $t("slash.code_label"),
            description: $t("slash.code_desc"),
            icon: icons["code"],
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
        {
            id: "quran",
            label: $t("slash.quran_label"),
            description: $t("slash.quran_desc"),
            icon: "solar:book-bold-duotone",
        },
        {
            id: "quran-translation",
            label: $t("slash.quran_translation_label"),
            description: $t("slash.quran_translation_desc"),
            icon: "material-symbols:translate",
        },
        {
            id: "julia",
            label: $t("slash.julia_label"),
            description: $t("slash.julia_desc"),
            icon: "devicon-plain:julia",
        },
        {
            id: "lean",
            label: $t("slash.lean_label"),
            description: $t("slash.lean_desc"),
            icon: "solar:verified-check-bold-duotone",
        },
        {
            id: "cite",
            label: $t("slash.cite_label"),
            description: $t("slash.cite_desc"),
            icon: "solar:bookmark-square-bold-duotone",
        },
        ...ARABIC_SHORTCUTS,
    ]);

    let isOpen = $state(false);
    let query = $state("");
    let selectedIndex = $state(0);
    let menuRect = $state<DOMRect | null>(null);
    let menuEl = $state<HTMLElement | null>(null);

    // Keep the keyboard-selected option visible when the list is long enough to
    // scroll (e.g. the /s-* shortcut list).
    $effect(() => {
        void selectedIndex;
        if (!isOpen || !menuEl) return;
        const selectedEl = menuEl.querySelector<HTMLElement>(
            '[aria-selected="true"]',
        );
        selectedEl?.scrollIntoView({ block: "nearest" });
    });

    // Captured each time the menu (re)opens
    let anchorNodeKey = "";
    let slashOffset = 0;

    let filteredCommands = $derived(
        COMMANDS.filter((cmd) => {
            // Keep the Arabic /s-* shortcuts out of the bare "/" menu; they only
            // surface once the user starts typing (e.g. "/s").
            if (!query) return !cmd.insertText;
            if (cmd.id === "table") return /^table(-\d+(-\d+)?)?$/.test(query);
            if (cmd.id === "quran") return QURAN_SLASH_REGEX.test(query);
            if (cmd.id === "quran-translation")
                return QURAN_TRANSLATION_SLASH_REGEX.test(query);
            return cmd.id.startsWith(query);
        }),
    );

    function closeMenu() {
        isOpen = false;
        selectedIndex = 0;
    }

    async function insertQuranBlock(
        capturedKey: string,
        capturedOffset: number,
        capturedQuery: string,
    ) {
        if (!QURAN_SLASH_COMPLETE_REGEX.test(capturedQuery)) return;
        const parsed = parseQuranSlashQuery(capturedQuery);
        if (!parsed.ok) return;

        const surahCache = new Map<number, SurahMorphology>();
        const uniqueSurahs = [...new Set(parsed.pairs.map((p) => p.surah))];
        try {
            await Promise.all(
                uniqueSurahs.map(async (s) => {
                    const morph = await invoke<SurahMorphology>(
                        "get_surah_morphology",
                        { surahNumber: s },
                    );
                    surahCache.set(s, morph);
                }),
            );
        } catch (e) {
            console.error("[quran-slash] failed to fetch surah morphology", e);
            return;
        }

        const verses: QuranVerse[] = [];
        for (const { surah, ayah } of parsed.pairs) {
            const morph = surahCache.get(surah);
            if (!morph) continue;
            const ayahMorph = morph.ayahs.find((a) => a.ayah === ayah);
            if (!ayahMorph) continue;
            const arabic = ayahMorph.words
                .map((w) => w.combined_arabic)
                .join(" ");
            verses.push({ surah, ayah, arabic });
        }
        if (verses.length === 0) return;

        editor.update(() => {
            const textNode = getNodeByKey(capturedKey);
            if (!isTextNode(textNode)) return;
            const sel = textNode.select(
                capturedOffset,
                capturedOffset + 1 + capturedQuery.length,
            );
            sel.insertText("");

            const freshSel = getSelection();
            if (!isRangeSelection(freshSel)) return;

            const blockNode = createQuranBlockNode(verses);
            freshSel.insertNodes([blockNode]);
            if (blockNode.getPreviousSibling() === null) {
                blockNode.insertBefore(createParagraphNode());
            }
            if (blockNode.getNextSibling() === null) {
                const para = createParagraphNode();
                blockNode.insertAfter(para);
                para.select();
            }
        });
    }

    // English Abdel Haleem — the default translation used when the user hasn't
    // selected one in the Surah widget. Static, bundled translator id.
    const ABDEL_HALEEM_TRANSLATOR_ID = 2;

    function resolveTranslatorId(): number {
        const active = get(activeTranslatorId);
        if (active != null) return active;
        // No translation selected → fall back to Abdel Haleem. Prefer resolving
        // its id from the loaded translator list in case it ever differs.
        const haleem = get(availableTranslators).find(
            (t) =>
                t.name === "Abdel Haleem" ||
                (t.lang?.toUpperCase() === "EN" && /haleem/i.test(t.name)),
        );
        return haleem?.id ?? ABDEL_HALEEM_TRANSLATOR_ID;
    }

    async function insertQuranTranslation(
        capturedKey: string,
        capturedOffset: number,
        capturedQuery: string,
    ) {
        if (!QURAN_TRANSLATION_SLASH_COMPLETE_REGEX.test(capturedQuery)) return;
        const parsed = parseQuranTranslationSlashQuery(capturedQuery);
        if (!parsed.ok) return;

        const translatorId = resolveTranslatorId();

        // Fetch each referenced surah's translations once, keyed by ayah.
        const bySurah = new Map<number, Map<number, string>>();
        const uniqueSurahs = [...new Set(parsed.pairs.map((p) => p.surah))];
        try {
            await Promise.all(
                uniqueSurahs.map(async (s) => {
                    const rows = await invoke<AyahTranslation[]>(
                        "get_surah_translation",
                        { surah: s, translatorId },
                    );
                    const m = new Map<number, string>();
                    for (const r of rows) m.set(r.ayah, r.text);
                    bySurah.set(s, m);
                }),
            );
        } catch (e) {
            console.error("[qt-slash] failed to fetch translation", e);
            return;
        }

        const verses: { surah: number; ayah: number; text: string }[] = [];
        for (const { surah, ayah } of parsed.pairs) {
            const text = bySurah.get(surah)?.get(ayah);
            if (text) verses.push({ surah, ayah, text });
        }
        if (verses.length === 0) return;

        // When the selection spans more than one surah, the per-verse marker
        // needs the surah too (e.g. "2:255"); within a single surah the ayah
        // number alone is enough.
        const crossSurah = new Set(verses.map((v) => v.surah)).size > 1;

        editor.update(() => {
            const textNode = getNodeByKey(capturedKey);
            if (!isTextNode(textNode)) return;
            // Replace the "/qt-…" token with the translation.
            const sel = textNode.select(
                capturedOffset,
                capturedOffset + 1 + capturedQuery.length,
            );
            sel.insertText("");

            const freshSel = getSelection();
            if (!isRangeSelection(freshSel)) return;

            if (verses.length === 1) {
                // Single ayah → flow inline at the cursor, no marker needed.
                freshSel.insertText(verses[0].text);
            } else {
                // Multiple ayahs → one paragraph each, prefixed with a bold
                // verse marker so readers can tell the verses apart.
                const paragraphs = verses.map(({ surah, ayah, text }) => {
                    const label = crossSurah ? `${surah}:${ayah}` : `${ayah}`;
                    const marker = createTextNode(`(${label}) `);
                    marker.toggleFormat("bold");
                    const para = createParagraphNode();
                    para.append(marker, createTextNode(text));
                    return para;
                });
                freshSel.insertNodes(paragraphs);
            }
        });
    }

    function selectCommand(cmdId: string) {
        const capturedKey = anchorNodeKey;
        const capturedOffset = slashOffset;
        const capturedQuery = query;
        closeMenu();

        if (cmdId === "quran") {
            void insertQuranBlock(capturedKey, capturedOffset, capturedQuery);
            return;
        }

        if (cmdId === "quran-translation") {
            void insertQuranTranslation(
                capturedKey,
                capturedOffset,
                capturedQuery,
            );
            return;
        }

        if (cmdId === "cite") {
            // Hand off to the Cite plugin, which shows the reference/style
            // picker and replaces the "/cite" token with the chosen citation.
            editor.dispatchCommand(OPEN_CITE_MENU_COMMAND, {
                key: capturedKey,
                offset: capturedOffset,
                tokenLen: 1 + capturedQuery.length,
                rect: menuRect,
            });
            return;
        }

        const command = COMMANDS.find((c) => c.id === cmdId);
        if (command?.insertText) {
            const phrase = command.insertText;
            editor.update(() => {
                const textNode = getNodeByKey(capturedKey);
                if (!isTextNode(textNode)) return;
                // Replace the slash + query with the phrase.
                const sel = textNode.select(
                    capturedOffset,
                    capturedOffset + 1 + capturedQuery.length,
                );
                sel.insertText(phrase);

                // Render Arabic phrases in Scheherazade New by default.
                const insertedNode = getNodeByKey(capturedKey);
                if (!isTextNode(insertedNode)) return;
                const phraseSel = insertedNode.select(
                    capturedOffset,
                    capturedOffset + phrase.length,
                );
                patchStyleText(phraseSel, {
                    "font-family": "Scheherazade New",
                });

                // Collapse the cursor to the end of the phrase so typing can
                // continue right after it.
                const finalSel = getSelection();
                if (isRangeSelection(finalSel)) {
                    finalSel.anchor.set(
                        finalSel.focus.key,
                        finalSel.focus.offset,
                        finalSel.focus.type,
                    );
                }
            });
            return;
        }

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
            } else if (cmdId === "code") {
                // Same shape as the ``` markdown shortcut: an empty block that
                // opens straight into its editor, defaulting to JavaScript
                // (the language is switched from the block's own dropdown).
                const codeNode = createCodeNode("", "javascript", true);
                const block = freshSel.anchor.getNode().getTopLevelElement();
                // Typed on a line of its own, the code block takes that line's
                // place; typed after other text it lands below the paragraph.
                // Only paragraphs are replaced — a list item's top-level node
                // is the whole list, which must not be swapped out.
                if (
                    block &&
                    isParagraphNode(block) &&
                    block.getTextContent() === ""
                ) {
                    block.replace(codeNode);
                } else {
                    insertNodeToNearestRoot(codeNode);
                }
                // Block decorators don't get a trailing paragraph of their own,
                // so the cursor would have nowhere to go after the block.
                if (codeNode.getNextSibling() === null) {
                    const para = createParagraphNode();
                    codeNode.insertAfter(para);
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
            } else if (
                cmdId === "h1" ||
                cmdId === "h2" ||
                cmdId === "h3"
            ) {
                const sel = getSelection();
                setBlocksType(sel, () =>
                    createHeadingNode(cmdId as HeadingTagType),
                );
            }
        });

        if (cmdId === "checklist") {
            editor.dispatchCommand(INSERT_CHECK_LIST_COMMAND, undefined);
        } else if (cmdId === "julia") {
            editor.dispatchCommand(INSERT_JULIA_CELL_COMMAND, undefined);
        } else if (cmdId === "lean") {
            editor.dispatchCommand(INSERT_LEAN_CELL_COMMAND, undefined);
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
                        if (!q) return !cmd.insertText;
                        if (cmd.id === "table")
                            return /^table(-\d+(-\d+)?)?$/.test(q);
                        if (cmd.id === "quran") return QURAN_SLASH_REGEX.test(q);
                        if (cmd.id === "quran-translation")
                            return QURAN_TRANSLATION_SLASH_REGEX.test(q);
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
        bind:this={menuEl}
        transition:fly={{ y: 4, duration: 120, opacity: 0 }}
        role="listbox"
        class="fixed z-50 w-64 max-h-72 overflow-y-auto rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40"
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
