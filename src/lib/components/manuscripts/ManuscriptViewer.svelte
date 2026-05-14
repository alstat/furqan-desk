<script lang="ts">
    import { onDestroy } from "svelte";
    import { get } from "svelte/store";
    import { fly } from "svelte/transition";
    import Icon from "@iconify/svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { message } from "@tauri-apps/plugin-dialog";
    import { manuscriptAyah } from "$lib/stores/manuscripts.store";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import { lexicalEditorInstance } from "$lib/stores/editor.store";
    import { INSERT_IMAGE_COMMAND } from "$lib/components/lexical/core/plugins/Image/ImagePlugin.svelte";
    import { isPro } from "$lib/stores/auth.store";
    import { askAiAboutSelection } from "$lib/stores/ai-chat.store";
    import { t } from "$lib/i18n";

    interface Props {
        open: boolean;
        onClose: () => void;
        demoMode?: boolean;
    }

    let { open, onClose, demoMode = false }: Props = $props();

    // ── Bundled demo data for tour (Surah 112:2 Al-Ikhlas, offline) ───────────
    const DEMO_ENTRIES: ManuscriptEntry[] = [
        {
            manuscript_id: 53,
            title: "Istanbul: Topkapı Sarayı, 50385",
            archive: {
                id: 7,
                name: "Topkapı Palace Museum (Topkapı Sarayı Müzesi)",
                city: "Istanbul",
                country_code: "TR",
                link: "",
            },
            pages: [
                {
                    id: 44038,
                    folio: 350,
                    side: "v",
                    images: [
                        {
                            id: 29762,
                            image_url: "",
                            image_source: "© Corpus Coranicum (BBAW)",
                            external_url: "",
                        },
                    ],
                },
            ],
        },
        {
            manuscript_id: 54,
            title: "Istanbul: Topkapı Sarayı, 50386",
            archive: {
                id: 7,
                name: "Topkapı Palace Museum (Topkapı Sarayı Müzesi)",
                city: "Istanbul",
                country_code: "TR",
                link: "",
            },
            pages: [
                {
                    id: 45061,
                    folio: 604,
                    side: "r",
                    images: [
                        {
                            id: 30789,
                            image_url: "",
                            image_source: "© Corpus Coranicum (BBAW)",
                            external_url: "",
                        },
                    ],
                },
            ],
        },
        {
            manuscript_id: 56,
            title: 'Topkapı Sarayı: "Saray Medina 1a"',
            archive: {
                id: 7,
                name: "Topkapı Palace Museum (Topkapı Sarayı Müzesi)",
                city: "Istanbul",
                country_code: "TR",
                link: "",
            },
            pages: [
                {
                    id: 17298,
                    folio: 391,
                    side: "r",
                    images: [
                        {
                            id: 7206,
                            image_url: "",
                            image_source:
                                "Gotthelf-Bergsträßer-Filmarchiv, Bayerische Akademie der Wissenschaften",
                            external_url: "",
                        },
                    ],
                },
            ],
        },
    ];
    const DEMO_DETAILS = new Map<number, ManuscriptDetail>([
        [
            53,
            {
                id: 53,
                call_number: '"Saray 50385" (Gotthelf Bergsträßer archives)',
                dimensions: "290 × 360",
                date: "700 - 800",
                carbon_dating: "",
                writing_surface: "Parchment",
                line_min: "15",
                line_max: "19",
                number_of_folios: 353,
                script_styles: ["ḥiǧāzī IV"],
                codicology: null,
                paleography: null,
                catalogue_entry: null,
                bibliography: [],
            },
        ],
        [
            54,
            {
                id: 54,
                call_number: '"Saray 50386" (Gotthelf Bergsträßer archives)',
                dimensions: "400 × 300",
                date: "750 - 900",
                carbon_dating: "",
                writing_surface: "Parchment",
                line_min: "14",
                line_max: "14",
                number_of_folios: 605,
                script_styles: ["kūfī F.I"],
                codicology: null,
                paleography: null,
                catalogue_entry: null,
                bibliography: [],
            },
        ],
        [
            56,
            {
                id: 56,
                call_number:
                    '"Saray Medina 1a" (Gotthelf Bergsträßer archives)',
                dimensions: "240 × 320",
                date: "700 - 800",
                carbon_dating: "",
                writing_surface: "Parchment",
                line_min: "15",
                line_max: "22",
                number_of_folios: 391,
                script_styles: ["ḥiǧāzī", "kūfī"],
                codicology: null,
                paleography: null,
                catalogue_entry: null,
                bibliography: [],
            },
        ],
    ]);

    let panelW = $state(660);
    let panelH = $state(560);
    const MIN_W = 380;
    const MIN_H = 300;

    // ── Drag ─────────────────────────────────────────────────────────────────
    let x = $state(0);
    let y = $state(0);
    let zIndex = $state(500);
    let isDragging = $state(false);
    let dragStartX = 0,
        dragStartY = 0,
        startX = 0,
        startY = 0;
    let initialized = false;

    // ── Resize ────────────────────────────────────────────────────────────────
    type ResizeDir = { e: boolean; w: boolean; n: boolean; s: boolean };
    let isResizing = $state(false);
    let resizeDir: ResizeDir = { e: false, w: false, n: false, s: false };
    let resizeStartX = 0,
        resizeStartY = 0;
    let resizeStartW = 0,
        resizeStartH = 0;
    let resizeStartPanelX = 0,
        resizeStartPanelY = 0;

    function startResize(e: PointerEvent, dir: ResizeDir) {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        resizeDir = dir;
        resizeStartX = e.clientX;
        resizeStartY = e.clientY;
        resizeStartW = panelW;
        resizeStartH = panelH;
        resizeStartPanelX = x;
        resizeStartPanelY = y;
        document.body.style.userSelect = "none";
        window.addEventListener("pointermove", onResize);
        window.addEventListener("pointerup", stopResize, { once: true });
    }
    function onResize(e: PointerEvent) {
        const dx = e.clientX - resizeStartX;
        const dy = e.clientY - resizeStartY;
        let newW = resizeStartW,
            newH = resizeStartH;
        let newX = resizeStartPanelX,
            newY = resizeStartPanelY;
        if (resizeDir.e) newW = Math.max(MIN_W, resizeStartW + dx);
        if (resizeDir.s) newH = Math.max(MIN_H, resizeStartH + dy);
        if (resizeDir.w) {
            newW = Math.max(MIN_W, resizeStartW - dx);
            newX = resizeStartPanelX + (resizeStartW - newW);
        }
        if (resizeDir.n) {
            newH = Math.max(MIN_H, resizeStartH - dy);
            newY = resizeStartPanelY + (resizeStartH - newH);
        }
        panelW = newW;
        panelH = newH;
        x = Math.max(0, Math.min(window.innerWidth - MIN_W, newX));
        y = Math.max(0, Math.min(window.innerHeight - 60, newY));
    }
    function stopResize() {
        isResizing = false;
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onResize);
    }

    // ── API types ─────────────────────────────────────────────────────────────
    interface ManuscriptImage {
        id: number;
        image_url: string;
        image_source: string;
        external_url: string;
    }
    interface ManuscriptPage {
        id: number;
        folio: number | string;
        side: string;
        images: ManuscriptImage[];
    }
    interface ManuscriptArchive {
        id: number;
        name: string;
        city: string;
        country_code: string;
        link: string;
    }
    interface ManuscriptEntry {
        manuscript_id: number;
        title: string;
        archive: ManuscriptArchive;
        pages: ManuscriptPage[];
    }
    interface ManuscriptDetail {
        id: number;
        call_number: string;
        dimensions: string | null;
        date: string;
        carbon_dating: string;
        writing_surface: string | null;
        line_min: string | null;
        line_max: string | null;
        number_of_folios: number | null;
        script_styles: string[];
        codicology: string | null;
        paleography: string | null;
        catalogue_entry: string | null;
        bibliography: Array<{ citation: string; zotero_key: string }>;
    }

    // ── Data state ────────────────────────────────────────────────────────────
    let results = $state<ManuscriptEntry[]>([]);
    let loading = $state(false);
    let error = $state(false);
    let selectedId = $state<number | null>(null); // track by ID to survive re-sort
    let folioIdx = $state(0);
    let imageSrc = $state<string | null>(null);
    let thumbnailBytes = $state<number[] | null>(null);
    let loadedIds = $state(new Set<number>());
    let imageLoading = $state(false);
    let imageError = $state(false);
    let imageSource = $state("");
    let loadedRefKey: string | null = null;

    // details fetched in background per manuscript
    let detailMap = $state(new Map<number, ManuscriptDetail>());

    // Sort helper: parse "700 - 900" → 700, "1000" → 1000, empty → Infinity
    function parseEarliestYear(detail: ManuscriptDetail | undefined): number {
        const raw = detail?.carbon_dating?.trim() || detail?.date?.trim() || "";
        if (!raw) return Infinity;
        const first = raw.split(/[-–]/)[0].trim();
        const n = parseInt(first, 10);
        return isNaN(n) ? Infinity : n;
    }

    const sortedResults = $derived(
        [...results].sort(
            (a, b) =>
                parseEarliestYear(detailMap.get(a.manuscript_id)) -
                parseEarliestYear(detailMap.get(b.manuscript_id)),
        ),
    );

    // UI state
    let sidebarOpen = $state(true);
    let zoomed = $state(false);
    let downloading = $state(false);
    let downloadMsg = $state("");
    let inserting = $state(false);
    let insertMsg = $state("");
    let surahInput = $state(1);
    let ayahInput = $state(1);
    let referenceError = $state("");
    let syncedInputRefKey: string | null = null;

    $effect(() => {
        const ref = $manuscriptAyah;
        if (!ref) return;

        const refKey = `${ref.surah}:${ref.ayah}`;
        if (syncedInputRefKey === refKey) return;
        syncedInputRefKey = refKey;
        surahInput = ref.surah;
        ayahInput = ref.ayah;
        referenceError = "";
    });

    function loadReference() {
        const surah = Number(surahInput);
        const ayah = Number(ayahInput);
        if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
            referenceError = $t("manuscript.invalid_surah");
            return;
        }
        if (!Number.isInteger(ayah) || ayah < 1) {
            referenceError = $t("manuscript.invalid_ayah");
            return;
        }

        referenceError = "";
        manuscriptAyah.set({ surah, ayah });
    }

    // In-container zoom
    let imgScale = $state(1);
    let imgTranslateX = $state(0);
    let imgTranslateY = $state(0);
    let isPanning = $state(false);
    let panStartX = 0,
        panStartY = 0,
        panOriginX = 0,
        panOriginY = 0;
    const MIN_SCALE = 1,
        MAX_SCALE = 8;

    function resetZoom() {
        imgScale = 1;
        imgTranslateX = 0;
        imgTranslateY = 0;
    }

    function onWheel(e: WheelEvent) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        imgScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, imgScale * delta));
        if (imgScale === MIN_SCALE) {
            imgTranslateX = 0;
            imgTranslateY = 0;
        }
    }

    function startPan(e: PointerEvent) {
        if (imgScale <= 1) return;
        // Don't hijack clicks on buttons inside the container
        if ((e.target as HTMLElement).closest("button")) return;
        isPanning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        panOriginX = imgTranslateX;
        panOriginY = imgTranslateY;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }
    function onPan(e: PointerEvent) {
        if (!isPanning) return;
        imgTranslateX = panOriginX + (e.clientX - panStartX);
        imgTranslateY = panOriginY + (e.clientY - panStartY);
    }
    function stopPan() {
        isPanning = false;
    }

    const selectedManuscript = $derived(
        sortedResults.find((m) => m.manuscript_id === selectedId) ??
            sortedResults[0] ??
            null,
    );
    const selectedPage = $derived(
        selectedManuscript?.pages?.[folioIdx] ?? null,
    );
    const selectedImage = $derived(selectedPage?.images?.[0] ?? null);
    const selectedDetail = $derived(
        selectedManuscript
            ? (detailMap.get(selectedManuscript.manuscript_id) ?? null)
            : null,
    );

    // ── Object URL cleanup ────────────────────────────────────────────────────
    let objectUrls: string[] = [];
    function revokeAll() {
        for (const u of objectUrls) URL.revokeObjectURL(u);
        objectUrls = [];
    }

    // ── Fetch list ────────────────────────────────────────────────────────────
    $effect(() => {
        const ref = $manuscriptAyah;
        if (!open) return;
        if (demoMode) {
            // Use bundled offline demo data
            results = DEMO_ENTRIES;
            detailMap = new Map(DEMO_DETAILS);
            selectedId = DEMO_ENTRIES[0].manuscript_id;
            folioIdx = 0;
            loading = false;
            error = false;
            return;
        }
        if (!ref) return;
        const refKey = `${ref.surah}:${ref.ayah}`;
        if (loadedRefKey === refKey) return;

        loading = true;
        results = [];
        error = false;
        selectedId = null;
        folioIdx = 0;
        detailMap = new Map();
        revokeAll();
        imageSrc = null;
        thumbnailBytes = null;
        loadedIds = new Set();

        invoke<string>("get_manuscript_list", {
            surah: ref.surah,
            ayah: ref.ayah,
        })
            .then((raw) => {
                const parsed = JSON.parse(raw) as { data?: ManuscriptEntry[] };
                results = Array.isArray(parsed.data) ? parsed.data : [];
                loadedRefKey = refKey;
                if (results.length > 0) selectedId = results[0].manuscript_id;
            })
            .catch(() => {
                error = true;
            })
            .finally(() => {
                loading = false;
            });
    });

    // ── Fetch details for all manuscripts (background, for date in list) ──────
    $effect(() => {
        if (results.length === 0 || demoMode) return;
        for (const ms of results) {
            if (detailMap.has(ms.manuscript_id)) continue;
            invoke<string>("get_manuscript_detail", {
                manuscriptId: ms.manuscript_id,
            })
                .then((raw) => {
                    const detail = JSON.parse(raw).data as ManuscriptDetail;
                    detailMap = new Map([
                        ...detailMap,
                        [ms.manuscript_id, detail],
                    ]);
                })
                .catch(() => {});
        }
    });

    // ── Load image ────────────────────────────────────────────────────────────
    $effect(() => {
        const img = selectedImage;
        if (!img) {
            imageSrc = null;
            imageSource = "";
            return;
        }
        imageLoading = true;
        imageError = false;
        resetZoom();
        imageSource = img.image_source?.trim() ?? "";

        if (demoMode) {
            // Load from bundled resource — find demo index by manuscript_id
            const demoIdx = DEMO_ENTRIES.findIndex(
                (e) => e.manuscript_id === selectedManuscript?.manuscript_id,
            );
            invoke<number[]>("get_manuscript_demo_image", {
                index: demoIdx >= 0 ? demoIdx : 0,
            })
                .then((bytes) => {
                    const url = URL.createObjectURL(
                        new Blob([new Uint8Array(bytes)], {
                            type: "image/jpeg",
                        }),
                    );
                    objectUrls.push(url);
                    imageSrc = url;
                })
                .catch(() => {
                    imageError = true;
                    imageSrc = null;
                })
                .finally(() => {
                    imageLoading = false;
                });
            return;
        }

        const msId = selectedManuscript?.manuscript_id;
        invoke<number[]>("get_manuscript_image", {
            imageUrl: img.image_url,
            thumbnail: true,
        })
            .then((bytes) => {
                thumbnailBytes = bytes;
                if (msId !== undefined)
                    loadedIds = new Set([...loadedIds, msId]);
                const url = URL.createObjectURL(
                    new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
                );
                objectUrls.push(url);
                imageSrc = url;
            })
            .catch(() => {
                imageError = true;
                imageSrc = null;
            })
            .finally(() => {
                imageLoading = false;
            });
    });

    // ── Download to Downloads folder ──────────────────────────────────────────
    async function downloadFull() {
        const img = selectedImage;
        const ms = selectedManuscript;
        if (!img || !ms || downloading) return;
        downloading = true;
        downloadMsg = "";
        const filename = `cc-ms-${ms.manuscript_id}-${selectedPage?.folio}${selectedPage?.side ?? ""}.jpg`;
        try {
            const path = await invoke<string>("save_manuscript_to_downloads", {
                imageUrl: img.image_url,
                filename,
            });
            const short = path.split("/").pop() ?? filename;
            downloadMsg = $t("manuscript.download_saved", { filename: short });
        } catch (e) {
            downloadMsg = $t("manuscript.download_failed", {
                error: String(e).slice(0, 60),
            });
        } finally {
            downloading = false;
            setTimeout(() => {
                downloadMsg = "";
            }, 4000);
        }
    }

    // ── Insert into Lexical editor ────────────────────────────────────────────
    function bytesToDataUrl(bytes: number[], mime: string): string {
        const uint8 = new Uint8Array(bytes);
        let binary = "";
        const chunk = 8192;
        for (let i = 0; i < uint8.length; i += chunk)
            binary += String.fromCharCode(...uint8.subarray(i, i + chunk));
        return `data:${mime};base64,${btoa(binary)}`;
    }

    function buildCaptionText(): string {
        const ms = selectedManuscript;
        const page = selectedPage;
        const img = selectedImage;
        if (!ms) return "";

        const ref = $manuscriptAyah;
        const parts: string[] = [ms.title];
        if (ref)
            parts.push(
                $t("manuscript.caption_reference", {
                    surah: String(ref.surah),
                    ayah: String(ref.ayah),
                }),
            );
        const folioValue = `${page?.folio ?? ""}${page?.side ?? ""}`.trim();
        if (folioValue)
            parts.push($t("manuscript.caption_folio", { folio: folioValue }));
        if (ms.archive.name) parts.push(ms.archive.name);
        if (ms.archive.city) parts.push(ms.archive.city);
        const date =
            selectedDetail?.date?.trim() ||
            selectedDetail?.carbon_dating?.trim();
        if (date) parts.push(date);
        if (img?.image_source?.trim()) parts.push(img.image_source.trim());

        return parts.join(" · ");
    }

    function buildCorpusCoranicumUrl(): string | undefined {
        const ms = selectedManuscript;
        const page = selectedPage;
        const ref = $manuscriptAyah;
        if (!ms || !ref) return undefined;

        const folio = `${page?.folio ?? ""}${page?.side ?? ""}`.trim();
        const pagePart = folio ? `/page/${folio}` : "";
        return `https://corpuscoranicum.de/en/manuscripts/${ms.manuscript_id}${pagePart}?sura=${ref.surah}&verse=${ref.ayah}`;
    }

    // ── AI prompt about this manuscript (Pro) ────────────────────────────────
    let aiPromptOpen = $state(false);
    let aiPromptX = $state(0);
    let aiPromptY = $state(0);
    let aiPromptText = $state("");
    let aiPromptInput: HTMLInputElement | null = $state(null);

    function buildManuscriptContext(): string {
        const ms = selectedManuscript;
        const det = selectedDetail;
        const ref = $manuscriptAyah;
        const page = selectedPage;
        const lines: string[] = [];
        lines.push(
            "This is an extant manuscript of the Qur'an containing the specified surah and ayah.",
        );
        if (ref) lines.push(`Surah: ${ref.surah}`, `Ayah: ${ref.ayah}`);
        if (ms) {
            lines.push(`Manuscript title: ${ms.title}`);
            lines.push(
                `Archive: ${ms.archive.name}${ms.archive.city ? ", " + ms.archive.city : ""}${ms.archive.country_code ? " (" + ms.archive.country_code + ")" : ""}`,
            );
            if (ms.archive.link) lines.push(`Archive link: ${ms.archive.link}`);
        }
        if (page) {
            const folio = `${page.folio ?? ""}${page.side ?? ""}`.trim();
            if (folio) lines.push(`Folio: ${folio}`);
        }
        if (det) {
            if (det.call_number) lines.push(`Call number: ${det.call_number}`);
            if (det.date) lines.push(`Date: ${det.date}`);
            if (det.carbon_dating)
                lines.push(`Carbon dating: ${det.carbon_dating}`);
            if (det.dimensions) lines.push(`Dimensions: ${det.dimensions}`);
            if (det.writing_surface)
                lines.push(`Writing surface: ${det.writing_surface}`);
            if (det.line_min || det.line_max) {
                const lo = det.line_min ?? "";
                const hi = det.line_max ?? "";
                lines.push(
                    `Lines per page: ${lo}${lo && hi && lo !== hi ? "–" + hi : hi && !lo ? hi : ""}`,
                );
            }
            if (
                det.number_of_folios !== null &&
                det.number_of_folios !== undefined
            )
                lines.push(`Number of folios: ${det.number_of_folios}`);
            if (det.script_styles?.length)
                lines.push(`Script styles: ${det.script_styles.join(", ")}`);
            if (det.codicology) lines.push(`Codicology: ${det.codicology}`);
            if (det.paleography) lines.push(`Paleography: ${det.paleography}`);
            if (det.catalogue_entry)
                lines.push(`Catalogue entry: ${det.catalogue_entry}`);
        }
        const url = buildCorpusCoranicumUrl();
        if (url) lines.push(`Corpus Coranicum link: ${url}`);
        return lines.join("\n");
    }

    function openAiPrompt(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        aiPromptX = rect.right;
        aiPromptY = rect.bottom + 8;
        aiPromptText = "";
        aiPromptOpen = true;
        queueMicrotask(() => aiPromptInput?.focus());
    }

    function closeAiPrompt() {
        aiPromptOpen = false;
        aiPromptText = "";
    }

    function submitAiPrompt() {
        const prompt = aiPromptText.trim();
        if (!prompt) return;
        const contextPrompt = buildManuscriptContext();
        const ref = $manuscriptAyah;
        const selectedText =
            selectedManuscript?.title ??
            (ref ? `Qur'an ${ref.surah}:${ref.ayah}` : "manuscript");
        askAiAboutSelection({ prompt, selectedText, contextPrompt });
        closeAiPrompt();
    }

    async function insertToLexical() {
        const editor = get(lexicalEditorInstance);
        if (!editor || !imageSrc) return;
        inserting = true;
        insertMsg = "";
        try {
            let dataUrl: string;
            if (demoMode) {
                const demoIdx = DEMO_ENTRIES.findIndex(
                    (e) =>
                        e.manuscript_id === selectedManuscript?.manuscript_id,
                );
                const bytes = await invoke<number[]>(
                    "get_manuscript_demo_image",
                    {
                        index: demoIdx >= 0 ? demoIdx : 0,
                    },
                );
                dataUrl = bytesToDataUrl(bytes, "image/jpeg");
            } else {
                const img = selectedImage;
                if (!img) return;
                const bytes =
                    thumbnailBytes ??
                    (await invoke<number[]>("get_manuscript_image", {
                        imageUrl: img.image_url,
                        thumbnail: false,
                    }));
                dataUrl = bytesToDataUrl(bytes, "image/jpeg");
            }
            const altText = selectedManuscript
                ? `${selectedManuscript.title} — ${$t(
                      "manuscript.caption_folio",
                      {
                          folio: `${selectedPage?.folio ?? ""}${selectedPage?.side ?? ""}`,
                      },
                  )}`
                : $t("manuscript.image_alt_default");
            const captionText = buildCaptionText();
            const linkUrl = buildCorpusCoranicumUrl();
            editor.dispatchCommand(INSERT_IMAGE_COMMAND, {
                src: dataUrl,
                altText,
                captionText,
                linkUrl,
            });
            insertMsg = $t("manuscript.inserted");
        } catch (e) {
            await message(
                $t("manuscript.insert_failed_message", { error: String(e) }),
                { title: $t("manuscript.insert_failed_title"), kind: "error" },
            );
        } finally {
            inserting = false;
            setTimeout(() => {
                insertMsg = "";
            }, 3000);
        }
    }

    // ── Drag + keyboard ───────────────────────────────────────────────────────
    $effect(() => {
        if (typeof window === "undefined") return;
        if (open) {
            if (!initialized) {
                x = Math.max(0, (window.innerWidth - panelW) / 2);
                // In demo mode, shift down so the tour tooltip at top-12px has room
                y = demoMode
                    ? Math.min(window.innerHeight - panelH - 8, 140)
                    : Math.max(0, (window.innerHeight - panelH) / 2);
                if (!demoMode) zIndex = bringToFront();
                initialized = true;
            }
            window.addEventListener("keydown", handleKeydown);
        } else {
            if (demoMode) initialized = false; // always re-center demo on next open
            window.removeEventListener("keydown", handleKeydown);
        }
        return () => window.removeEventListener("keydown", handleKeydown);
    });

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === "Escape") {
            if (zoomed) {
                zoomed = false;
            } else {
                onClose();
            }
        }
    }

    function startDrag(e: PointerEvent) {
        if (typeof window === "undefined") return;
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
                window.innerWidth - panelW,
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
        if (typeof window !== "undefined") {
            window.removeEventListener("pointermove", onDrag);
            window.removeEventListener("pointermove", onResize);
            window.removeEventListener("keydown", handleKeydown);
        }
        revokeAll();
    });
</script>

<!-- ── Zoom overlay ──────────────────────────────────────────────────────── -->
{#if zoomed && imageSrc}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="fixed inset-0 z-9999 bg-black/92 flex items-center justify-center cursor-zoom-out"
        onclick={() => (zoomed = false)}
        onkeydown={(e) => e.key === "Escape" && (zoomed = false)}
    >
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <img
            src={imageSrc}
            alt={$t("manuscript.image_alt_zoomed")}
            class="max-w-[94vw] max-h-[94vh] object-contain rounded-xl shadow-2xl"
            onclick={(e) => e.stopPropagation()}
            onkeydown={(e) => e.stopPropagation()}
        />
        <button
            onclick={() => (zoomed = false)}
            class="absolute top-4 right-4 cursor-pointer text-gray-100 dark:text-gray-700 hover:dark:text-gray-100/70 hover:text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 transition-colors"
            aria-label={$t("manuscript.close_zoom")}
        >
            <Icon icon="solar:close-circle-bold-duotone" width="1.8rem" />
        </button>
    </div>
{/if}

<!-- ── Main panel ───────────────────────────────────────────────────────── -->
{#if open}
    <div
        transition:fly={{ y: 8, duration: 180, opacity: 0 }}
        class="fixed flex flex-col rounded-3xl shadow-xl dark:shadow-black/40
           bg-white dark:bg-[#303446]
           border border-brand-sand-200 dark:border-[#414559]
           {demoMode ? 'z-9998' : ''}"
        style="width:{panelW}px; height:{panelH}px; left:{x}px; top:{y}px;{demoMode
            ? ''
            : ` z-index:${zIndex};`}"
        onpointerdown={() => {
            if (!demoMode) zIndex = bringToFront();
        }}
    >
        <!-- Header / drag handle -->
        <div
            class="flex items-center justify-between px-4 py-1.5 shrink-0
               border-b border-brand-gold-200 dark:border-[#414559]
               bg-brand-gold-100 dark:bg-[#292c3c]
               select-none rounded-t-3xl
               {isDragging ? 'cursor-grabbing' : 'cursor-grab'}"
            onpointerdown={startDrag}
            role="banner"
        >
            <div class="flex items-center gap-2">
                <Icon
                    icon="solar:document-text-bold-duotone"
                    width="1.1rem"
                    class="text-brand-gold-500"
                />
                {#if demoMode}
                    <span
                        class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                    >
                        {$t("manuscript.demo_title")}
                        <span
                            class="ml-1 text-[11px] font-normal text-brand-gold-500 border border-brand-gold-300 dark:border-[#e5c890]/40 rounded-full px-1.5 py-0.5"
                            >{$t("manuscript.demo_badge")}</span
                        >
                    </span>
                {:else if $manuscriptAyah}
                    <span
                        class="text-[11px] font-semibold uppercase tracking-wide
			             text-brand-charcoal-500 dark:text-[#838ba7] py-2"
                    >
                        {$t("manuscript.title_ayah", {
                            surah: String($manuscriptAyah.surah),
                            ayah: String($manuscriptAyah.ayah),
                        })}
                    </span>
                {:else}
                    <span
                        class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5]"
                    >
                        {$t("manuscript.title")}
                    </span>
                {/if}
            </div>
            <div class="flex items-center gap-1">
                <!-- Sidebar toggle -->
                <button
                    onclick={() => (sidebarOpen = !sidebarOpen)}
                    title={sidebarOpen
                        ? $t("manuscript.hide_list")
                        : $t("manuscript.show_list")}
                    class="cursor-pointer p-1 rounded-lg text-brand-charcoal-300 dark:text-[#838ba7]
                       hover:bg-brand-gold-200 dark:hover:bg-[#414559] transition-colors"
                >
                    <Icon
                        icon={sidebarOpen
                            ? "solar:sidebar-minimalistic-bold-duotone"
                            : "solar:sidebar-minimalistic-bold"}
                        width="1rem"
                    />
                </button>
                <button
                    onclick={onClose}
                    class="cursor-pointer flex h-6 w-6 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                    aria-label={$t("manuscript.close")}
                >
                    <Icon
                        icon="solar:close-circle-bold-duotone"
                        width="0.85rem"
                    />
                </button>
            </div>
        </div>

        {#if !demoMode}
            <div
                class="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c]/60 px-4 py-2"
            >
                <form
                    class="flex flex-wrap items-center gap-2"
                    onsubmit={(e) => {
                        e.preventDefault();
                        loadReference();
                    }}
                >
                    <label
                        for="manuscript-surah-input"
                        class="text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
                    >
                        {$t("manuscript.surah")}
                    </label>
                    <input
                        id="manuscript-surah-input"
                        type="number"
                        min="1"
                        max="114"
                        bind:value={surahInput}
                        class="w-16 rounded-lg border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] px-2 py-1 text-[11px] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5] outline-none focus:border-brand-gold-400 focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20"
                    />
                    <label
                        for="manuscript-ayah-input"
                        class="text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
                    >
                        {$t("manuscript.ayah")}
                    </label>
                    <input
                        id="manuscript-ayah-input"
                        type="number"
                        min="1"
                        bind:value={ayahInput}
                        class="w-16 rounded-lg border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] px-2 py-1 text-[11px] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5] outline-none focus:border-brand-gold-400 focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20"
                    />
                    <button
                        type="submit"
                        class="cursor-pointer inline-flex items-center gap-1 rounded-full bg-brand-gold-400 dark:bg-brand-gold-600 px-3 py-1 text-[11px] font-semibold text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90 transition-colors"
                    >
                        <Icon
                            icon="solar:refresh-bold-duotone"
                            width="0.75rem"
                        />
                        {$t("manuscript.load_reference")}
                    </button>
                </form>
                <div class="flex items-center gap-2">
                    {#if referenceError}
                        <span
                            class="text-[11px] font-medium text-red-500 dark:text-red-400"
                        >
                            {referenceError}
                        </span>
                    {:else if $manuscriptAyah}{:else}
                        <span
                            class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                        >
                            {$t("manuscript.reference_prompt")}
                        </span>
                    {/if}
                    {#if $isPro && selectedManuscript && $manuscriptAyah}
                        <button
                            type="button"
                            onclick={openAiPrompt}
                            title={$t("manuscript.ai_ask")}
                            aria-label={$t("manuscript.ai_ask")}
                            class="cursor-pointer inline-flex items-center gap-1 rounded-full bg-brand-gold-200 dark:bg-[#414559] px-3 py-1 text-[11px] font-semibold text-brand-gold-600 dark:text-[#e5c890] hover:bg-brand-gold-300 dark:hover:bg-[#51576d] transition-colors"
                        >
                            <Icon
                                icon="ri:chat-smile-ai-fill"
                                width="0.75rem"
                            />
                            {$t("manuscript.ai_ask")}
                        </button>
                    {/if}
                </div>
            </div>
        {/if}

        <!-- Body -->
        <div class="flex flex-1 min-h-0">
            <!-- Left rail (collapsible) -->
            <div
                class="shrink-0 overflow-hidden
                   transition-all duration-200 {sidebarOpen ? 'w-55' : 'w-0'}"
            >
                <div class="default-scroll w-55 h-full overflow-y-auto py-2">
                    {#if loading}
                        <div class="flex justify-center items-center pt-10">
                            <div
                                class="w-5 h-5 rounded-full border-2 border-brand-gold-400 border-t-transparent animate-spin"
                            ></div>
                        </div>
                    {:else if error}
                        <div
                            class="px-3 py-4 text-xs text-red-500 dark:text-red-400 text-center leading-relaxed"
                        >
                            {$t("manuscript.error").split("\n")[0]}<br />{$t(
                                "manuscript.error",
                            ).split("\n")[1]}
                        </div>
                    {:else if !$manuscriptAyah}
                        <div
                            class="px-3 py-4 text-xs text-brand-charcoal-300 dark:text-[#838ba7] text-center leading-relaxed"
                        >
                            {$t("manuscript.reference_prompt")}
                        </div>
                    {:else if results.length === 0}
                        <div
                            class="px-3 py-4 text-xs text-brand-charcoal-300 dark:text-[#838ba7] text-center"
                        >
                            {$t("manuscript.none")}
                        </div>
                    {:else}
                        <div class="px-3 pb-1.5 pt-0.5">
                            <span
                                class="text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
                            >
                                {results.length === 1
                                    ? $t("manuscript.count_one")
                                    : $t("manuscript.count_many", {
                                          n: String(results.length),
                                      })}
                            </span>
                        </div>
                        {#each sortedResults as ms}
                            {@const detail = detailMap.get(ms.manuscript_id)}
                            {@const dateStr =
                                detail?.date?.trim() ||
                                detail?.carbon_dating?.trim() ||
                                ""}
                            {@const isSelected =
                                selectedManuscript?.manuscript_id ===
                                ms.manuscript_id}
                            <button
                                onclick={() => {
                                    selectedId = ms.manuscript_id;
                                    folioIdx = 0;
                                }}
                                class="cursor-pointer w-full text-left px-3 py-2 transition-colors
                                   {isSelected
                                    ? 'bg-brand-sand-100 dark:bg-[#363a4f]'
                                    : 'hover:bg-brand-sand-50 dark:hover:bg-[#292c3c]'}"
                            >
                                <div class="flex items-start gap-1.5">
                                    <span
                                        class="mt-0.5 text-brand-gold-500 shrink-0"
                                    >
                                        <Icon
                                            icon={isSelected
                                                ? "solar:record-circle-bold"
                                                : "solar:record-circle-outline"}
                                            width="0.7rem"
                                        />
                                    </span>
                                    <div class="min-w-0 flex-1">
                                        <p
                                            class="text-[11px] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5] leading-tight wrap-break-word flex items-center gap-1"
                                        >
                                            {ms.title}
                                            {#if loadedIds.has(ms.manuscript_id)}
                                                <span
                                                    class="shrink-0 inline-block w-1.5 h-1.5 rounded-full bg-brand-gold-400 dark:bg-[#e5c890]"
                                                    title={$t(
                                                        "manuscript.image_loaded",
                                                    )}
                                                ></span>
                                            {/if}
                                        </p>
                                        {#if dateStr}
                                            <p
                                                class="text-[11px] text-brand-gold-500 dark:text-[#e5c890] mt-0.5 font-medium"
                                            >
                                                {$t("manuscript.date_ce", {
                                                    date: dateStr,
                                                })}
                                            </p>
                                        {:else if !detail}
                                            <span
                                                class="inline-block mt-0.5 w-12 h-2 rounded bg-brand-sand-200 dark:bg-[#414559] animate-pulse"
                                            ></span>
                                        {/if}
                                        <p
                                            class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7] leading-tight"
                                        >
                                            {ms.archive.name}
                                        </p>
                                        <p
                                            class="text-[11px] text-brand-charcoal-200 dark:text-[#626880] leading-tight"
                                        >
                                            {ms.archive.city}
                                        </p>
                                    </div>
                                </div>
                            </button>
                        {/each}
                    {/if}
                </div>
            </div>

            <!-- Right pane -->
            <div class="flex-1 flex flex-col min-w-0 min-h-0">
                {#if selectedManuscript}
                    <!-- Folio tabs -->
                    {#if selectedManuscript.pages.length > 1}
                        <div
                            class="flex gap-1 px-3 pt-2 pb-1.5 shrink-0 border-b border-slate-100 dark:border-[#414559] flex-wrap"
                        >
                            {#each selectedManuscript.pages as page, i}
                                <button
                                    onclick={() => (folioIdx = i)}
                                    class={`cursor-pointer px-2 py-0.5 text-[11px] font-semibold rounded-full border transition-colors
                                    ${
                                        folioIdx === i
                                            ? "bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 border-brand-gold-400"
                                            : "border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]"
                                    }`}>{page.folio}{page.side}</button
                                >
                            {/each}
                        </div>
                    {/if}

                    <!-- Image area -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="relative flex-1 flex items-center justify-center p-2 min-h-0 overflow-hidden
                           {imageSrc && !imageLoading
                            ? imgScale > 1
                                ? 'cursor-grab'
                                : 'cursor-default'
                            : ''}"
                        onwheel={imageSrc && !imageLoading
                            ? onWheel
                            : undefined}
                        onpointerdown={imageSrc && !imageLoading
                            ? startPan
                            : undefined}
                        onpointermove={imageSrc && !imageLoading
                            ? onPan
                            : undefined}
                        onpointerup={stopPan}
                        onpointercancel={stopPan}
                    >
                        {#if imageLoading}
                            <div
                                class="w-8 h-8 rounded-full border-2 border-brand-gold-400 border-t-transparent animate-spin"
                            ></div>
                        {:else if imageError}
                            <div
                                class="text-xs text-red-500 dark:text-red-400 text-center"
                            >
                                <Icon
                                    icon="solar:close-circle-bold-duotone"
                                    width="1.5rem"
                                    class="mx-auto mb-1"
                                />
                                {$t("manuscript.image_error")}
                            </div>
                        {:else if imageSrc}
                            <img
                                src={imageSrc}
                                alt={$t("manuscript.image_alt_folio", {
                                    folio: `${selectedPage?.folio ?? ""}${selectedPage?.side ?? ""}`,
                                })}
                                class="max-w-full max-h-full object-contain rounded-lg shadow-md select-none pointer-events-none"
                                style="transform: scale({imgScale}) translate({imgTranslateX /
                                    imgScale}px, {imgTranslateY / imgScale}px);
                                   transform-origin: center; transition: {isPanning
                                    ? 'none'
                                    : 'transform 0.1s ease'};"
                                draggable="false"
                            />
                            <!-- Zoom controls -->
                            <div
                                class="absolute top-3 right-3 flex flex-col gap-1"
                            >
                                <!-- Zoom in -->
                                <button
                                    onclick={() => {
                                        imgScale = Math.min(
                                            MAX_SCALE,
                                            imgScale * 1.3,
                                        );
                                    }}
                                    title={$t("manuscript.zoom_in")}
                                    class="cursor-pointer p-1.5 rounded-full
                                       bg-white/90 dark:bg-[#292c3c]/90 border border-slate-200 dark:border-[#414559]
                                       text-brand-charcoal-400 dark:text-[#8caaee]
                                       hover:bg-white dark:hover:bg-[#292c3c] transition-colors shadow-sm"
                                >
                                    <Icon
                                        icon="solar:add-circle-bold-duotone"
                                        width="0.85rem"
                                    />
                                </button>
                                <!-- Zoom out -->
                                <button
                                    onclick={() => {
                                        imgScale = Math.max(
                                            MIN_SCALE,
                                            imgScale / 1.3,
                                        );
                                        if (imgScale <= MIN_SCALE) resetZoom();
                                    }}
                                    disabled={imgScale <= MIN_SCALE}
                                    title={$t("manuscript.zoom_out")}
                                    class="cursor-pointer p-1.5 rounded-full
                                       bg-white/90 dark:bg-[#292c3c]/90 border border-slate-200 dark:border-[#414559]
                                       text-brand-charcoal-400 dark:text-[#8caaee]
                                       hover:bg-white dark:hover:bg-[#292c3c] transition-colors shadow-sm
                                       disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    <Icon
                                        icon="solar:minus-circle-bold-duotone"
                                        width="0.85rem"
                                    />
                                </button>
                                <!-- Reset (only when zoomed) -->
                                {#if imgScale > 1}
                                    <button
                                        onclick={resetZoom}
                                        title={$t("manuscript.zoom_reset")}
                                        class="cursor-pointer p-1.5 rounded-full
                                           bg-white/90 dark:bg-[#292c3c]/90 border border-slate-200 dark:border-[#414559]
                                           text-brand-charcoal-400 dark:text-[#8caaee]
                                           hover:bg-white dark:hover:bg-[#292c3c] transition-colors shadow-sm"
                                    >
                                        <Icon
                                            icon="solar:minimize-square-bold-duotone"
                                            width="0.85rem"
                                        />
                                    </button>
                                {/if}
                                <!-- Fullscreen -->
                                <button
                                    onclick={() => {
                                        zoomed = true;
                                    }}
                                    title={$t("manuscript.fullscreen")}
                                    class="cursor-pointer p-1.5 rounded-full
                                       bg-white/90 dark:bg-[#292c3c]/90 border border-slate-200 dark:border-[#414559]
                                       text-brand-charcoal-400 dark:text-[#8caaee]
                                       hover:bg-white dark:hover:bg-[#292c3c] transition-colors shadow-sm"
                                >
                                    <Icon
                                        icon="solar:full-screen-bold-duotone"
                                        width="0.85rem"
                                    />
                                </button>
                            </div>
                            <!-- Zoom level badge -->
                            {#if imgScale > 1}
                                <span
                                    class="absolute bottom-3 right-3 text-[9px] font-semibold px-1.5 py-0.5 rounded-full
                                         bg-black/40 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100/90 backdrop-blur-sm select-none pointer-events-none"
                                >
                                    {Math.round(imgScale * 100)}%
                                </span>
                            {/if}
                        {:else}
                            <div
                                class="text-xs text-brand-charcoal-300 dark:text-[#838ba7]"
                            >
                                {$t("explorer.loading")}
                            </div>
                        {/if}
                    </div>

                    <!-- Metadata panel -->
                    {#if selectedDetail}
                        <div
                            class="shrink-0 border-t border-slate-100 dark:border-[#414559] px-3 py-2 overflow-y-auto max-h-37"
                        >
                            <div
                                class="mb-1.5 flex items-center justify-between gap-2"
                            >
                                <span
                                    class="text-[10px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
                                >
                                    {$t("manuscript.metadata")}
                                </span>
                                <a
                                    href={buildCorpusCoranicumUrl() ??
                                        `https://corpuscoranicum.de/en/manuscripts/${selectedManuscript.manuscript_id}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    class="inline-flex items-center gap-1 rounded-full border border-brand-gold-200 dark:border-[#414559] bg-brand-gold-100/70 dark:bg-[#292c3c] px-2 py-0.5 text-[10px] font-semibold text-brand-gold-600 dark:text-[#e5c890] hover:bg-brand-gold-200/70 dark:hover:bg-[#414559] transition-colors"
                                >
                                    {$t("manuscript.corpus_coranicum")}
                                    <Icon
                                        icon="solar:arrow-right-up-linear"
                                        width="0.65rem"
                                    />
                                </a>
                            </div>
                            <div
                                class="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10.5px]"
                            >
                                {#if selectedDetail.date?.trim()}
                                    <div class="flex gap-1.5">
                                        <span
                                            class="text-brand-charcoal-300 dark:text-[#838ba7] shrink-0"
                                            >{$t("manuscript.meta_date")}</span
                                        >
                                        <span
                                            class="font-medium text-brand-charcoal-900 dark:text-[#c6d0f5]"
                                            >{$t("manuscript.date_ce", {
                                                date: selectedDetail.date,
                                            })}</span
                                        >
                                    </div>
                                {/if}
                                {#if selectedDetail.carbon_dating?.trim()}
                                    <div class="flex gap-1.5">
                                        <span
                                            class="text-brand-charcoal-300 dark:text-[#838ba7] shrink-0"
                                            >{$t(
                                                "manuscript.meta_radiocarbon",
                                            )}</span
                                        >
                                        <span
                                            class="font-medium text-brand-charcoal-900 dark:text-[#c6d0f5]"
                                            >{selectedDetail.carbon_dating}</span
                                        >
                                    </div>
                                {/if}
                                {#if selectedDetail.writing_surface?.trim()}
                                    <div class="flex gap-1.5">
                                        <span
                                            class="text-brand-charcoal-300 dark:text-[#838ba7] shrink-0"
                                            >{$t(
                                                "manuscript.meta_material",
                                            )}</span
                                        >
                                        <span
                                            class="font-medium text-brand-charcoal-900 dark:text-[#c6d0f5]"
                                            >{selectedDetail.writing_surface}</span
                                        >
                                    </div>
                                {/if}
                                {#if selectedDetail.script_styles?.length}
                                    <div class="flex gap-1.5">
                                        <span
                                            class="text-brand-charcoal-300 dark:text-[#838ba7] shrink-0"
                                            >{$t(
                                                "manuscript.meta_script",
                                            )}</span
                                        >
                                        <span
                                            class="font-medium text-brand-charcoal-900 dark:text-[#c6d0f5]"
                                            >{selectedDetail.script_styles.join(
                                                ", ",
                                            )}</span
                                        >
                                    </div>
                                {/if}
                                {#if selectedDetail.dimensions?.trim()}
                                    <div class="flex gap-1.5">
                                        <span
                                            class="text-brand-charcoal-300 dark:text-[#838ba7] shrink-0"
                                            >{$t("manuscript.meta_size")}</span
                                        >
                                        <span
                                            class="font-medium text-brand-charcoal-900 dark:text-[#c6d0f5]"
                                            >{$t("manuscript.size_mm", {
                                                size: selectedDetail.dimensions,
                                            })}</span
                                        >
                                    </div>
                                {/if}
                                {#if selectedDetail.number_of_folios != null}
                                    <div class="flex gap-1.5">
                                        <span
                                            class="text-brand-charcoal-300 dark:text-[#838ba7] shrink-0"
                                            >{$t(
                                                "manuscript.meta_folios",
                                            )}</span
                                        >
                                        <span
                                            class="font-medium text-brand-charcoal-900 dark:text-[#c6d0f5]"
                                            >{selectedDetail.number_of_folios}</span
                                        >
                                    </div>
                                {/if}
                                {#if selectedDetail.call_number?.trim()}
                                    <div class="flex gap-1.5">
                                        <span
                                            class="text-brand-charcoal-300 dark:text-[#838ba7] shrink-0"
                                            >{$t(
                                                "manuscript.meta_callno",
                                            )}</span
                                        >
                                        <span
                                            class="font-medium text-brand-charcoal-900 dark:text-[#c6d0f5]"
                                            >{selectedDetail.call_number}</span
                                        >
                                    </div>
                                {/if}
                                {#if selectedDetail.line_min?.trim()}
                                    <div class="flex gap-1.5">
                                        <span
                                            class="text-brand-charcoal-300 dark:text-[#838ba7] shrink-0"
                                            >{$t("manuscript.meta_lines")}</span
                                        >
                                        <span
                                            class="font-medium text-brand-charcoal-900 dark:text-[#c6d0f5]"
                                        >
                                            {selectedDetail.line_min ===
                                            selectedDetail.line_max
                                                ? selectedDetail.line_min
                                                : `${selectedDetail.line_min}–${selectedDetail.line_max}`}
                                        </span>
                                    </div>
                                {/if}
                            </div>
                            {#if selectedDetail.catalogue_entry?.trim()}
                                <details class="mt-2">
                                    <summary
                                        class="text-[11px] font-semibold cursor-pointer text-brand-charcoal-300 dark:text-[#838ba7] hover:text-brand-charcoal-500 dark:hover:text-[#c6d0f5] select-none"
                                    >
                                        {$t("manuscript.catalogue")}
                                    </summary>
                                    <div
                                        class="mt-1 text-[10.5px] text-brand-charcoal-300 dark:text-[#a5adce] leading-relaxed
                                            **:text-inherit [&_a]:text-brand-gold-600 dark:[&_a]:text-[#e5c890]
                                            [&_a:hover]:text-brand-gold-500 dark:[&_a:hover]:text-[#d4b57f]"
                                    >
                                        {@html selectedDetail.catalogue_entry}
                                    </div>
                                </details>
                            {/if}
                        </div>
                    {:else if selectedManuscript && !imageLoading}
                        <!-- skeleton while details load -->
                        <div
                            class="shrink-0 border-t border-slate-100 dark:border-[#414559] px-3 py-2 flex gap-3"
                        >
                            {#each [60, 80, 50, 70] as w}
                                <span
                                    class="inline-block h-3 rounded bg-brand-sand-100 dark:bg-[#363a4f] animate-pulse"
                                    style="width:{w}px"
                                ></span>
                            {/each}
                        </div>
                    {/if}

                    <!-- Footer: credit + download -->
                    <div
                        class="shrink-0 flex items-center justify-between gap-1.5 px-3 py-3 mr-1 border-t border-slate-100 dark:border-[#414559]"
                    >
                        <span
                            class="text-[11px] text-brand-charcoal-300 dark:text-[#626880] truncate min-w-0"
                        >
                            {#if downloadMsg}
                                <span
                                    class={downloadMsg.startsWith("✓")
                                        ? "text-green-600 dark:text-green-400"
                                        : "text-red-500"}>{downloadMsg}</span
                                >
                            {:else if imageSource}
                                {imageSource}
                            {:else}
                                {$t("manuscript.credit_corpus_coranicum")}
                            {/if}
                        </span>
                        <div class="flex items-center gap-1.5 shrink-0">
                            <button
                                onclick={downloadFull}
                                disabled={downloading || !imageSrc}
                                class="cursor-pointer shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-full border
                               border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200
                               dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559]
                               text-brand-charcoal-500 dark:text-[#c6d0f5] transition-colors
                               disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {#if downloading}
                                    <span
                                        class="w-3 h-3 rounded-full border border-brand-charcoal-400 border-t-transparent animate-spin"
                                    ></span>
                                    {$t("manuscript.downloading")}
                                {:else}
                                    <Icon
                                        icon="solar:download-bold-duotone"
                                        width="0.75rem"
                                    />
                                    {$t("manuscript.download")}
                                {/if}
                            </button>
                            <button
                                onclick={insertToLexical}
                                disabled={inserting ||
                                    !imageSrc ||
                                    !$lexicalEditorInstance}
                                title={!$lexicalEditorInstance
                                    ? $t("manuscript.no_editor")
                                    : $t("manuscript.insert_tooltip")}
                                class="cursor-pointer shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-full border border-transparent
                               bg-brand-gold-400 hover:bg-brand-gold-600 active:bg-brand-gold-600/90
                               text-gray-100 dark:text-gray-700 hover:dark:text-gray-100
                               transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {#if inserting}
                                    <span
                                        class="w-3 h-3 rounded-full border border-gray-100 border-t-transparent animate-spin"
                                    ></span>
                                    {$t("manuscript.inserting")}
                                {:else if insertMsg}
                                    {insertMsg}
                                {:else}
                                    <Icon
                                        icon="solar:gallery-add-bold"
                                        width="0.75rem"
                                    />
                                    {$t("manuscript.insert")}
                                {/if}
                            </button>
                        </div>
                    </div>
                {:else if loading}
                    <div class="flex-1 flex items-center justify-center">
                        <div
                            class="w-8 h-8 rounded-full border-2 border-brand-gold-400 border-t-transparent animate-spin"
                        ></div>
                    </div>
                {:else if !$manuscriptAyah}
                    <div
                        class="flex-1 flex flex-col items-center justify-center gap-2 px-6 text-center text-xs text-brand-charcoal-300 dark:text-[#838ba7]"
                    >
                        <Icon
                            icon="solar:document-text-bold-duotone"
                            width="2rem"
                            class="text-brand-sand-400 dark:text-[#626880]"
                        />
                        <span>{$t("manuscript.reference_prompt")}</span>
                    </div>
                {:else if !loading && !error}
                    <div
                        class="flex-1 flex items-center justify-center text-xs text-brand-charcoal-300 dark:text-[#838ba7]"
                    >
                        {$t("manuscript.select")}
                    </div>
                {/if}
            </div>
        </div>

        <!-- Resize handles -->
        <div
            aria-hidden="true"
            class="resize-handle resize-n"
            onpointerdown={(e) =>
                startResize(e, { n: true, s: false, e: false, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-s"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: true, e: false, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-e"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: false, e: true, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-w"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: false, e: false, w: true })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-ne"
            onpointerdown={(e) =>
                startResize(e, { n: true, s: false, e: true, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-se"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: true, e: true, w: false })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-sw"
            onpointerdown={(e) =>
                startResize(e, { n: false, s: true, e: false, w: true })}
        ></div>
        <div
            aria-hidden="true"
            class="resize-handle resize-nw"
            onpointerdown={(e) =>
                startResize(e, { n: true, s: false, e: false, w: true })}
        ></div>
    </div>
{/if}

{#if aiPromptOpen}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        role="presentation"
        class="fixed z-[10001] flex w-96 items-center gap-1.5 rounded-2xl border border-brand-sand-200 bg-white/95 p-1.5 shadow-xl backdrop-blur-sm dark:border-[#414559] dark:bg-[#363a4f]/95 dark:shadow-black/40"
        style="left:{aiPromptX}px; top:{aiPromptY}px; transform: translateX(-100%);"
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => {
            if (e.key === "Escape") closeAiPrompt();
        }}
    >
        <input
            bind:this={aiPromptInput}
            bind:value={aiPromptText}
            placeholder={$t("manuscript.ai_placeholder")}
            class="min-w-0 flex-1 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50 dark:bg-[#1e2030] px-2.5 py-1.5 text-[11px] text-brand-charcoal-900 dark:text-[#c6d0f5] placeholder-brand-charcoal-300 dark:placeholder-[#626880] focus:border-brand-gold-400 focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-brand-gold-900/30"
            onkeydown={(e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    submitAiPrompt();
                } else if (e.key === "Escape") {
                    closeAiPrompt();
                }
            }}
        />
        <button
            type="button"
            onclick={submitAiPrompt}
            disabled={!aiPromptText.trim()}
            aria-label={$t("manuscript.ai_ask")}
            title={$t("manuscript.ai_ask")}
            class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold-400 dark:bg-brand-gold-500 text-gray-100 dark:text-gray-700 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-400 hover:dark:text-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
            <Icon icon="solar:plain-bold-duotone" width="0.85rem" />
        </button>
        <button
            type="button"
            onclick={closeAiPrompt}
            aria-label={$t("common.close")}
            class="cursor-pointer flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-brand-charcoal-300 dark:text-[#838ba7] hover:bg-brand-sand-100 dark:hover:bg-[#414559] transition-colors"
        >
            <Icon icon="solar:close-circle-bold-duotone" width="0.85rem" />
        </button>
    </div>
{/if}

<style>
    .resize-handle {
        position: absolute;
        z-index: 10;
    }
    .resize-n {
        top: 0;
        left: 6px;
        right: 6px;
        height: 6px;
        cursor: n-resize;
    }
    .resize-s {
        bottom: 0;
        left: 6px;
        right: 6px;
        height: 6px;
        cursor: s-resize;
    }
    .resize-e {
        top: 6px;
        right: 0;
        bottom: 6px;
        width: 6px;
        cursor: e-resize;
    }
    .resize-w {
        top: 6px;
        left: 0;
        bottom: 6px;
        width: 6px;
        cursor: w-resize;
    }
    .resize-ne {
        top: 0;
        right: 0;
        width: 12px;
        height: 12px;
        cursor: ne-resize;
    }
    .resize-se {
        bottom: 0;
        right: 0;
        width: 20px;
        height: 20px;
        cursor: se-resize;
    }
    .resize-sw {
        bottom: 0;
        left: 0;
        width: 12px;
        height: 12px;
        cursor: sw-resize;
    }
    .resize-nw {
        top: 0;
        left: 0;
        width: 12px;
        height: 12px;
        cursor: nw-resize;
    }
    .resize-se::before {
        content: "";
        position: absolute;
        bottom: 12px;
        right: 12px;
        width: 5px;
        height: 5px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.4);
        border-right: 1.5px solid rgba(130, 130, 130, 0.4);
        border-bottom-right-radius: 5px;
        pointer-events: none;
    }
    .resize-se::after {
        content: "";
        position: absolute;
        bottom: 8px;
        right: 8px;
        width: 9px;
        height: 9px;
        border-bottom: 1.5px solid rgba(130, 130, 130, 0.55);
        border-right: 1.5px solid rgba(130, 130, 130, 0.55);
        border-bottom-right-radius: 9px;
        pointer-events: none;
    }
</style>
