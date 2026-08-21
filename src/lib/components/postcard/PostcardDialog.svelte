<script lang="ts">
    /**
     * Postcard editor — compose an ayah into a shareable image.
     *
     * The card is drawn straight onto a `<canvas>` at final export resolution
     * and scaled down by CSS for the preview, so what the user arranges is
     * literally the file they export; there is no second rendering path that
     * could drift from the preview.
     */
    import { onDestroy } from "svelte";
    import { fly } from "svelte/transition";
    import Icon from "@iconify/svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { save as saveDialog } from "@tauri-apps/plugin-dialog";
    import { writeFile } from "@tauri-apps/plugin-fs";
    import { bringToFront } from "$lib/stores/window-manager.store";
    import {
        selectedSurahIdx,
        surahLabels,
        morphologyAyahFilter,
    } from "$lib/stores/quran.svelte";
    import {
        activeTranslatorId,
        availableTranslators,
        type AyahTranslation,
    } from "$lib/stores/translation.store";
    import { cachedMorphology, cachedSurahText } from "$lib/stores/surah-cache";
    import type { SurahMorphology } from "$lib/types/morphology";
    import { convertToArabicNumbers } from "$lib/functions/utils/utils";
    import { t } from "$lib/i18n";
    // The app mark, inlined at build time — the packaged app serves the frontend
    // over a custom protocol, so a data URL is the one form that always resolves.
    import ayahlabMark from "../../../../src-tauri/icons/128x128@2x.png?inline";
    import {
        renderPostcard,
        fontSpec,
        supportsCanvasFilter as ctxSupportsFilter,
    } from "./render";
    import {
        PATTERNS,
        GRADIENTS,
        GRADIENT_DIRECTIONS,
        BLEND_MODES,
        CARD_SIZES,
        patternDataUrl,
        type GradientDirection,
        type BlendMode,
    } from "./patterns";

    interface Props {
        open: boolean;
        onClose: () => void;
    }

    let { open, onClose }: Props = $props();

    const selectClass =
        "w-full appearance-none cursor-pointer rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-3 py-1.5 pr-8 text-xs text-brand-charcoal-500 dark:text-[#c6d0f5] transition-all focus:border-brand-gold-400 dark:focus:border-[#e5c890] focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-[#e5c890]/20 hover:border-brand-sand-400 dark:hover:border-[#626880]";
    const labelClass =
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]";
    const chipClass =
        "cursor-pointer rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors";

    // ── Ayah selection ───────────────────────────────────────────────────────
    let surah = $state(1);
    let selected = $state<number[]>([]);
    let morph = $state<SurahMorphology | null>(null);
    let morphLoading = $state(false);
    let anchorAyah = -1;
    let defaultsFor: number | null = null;

    // ── Translation ──────────────────────────────────────────────────────────
    let translatorId = $state("");
    let translations = $state<Map<number, string>>(new Map());

    // ── Card geometry ────────────────────────────────────────────────────────
    let sizeId = $state("portrait");
    const cardSize = $derived(
        CARD_SIZES.find((s) => s.id === sizeId) ?? CARD_SIZES[1],
    );

    // ── Text styling ─────────────────────────────────────────────────────────
    const ARABIC_FONTS = [
        "Scheherazade New",
        "Amiri",
        "Amiri Quran",
        "Aref Ruqaa Ink",
        "Reem Kufi Ink",
    ];
    const LATIN_FONTS = [
        "EB Garamond",
        "Georgia",
        "Times New Roman",
        "Trebuchet MS",
        "Verdana",
        "Arial",
    ];

    let arabicFont = $state("Scheherazade New");
    let arabicSize = $state(78);
    let arabicLine = $state(1.9);
    let arabicColor = $state("#ffffff");
    let showAyahNumbers = $state(true);
    let textAlign = $state<"center" | "right" | "left">("center");
    let vAlign = $state(50); // 0 = top, 100 = bottom
    let autoFit = $state(true);

    let shadowOn = $state(true);
    let shadowBlur = $state(18);
    let shadowDx = $state(0);
    let shadowDy = $state(6);
    let shadowColor = $state("#000000");
    let shadowOpacity = $state(55);

    let translationOn = $state(true);
    let transFont = $state("EB Garamond");
    let transSize = $state(30);
    let transLine = $state(1.55);
    let transColor = $state("#f3e5c0");

    let refOn = $state(true);
    let refLang = $state<"en" | "ar">("en");
    let refSize = $state(24);
    let refColor = $state("#e5cc90");

    let padPct = $state(9);
    let borderOn = $state(true);

    // ── Background ───────────────────────────────────────────────────────────
    let bgMode = $state<"plain" | "manuscript" | "pattern">("pattern");
    let baseColor = $state("#0f2f28");

    let patternId = $state("star8");
    let patternColor = $state("#c8a96a");
    let patternOpacity = $state(22);
    let patternScale = $state(2.2);
    let patternStroke = $state(2);

    let bgOpacity = $state(65);
    let bgZoom = $state(100);
    let bgOffsetX = $state(0);
    let bgOffsetY = $state(0);
    let bgBlur = $state(0);
    let bgGray = $state(false);

    let gradientId = $state("emerald");
    let gradientDir = $state<GradientDirection>("to-bottom");
    let gradientOpacity = $state(70);
    let gradientBlend = $state<BlendMode>("normal");

    // ── Manuscript sourcing ──────────────────────────────────────────────────
    interface MsImage {
        id: number;
        image_url: string;
        image_source: string;
    }
    interface MsPage {
        id: number;
        folio: number | string;
        side: string;
        images: MsImage[];
    }
    interface MsEntry {
        manuscript_id: number;
        title: string;
        archive: { name: string; city: string };
        pages: MsPage[];
    }

    interface MsDetail {
        id: number;
        date: string;
        carbon_dating: string;
        script_styles: string[];
    }

    let msList = $state<MsEntry[]>([]);
    let msDetails = $state(new Map<number, MsDetail>());
    let msDetailFetching = new Set<number>();
    let msDetailsPending = $state(0);
    let msUserPicked = $state(false);
    let msLoading = $state(false);
    let msError = $state(false);
    let msSelectedId = $state<number | null>(null);
    let msFolioIdx = $state(0);
    let msImageLoading = $state(false);
    let msImageError = $state(false);
    let bgImage = $state<HTMLImageElement | null>(null);
    let bgCredit = $state("");
    let msListedFor = "";
    let msImageReq = 0;
    let objectUrls: string[] = [];

    /** Index of the first folio carrying a scan, or -1 when none does. */
    function msFirstImagePage(ms: MsEntry): number {
        return (
            ms.pages?.findIndex((p) => !!p.images?.[0]?.image_url?.trim()) ?? -1
        );
    }

    function msHasImage(ms: MsEntry): boolean {
        return msFirstImagePage(ms) >= 0;
    }

    /** "700 - 800" → 700; undated entries sort to the end. */
    function msEarliestYear(id: number): number {
        const d = msDetails.get(id);
        const raw = d?.carbon_dating?.trim() || d?.date?.trim() || "";
        if (!raw) return Infinity;
        const n = parseInt(raw.split(/[-–]/)[0].trim(), 10);
        return Number.isNaN(n) ? Infinity : n;
    }

    /** Radiocarbon dating when the archive has it, else the catalogue date. */
    function msDateLabel(id: number): string {
        const d = msDetails.get(id);
        if (!d) return "";
        const carbon = d.carbon_dating?.trim();
        if (carbon) return $t("postcard.carbon_date", { date: carbon });
        return d.date?.trim() ?? "";
    }

    /**
     * Oldest first, matching the manuscript viewer — but folios with no scan
     * behind them sink to the bottom, since they cannot serve as a background.
     */
    const msSorted = $derived(
        [...msList].sort((a, b) => {
            const ia = msHasImage(a) ? 0 : 1;
            const ib = msHasImage(b) ? 0 : 1;
            if (ia !== ib) return ia - ib;
            return (
                msEarliestYear(a.manuscript_id) - msEarliestYear(b.manuscript_id)
            );
        }),
    );

    const msSelected = $derived(
        msList.find((m) => m.manuscript_id === msSelectedId) ?? null,
    );
    const msPage = $derived(msSelected?.pages?.[msFolioIdx] ?? null);
    const msImage = $derived(msPage?.images?.[0] ?? null);

    // ── Export state ─────────────────────────────────────────────────────────
    let exporting = $state(false);
    let statusMsg = $state("");
    let tab = $state<"ayahs" | "text" | "background" | "layout">("ayahs");

    let canvasEl = $state<HTMLCanvasElement | null>(null);
    const supportsCanvasFilter = (() => {
        if (typeof document === "undefined") return false;
        const c = document.createElement("canvas").getContext("2d");
        return !!c && ctxSupportsFilter(c);
    })();

    // ── Derived text content ────────────────────────────────────────────────
    const sortedSelection = $derived([...selected].sort((a, b) => a - b));

    /**
     * Stands in for the ayahs a non-contiguous selection skips over, so 1, 3, 5
     * reads as 1 ⋯ 3 ⋯ 5 rather than as one continuous passage.
     */
    const GAP_MARKER = "\u22ef";

    /** Join rendered ayahs, dropping a gap marker wherever the run breaks. */
    function joinWithGaps(
        ayahs: number[],
        render: (n: number) => string,
    ): string {
        const out: string[] = [];
        let prev: number | null = null;
        for (const n of ayahs) {
            const piece = render(n);
            if (!piece) continue;
            if (prev !== null && n !== prev + 1) out.push(GAP_MARKER);
            out.push(piece);
            prev = n;
        }
        return out.join(" ");
    }

    const arabicText = $derived.by(() => {
        if (!morph) return "";
        const byAyah = new Map(morph.ayahs.map((a) => [a.ayah, a]));
        return joinWithGaps(sortedSelection, (n) => {
            const a = byAyah.get(n);
            if (!a) return "";
            const body = a.words.map((w) => w.combined_arabic).join(" ");
            return showAyahNumbers
                ? `${body} ⁠﴿⁠${convertToArabicNumbers(n)}⁠﴾⁠`
                : body;
        });
    });

    const translationText = $derived.by(() => {
        if (!translationOn || translations.size === 0) return "";
        const multi = sortedSelection.length > 1;
        return joinWithGaps(sortedSelection, (n) => {
            const raw = translations.get(n);
            if (!raw) return "";
            const clean = raw.replace(/<[^>]*>/g, "").trim();
            return multi ? `(${n}) ${clean}` : clean;
        });
    });

    const rangeLabel = $derived.by(() => {
        const s = sortedSelection;
        if (s.length === 0) return "";
        if (s.length === 1) return `${s[0]}`;
        const contiguous = s.every((n, i) => i === 0 || n === s[i - 1] + 1);
        return contiguous ? `${s[0]}-${s[s.length - 1]}` : s.join(", ");
    });

    const referenceText = $derived.by(() => {
        if (!refOn || sortedSelection.length === 0) return "";
        const label = $surahLabels[surah - 1];
        const name = refLang === "ar" ? (label?.ar ?? "") : (label?.en ?? "");
        return name
            ? `${name}  ·  ${surah}:${rangeLabel}`
            : `${surah}:${rangeLabel}`;
    });

    const usingManuscript = $derived(
        bgMode === "manuscript" && !!bgImage && !!bgCredit,
    );

    // ── Open / reset ─────────────────────────────────────────────────────────
    let initialized = false;
    $effect(() => {
        if (open && !initialized) {
            initialized = true;
            surah = $selectedSurahIdx;
            defaultsFor = null;
            translatorId = $activeTranslatorId ? String($activeTranslatorId) : "";
            // The editor wants room, but never more than the window has.
            panelW = Math.max(MIN_W, Math.min(1160, window.innerWidth - 48));
            panelH = Math.max(MIN_H, Math.min(820, window.innerHeight - 48));
            x = Math.max(0, (window.innerWidth - panelW) / 2);
            y = Math.max(8, (window.innerHeight - panelH) / 2);
            zIndex = bringToFront();
        }
        if (!open) initialized = false;
    });

    // Load the chosen surah's morphology (shared cache with the Parchment view).
    $effect(() => {
        if (!open) return;
        const s = surah;
        morphLoading = true;
        cachedMorphology(s, () =>
            invoke<SurahMorphology>("get_surah_morphology", { surahNumber: s }),
        )
            .then((data) => {
                if (surah !== s) return;
                morph = data;
            })
            .catch(() => {
                if (surah !== s) return;
                morph = null;
            })
            .finally(() => {
                if (surah === s) morphLoading = false;
            });
    });

    // Seed the selection once per surah: whatever the Parchment view is showing,
    // else the first ayah.
    $effect(() => {
        const data = morph;
        if (!data || defaultsFor === data.surah) return;
        defaultsFor = data.surah;
        const filter = $morphologyAyahFilter;
        const available = new Set(data.ayahs.map((a) => a.ayah));
        const seed =
            data.surah === $selectedSurahIdx && filter && filter.length > 0
                ? filter.filter((n) => available.has(n)).slice(0, 3)
                : [];
        selected = seed.length > 0 ? seed : [data.ayahs[0]?.ayah ?? 1];
        anchorAyah = selected[0];
    });

    $effect(() => {
        const tid = translatorId ? parseInt(translatorId) : null;
        const s = surah;
        if (!tid) {
            translations = new Map();
            return;
        }
        cachedSurahText("translation", s, tid, () =>
            invoke<AyahTranslation[]>("get_surah_translation", {
                surah: s,
                translatorId: tid,
            }),
        )
            .then((rows) => {
                if (surah !== s) return;
                translations = new Map(rows.map((r) => [r.ayah, r.text]));
            })
            .catch(() => {
                translations = new Map();
            });
    });

    function toggleAyah(n: number, shift: boolean) {
        if (shift && anchorAyah > 0) {
            const lo = Math.min(anchorAyah, n);
            const hi = Math.max(anchorAyah, n);
            const range: number[] = [];
            for (let i = lo; i <= hi; i++) range.push(i);
            selected = range;
            return;
        }
        anchorAyah = n;
        selected = selected.includes(n)
            ? selected.filter((v) => v !== n)
            : [...selected, n];
    }

    // ── Manuscript list / image ──────────────────────────────────────────────
    $effect(() => {
        if (!open || bgMode !== "manuscript") return;
        const ayah = sortedSelection[0];
        if (!ayah) return;
        const key = `${surah}:${ayah}`;
        if (msListedFor === key) return;
        msListedFor = key;
        msLoading = true;
        msError = false;
        msList = [];
        msDetails = new Map();
        msDetailFetching = new Set();
        msDetailsPending = 0;
        msUserPicked = false;
        msSelectedId = null;
        msFolioIdx = 0;
        // Drop the previous folio: it belongs to a different ayah, and leaving
        // it on the card would keep crediting a scan that no longer matches.
        msImageReq++;
        bgImage = null;
        bgCredit = "";
        invoke<string>("get_manuscript_list", { surah, ayah })
            .then((raw) => {
                if (msListedFor !== key) return;
                const parsed = JSON.parse(raw) as { data?: MsEntry[] };
                // Imageless entries are kept and flagged rather than dropped —
                // hiding them makes the list look thinner than the archive is.
                msList = Array.isArray(parsed.data) ? parsed.data : [];
            })
            .catch(() => {
                if (msListedFor === key) msError = true;
            })
            .finally(() => {
                if (msListedFor === key) msLoading = false;
            });
    });

    // Dates arrive from a second endpoint, fetched per manuscript in the
    // background so the list can show them without holding up its own render.
    $effect(() => {
        if (msList.length === 0) return;
        for (const ms of msList) {
            const id = ms.manuscript_id;
            if (msDetails.has(id) || msDetailFetching.has(id)) continue;
            msDetailFetching.add(id);
            msDetailsPending++;
            invoke<string>("get_manuscript_detail", { manuscriptId: id })
                .then((raw) => {
                    const detail = JSON.parse(raw).data as MsDetail;
                    msDetails = new Map([...msDetails, [id, detail]]);
                })
                .catch(() => {})
                .finally(() => {
                    msDetailFetching.delete(id);
                    msDetailsPending--;
                });
        }
    });

    // Pre-select the oldest folio that actually has a scan, so switching to
    // Manuscript shows something at once. This waits for the dates to settle:
    // picking earlier would sort by nothing and highlight a row that is not the
    // one at the top of the list the user is looking at.
    $effect(() => {
        if (msUserPicked || msList.length === 0 || msDetailsPending > 0) return;
        const first = msSorted.find(msHasImage);
        if (!first || msSelectedId === first.manuscript_id) return;
        msSelectedId = first.manuscript_id;
        msFolioIdx = Math.max(0, msFirstImagePage(first));
    });

    /**
     * Name the holding archive when the API gives one, and always name Corpus
     * Coranicum — it is the source the scan is served from either way, and some
     * entries credit only a film archive.
     */
    function buildCredit(source: string | undefined): string {
        const src = source?.trim() ?? "";
        if (!src) return "Corpus Coranicum";
        return /corpus\s*coranicum/i.test(src)
            ? src
            : `${src} · Corpus Coranicum`;
    }

    function pickManuscript(ms: MsEntry) {
        msUserPicked = true;
        msSelectedId = ms.manuscript_id;
        msFolioIdx = Math.max(0, msFirstImagePage(ms));
    }

    // Fetch the page scan at full width (dw=1200) — a thumbnail is too soft to
    // carry a 1080px card.
    $effect(() => {
        const img = msImage;
        if (bgMode !== "manuscript" || !img?.image_url?.trim()) return;
        const req = ++msImageReq;
        msImageLoading = true;
        msImageError = false;
        invoke<ArrayBuffer>("get_manuscript_image", {
            imageUrl: img.image_url,
            thumbnail: false,
        })
            .then((bytes) => {
                if (req !== msImageReq) return;
                const url = URL.createObjectURL(
                    new Blob([bytes], { type: "image/jpeg" }),
                );
                objectUrls.push(url);
                const el = new Image();
                el.onload = () => {
                    if (req !== msImageReq) return;
                    bgImage = el;
                    bgCredit = buildCredit(img.image_source);
                    msImageLoading = false;
                    scheduleRender();
                };
                el.onerror = () => {
                    if (req !== msImageReq) return;
                    msImageError = true;
                    msImageLoading = false;
                };
                el.src = url;
            })
            .catch(() => {
                if (req !== msImageReq) return;
                msImageError = true;
                msImageLoading = false;
            });
    });

    // ── Pattern tiles ────────────────────────────────────────────────────────
    const patternCache = new Map<string, HTMLImageElement>();
    let patternImg = $state<HTMLImageElement | null>(null);

    $effect(() => {
        if (bgMode !== "pattern") return;
        const def = PATTERNS.find((p) => p.id === patternId);
        if (!def) {
            patternImg = null;
            return;
        }
        const key = `${patternId}|${patternColor}|${patternStroke}|${patternScale}`;
        const cached = patternCache.get(key);
        if (cached) {
            patternImg = cached;
            return;
        }
        const el = new Image();
        el.onload = () => {
            patternCache.set(key, el);
            patternImg = el;
            scheduleRender();
        };
        el.src = patternDataUrl(def, patternColor, patternStroke, patternScale);
    });

    // ── Rendering ────────────────────────────────────────────────────────────
    let rafId = 0;
    let fontsReady = false;
    let markImage = $state<HTMLImageElement | null>(null);

    if (typeof Image !== "undefined") {
        const mark = new Image();
        mark.onload = () => {
            markImage = mark;
            scheduleRender();
        };
        mark.src = ayahlabMark;
    }

    function scheduleRender() {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
            rafId = 0;
            void draw();
        });
    }

    async function ensureFonts() {
        if (typeof document === "undefined" || !document.fonts) return;
        const specs = [
            fontSpec(arabicSize, arabicFont),
            fontSpec(transSize, transFont),
            fontSpec(refSize, refLang === "ar" ? arabicFont : transFont, "600"),
        ];
        try {
            await Promise.all(specs.map((s) => document.fonts.load(s)));
            fontsReady = true;
        } catch {
            fontsReady = true;
        }
    }

    async function draw() {
        const canvas = canvasEl;
        if (!canvas) return;
        if (!fontsReady) await ensureFonts();
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        if (canvas.width !== cardSize.w) canvas.width = cardSize.w;
        if (canvas.height !== cardSize.h) canvas.height = cardSize.h;

        renderPostcard(ctx, {
            width: cardSize.w,
            height: cardSize.h,
            arabicText,
            translationText,
            referenceText,
            arabicFont,
            arabicSize,
            arabicLine,
            arabicColor,
            transFont,
            transSize,
            transLine,
            transColor,
            refSize,
            refColor,
            refRtl: refLang === "ar",
            textAlign,
            vAlign,
            autoFit,
            shadow: {
                on: shadowOn,
                blur: shadowBlur,
                dx: shadowDx,
                dy: shadowDy,
                color: shadowColor,
                opacity: shadowOpacity,
            },
            padPct,
            borderOn,
            signatureText: "ayahlab.com",
            signatureIcon: markImage,
            creditText: usingManuscript
                ? $t("postcard.credit_line", { source: bgCredit })
                : null,
            baseColor,
            bgMode,
            bgImage,
            bgImageWidth: bgImage?.naturalWidth ?? 0,
            bgImageHeight: bgImage?.naturalHeight ?? 0,
            bgOpacity,
            bgZoom,
            bgOffsetX,
            bgOffsetY,
            bgBlur,
            bgGray,
            patternImage: patternImg,
            patternOpacity,
            gradientStops:
                GRADIENTS.find((g) => g.id === gradientId)?.stops ?? [],
            gradientDir,
            gradientOpacity,
            gradientBlend,
        });
    }

    // Any change to a value the card is drawn from repaints it.
    $effect(() => {
        if (!open) return;
        void [
            canvasEl,
            arabicText,
            translationText,
            referenceText,
            cardSize,
            arabicFont,
            arabicSize,
            arabicLine,
            arabicColor,
            textAlign,
            vAlign,
            autoFit,
            shadowOn,
            shadowBlur,
            shadowDx,
            shadowDy,
            shadowColor,
            shadowOpacity,
            transFont,
            transSize,
            transLine,
            transColor,
            refSize,
            refColor,
            refLang,
            padPct,
            borderOn,
            markImage,
            bgMode,
            baseColor,
            patternImg,
            patternOpacity,
            bgImage,
            bgOpacity,
            bgZoom,
            bgOffsetX,
            bgOffsetY,
            bgBlur,
            bgGray,
            gradientId,
            gradientDir,
            gradientOpacity,
            gradientBlend,
            usingManuscript,
        ];
        scheduleRender();
    });

    // Swapping fonts needs a fresh `document.fonts.load` before the repaint.
    $effect(() => {
        void [arabicFont, transFont];
        fontsReady = false;
        scheduleRender();
    });

    // ── Export ───────────────────────────────────────────────────────────────
    function toBlob(): Promise<Blob | null> {
        return new Promise((resolve) => {
            if (!canvasEl) return resolve(null);
            canvasEl.toBlob((b) => resolve(b), "image/png");
        });
    }

    async function exportPng() {
        if (exporting || !canvasEl) return;
        exporting = true;
        statusMsg = "";
        try {
            await draw();
            const blob = await toBlob();
            if (!blob) throw new Error("render failed");
            const name = `ayahlab-${surah}-${rangeLabel.replace(/[^0-9-]/g, "_")}.png`;
            const path = await saveDialog({
                title: $t("postcard.export"),
                defaultPath: name,
                filters: [{ name: "PNG Image", extensions: ["png"] }],
            });
            if (!path) return;
            await writeFile(path, new Uint8Array(await blob.arrayBuffer()));
            statusMsg = $t("postcard.export_saved");
        } catch (e) {
            statusMsg = $t("postcard.export_failed", {
                error: String(e).slice(0, 60),
            });
        } finally {
            exporting = false;
            setTimeout(() => (statusMsg = ""), 4000);
        }
    }

    async function copyPng() {
        try {
            await draw();
            const blob = await toBlob();
            if (!blob) throw new Error("render failed");
            await navigator.clipboard.write([
                new ClipboardItem({ "image/png": blob }),
            ]);
            statusMsg = $t("postcard.copied");
        } catch {
            statusMsg = $t("postcard.copy_failed");
        }
        setTimeout(() => (statusMsg = ""), 4000);
    }

    // ── Window chrome ────────────────────────────────────────────────────────
    let panelW = $state(1160);
    let panelH = $state(780);
    const MIN_W = 720;
    const MIN_H = 460;
    let x = $state(0);
    let y = $state(0);
    let zIndex = $state(500);
    let isDragging = $state(false);
    let dragStartX = 0,
        dragStartY = 0,
        startX = 0,
        startY = 0;

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
            Math.min(window.innerWidth - panelW, startX + e.clientX - dragStartX),
        );
        y = Math.max(
            0,
            Math.min(window.innerHeight - 60, startY + e.clientY - dragStartY),
        );
    }
    function stopDrag() {
        isDragging = false;
        window.removeEventListener("pointermove", onDrag);
    }

    type ResizeDir = { e: boolean; w: boolean; n: boolean; s: boolean };
    const resizeHandles: Array<{ cls: string; dir: ResizeDir }> = [
        { cls: "resize-n", dir: { n: true, s: false, e: false, w: false } },
        { cls: "resize-s", dir: { n: false, s: true, e: false, w: false } },
        { cls: "resize-e", dir: { n: false, s: false, e: true, w: false } },
        { cls: "resize-w", dir: { n: false, s: false, e: false, w: true } },
        { cls: "resize-ne", dir: { n: true, s: false, e: true, w: false } },
        { cls: "resize-se", dir: { n: false, s: true, e: true, w: false } },
        { cls: "resize-sw", dir: { n: false, s: true, e: false, w: true } },
        { cls: "resize-nw", dir: { n: true, s: false, e: false, w: true } },
    ];
    let resizeDir: ResizeDir = { e: false, w: false, n: false, s: false };
    let resizeStartX = 0,
        resizeStartY = 0,
        resizeStartW = 0,
        resizeStartH = 0,
        resizeStartPanelX = 0,
        resizeStartPanelY = 0;

    function startResize(e: PointerEvent, dir: ResizeDir) {
        e.preventDefault();
        e.stopPropagation();
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
            newH = resizeStartH,
            newX = resizeStartPanelX,
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
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onResize);
    }

    onDestroy(() => {
        if (typeof window !== "undefined") {
            window.removeEventListener("pointermove", onDrag);
            window.removeEventListener("pointermove", onResize);
            if (rafId) cancelAnimationFrame(rafId);
        }
        for (const u of objectUrls) URL.revokeObjectURL(u);
        objectUrls = [];
    });

    const tabs = [
        { id: "ayahs", icon: "solar:book-bookmark-bold-duotone" },
        { id: "text", icon: "solar:text-bold-duotone" },
        { id: "background", icon: "solar:gallery-bold-duotone" },
        { id: "layout", icon: "solar:widget-4-bold-duotone" },
    ] as const;
</script>

{#snippet slider(
    label: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onInput: (v: number) => void,
    suffix = "",
)}
    <div>
        <div class="mb-1 flex items-center justify-between">
            <span class={labelClass + " mb-0"}>{label}</span>
            <span
                class="text-[11px] font-semibold tabular-nums text-brand-charcoal-500 dark:text-[#c6d0f5]"
                >{value}{suffix}</span
            >
        </div>
        <input
            type="range"
            {min}
            {max}
            {step}
            {value}
            oninput={(e) => onInput(Number((e.currentTarget as HTMLInputElement).value))}
            class="pc-range w-full"
        />
    </div>
{/snippet}

{#snippet colorField(label: string, value: string, onPick: (v: string) => void)}
    <div>
        <span class={labelClass}>{label}</span>
        <div
            class="flex items-center gap-2 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/80 dark:bg-[#292c3c] px-2 py-1.5"
        >
            <input
                type="color"
                {value}
                oninput={(e) => onPick((e.currentTarget as HTMLInputElement).value)}
                class="pc-color h-6 w-8 cursor-pointer rounded border-none bg-transparent p-0"
                aria-label={label}
            />
            <span
                class="text-[11px] font-mono uppercase text-brand-charcoal-400 dark:text-[#838ba7]"
                >{value}</span
            >
        </div>
    </div>
{/snippet}

{#snippet toggleRow(label: string, on: boolean, onToggle: () => void)}
    <div class="flex items-center justify-between">
        <span class={labelClass + " mb-0"}>{label}</span>
        <button
            role="switch"
            aria-checked={on}
            aria-label={label}
            onclick={onToggle}
            class="cursor-pointer relative inline-flex h-5 w-9 items-center rounded-full transition-colors {on
                ? 'bg-brand-gold-400'
                : 'bg-brand-charcoal-100 dark:bg-[#51576d]'}"
        >
            <span
                class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform {on
                    ? 'translate-x-4'
                    : 'translate-x-1'}"
            ></span>
        </button>
    </div>
{/snippet}

{#if open}
    <div
        transition:fly={{ y: 8, duration: 180, opacity: 0 }}
        role="dialog"
        aria-modal="false"
        aria-label={$t("postcard.title")}
        tabindex="-1"
        class="fixed flex flex-col rounded-3xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] shadow-xl dark:shadow-black/40 overflow-hidden"
        style="left:{x}px; top:{y}px; width:{panelW}px; height:{panelH}px; z-index:{zIndex};"
        onpointerdown={() => (zIndex = bringToFront())}
    >
        <!-- Header -->
        <div
            class="shrink-0 bg-brand-gold-100 dark:bg-[#292c3c] border-b border-brand-gold-200 dark:border-[#414559] px-5 py-3.5 select-none {isDragging
                ? 'cursor-grabbing'
                : 'cursor-grab'}"
            onpointerdown={startDrag}
            role="banner"
        >
            <div class="flex items-center justify-between">
                <div class="flex items-center gap-2.5 min-w-0">
                    <div
                        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-gold-200 dark:bg-[#414559]"
                    >
                        <Icon
                            icon="solar:gallery-send-bold-duotone"
                            class="text-brand-gold-500 dark:text-[#e5c890]"
                            width="1rem"
                        />
                    </div>
                    <div class="min-w-0">
                        <h2
                            class="text-sm font-semibold text-brand-charcoal-900 dark:text-[#c6d0f5] truncate"
                        >
                            {$t("postcard.title")}
                        </h2>
                        <p
                            class="text-[11px] text-brand-charcoal-300 dark:text-[#838ba7] truncate"
                        >
                            {$surahLabels[surah - 1]?.en ?? ""}
                            {rangeLabel ? `· ${surah}:${rangeLabel}` : ""}
                        </p>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                    {#if statusMsg}
                        <span
                            class="mr-1 max-w-56 truncate text-[11px] font-medium text-brand-gold-600 dark:text-[#e5c890]"
                            >{statusMsg}</span
                        >
                    {/if}
                    <button
                        onclick={copyPng}
                        onpointerdown={(e) => e.stopPropagation()}
                        title={$t("postcard.copy")}
                        aria-label={$t("postcard.copy")}
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                    >
                        <Icon icon="solar:copy-bold-duotone" width="1rem" />
                    </button>
                    <button
                        onclick={exportPng}
                        onpointerdown={(e) => e.stopPropagation()}
                        disabled={exporting || !arabicText}
                        class="cursor-pointer flex items-center gap-1.5 rounded-full bg-brand-gold-400 px-3 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-brand-gold-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Icon
                            icon={exporting
                                ? "svg-spinners:180-ring-with-bg"
                                : "solar:download-minimalistic-bold-duotone"}
                            width="0.85rem"
                        />
                        {$t("postcard.export")}
                    </button>
                    <button
                        onclick={onClose}
                        onpointerdown={(e) => e.stopPropagation()}
                        aria-label={$t("common.close")}
                        class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                    >
                        <Icon
                            icon="solar:close-circle-bold-duotone"
                            width="1rem"
                        />
                    </button>
                </div>
            </div>
        </div>

        <div class="flex min-h-0 flex-1">
            <!-- Preview -->
            <div
                class="flex min-w-0 flex-1 items-center justify-center bg-brand-sand-50 dark:bg-[#232634] p-5"
            >
                {#if arabicText}
                    <canvas
                        bind:this={canvasEl}
                        class="max-h-full max-w-full rounded-xl shadow-2xl shadow-black/25"
                        style="object-fit:contain;"
                    ></canvas>
                {:else}
                    <div
                        class="flex flex-col items-center gap-2 text-center text-brand-charcoal-300 dark:text-[#838ba7]"
                    >
                        <Icon
                            icon="solar:gallery-bold-duotone"
                            width="2rem"
                            class="opacity-50"
                        />
                        <p class="text-xs">
                            {morphLoading
                                ? $t("postcard.loading")
                                : $t("postcard.pick_ayahs")}
                        </p>
                    </div>
                {/if}
            </div>

            <!-- Sidebar -->
            <div
                class="flex w-80 shrink-0 flex-col border-l border-brand-sand-200 dark:border-[#414559]"
            >
                <div
                    class="flex shrink-0 gap-1 border-b border-brand-sand-200 dark:border-[#414559] bg-brand-sand-50/60 dark:bg-[#292c3c] px-2 py-2"
                >
                    {#each tabs as tb}
                        <button
                            onclick={() => (tab = tb.id)}
                            title={$t(`postcard.tab_${tb.id}`)}
                            class="cursor-pointer flex min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[10px] font-semibold tracking-tight transition-colors {tab ===
                            tb.id
                                ? 'bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#e5c890]'
                                : 'text-brand-charcoal-300 dark:text-[#838ba7] hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]'}"
                        >
                            <Icon icon={tb.icon} width="0.85rem" class="shrink-0" />
                            <span class="truncate"
                                >{$t(`postcard.tab_${tb.id}`)}</span
                            >
                        </button>
                    {/each}
                </div>

                <div class="default-scroll flex-1 overflow-y-auto px-4 py-3.5">
                    {#if tab === "ayahs"}
                        <div class="flex flex-col gap-3.5">
                            <div>
                                <label for="pc-surah" class={labelClass}
                                    >{$t("postcard.surah")}</label
                                >
                                <div class="relative">
                                    <select
                                        id="pc-surah"
                                        value={String(surah)}
                                        onchange={(e) => {
                                            surah = parseInt(
                                                (e.currentTarget as HTMLSelectElement).value,
                                            );
                                            selected = [];
                                            msListedFor = "";
                                            bgImage = null;
                                            bgCredit = "";
                                        }}
                                        class={selectClass}
                                    >
                                        {#each $surahLabels as label, i}
                                            <option value={String(i + 1)}
                                                >{i + 1}. {label.ar} — {label.en}</option
                                            >
                                        {/each}
                                    </select>
                                    <span
                                        class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                                    >
                                        <Icon
                                            icon="charm:chevron-down"
                                            width="0.75rem"
                                        />
                                    </span>
                                </div>
                            </div>

                            <div>
                                <div class="mb-1.5 flex items-center justify-between">
                                    <span class={labelClass + " mb-0"}
                                        >{$t("postcard.ayahs")}</span
                                    >
                                    <span
                                        class="text-[10px] text-brand-charcoal-300 dark:text-[#838ba7]"
                                        >{$t("postcard.shift_hint")}</span
                                    >
                                </div>
                                {#if morphLoading}
                                    <p
                                        class="py-4 text-center text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                                    >
                                        {$t("postcard.loading")}
                                    </p>
                                {:else if morph}
                                    <div
                                        class="default-scroll max-h-48 overflow-y-auto rounded-xl border border-brand-sand-200 dark:border-[#414559] p-2"
                                    >
                                        <div class="flex flex-wrap gap-1">
                                            {#each morph.ayahs as a (a.ayah)}
                                                <button
                                                    onclick={(e) =>
                                                        toggleAyah(a.ayah, e.shiftKey)}
                                                    class="{chipClass} {selected.includes(
                                                        a.ayah,
                                                    )
                                                        ? 'border-brand-gold-400 bg-brand-gold-100 dark:bg-[#414559] text-brand-gold-600 dark:text-[#e5c890]'
                                                        : 'border-brand-sand-200 dark:border-[#414559] text-brand-charcoal-400 dark:text-[#838ba7] hover:border-brand-gold-300'}"
                                                    >{a.ayah}</button
                                                >
                                            {/each}
                                        </div>
                                    </div>
                                    <div class="mt-2 flex gap-2">
                                        <button
                                            onclick={() => {
                                                selected = [];
                                                anchorAyah = -1;
                                            }}
                                            class="cursor-pointer flex-1 rounded-full border border-brand-sand-200 dark:border-[#414559] px-3 py-1 text-[11px] font-semibold text-brand-charcoal-400 dark:text-[#838ba7] hover:bg-brand-sand-100 dark:hover:bg-[#363a4f] transition-colors"
                                            >{$t("postcard.clear")}</button
                                        >
                                        <span
                                            class="flex-1 rounded-full bg-brand-sand-100 dark:bg-[#292c3c] px-3 py-1 text-center text-[11px] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5]"
                                            >{$t("postcard.selected_count", {
                                                n: String(selected.length),
                                            })}</span
                                        >
                                    </div>
                                {/if}
                            </div>

                            <div
                                class="border-t border-brand-sand-100 dark:border-[#414559] pt-3"
                            >
                                {@render toggleRow(
                                    $t("postcard.show_translation"),
                                    translationOn,
                                    () => (translationOn = !translationOn),
                                )}
                                {#if translationOn}
                                    <div class="relative mt-2">
                                        <select
                                            bind:value={translatorId}
                                            class={selectClass}
                                        >
                                            <option value=""
                                                >{$t("surah.none")}</option
                                            >
                                            {#each $availableTranslators as tr}
                                                <option value={String(tr.id)}
                                                    >{tr.lang} · {tr.name}</option
                                                >
                                            {/each}
                                        </select>
                                        <span
                                            class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                                        >
                                            <Icon
                                                icon="charm:chevron-down"
                                                width="0.75rem"
                                            />
                                        </span>
                                    </div>
                                {/if}
                            </div>

                            <div
                                class="border-t border-brand-sand-100 dark:border-[#414559] pt-3 flex flex-col gap-3"
                            >
                                {@render toggleRow(
                                    $t("postcard.ayah_numbers"),
                                    showAyahNumbers,
                                    () => (showAyahNumbers = !showAyahNumbers),
                                )}
                                {@render toggleRow(
                                    $t("postcard.show_reference"),
                                    refOn,
                                    () => (refOn = !refOn),
                                )}
                                {#if refOn}
                                    <div class="relative">
                                        <select
                                            bind:value={refLang}
                                            class={selectClass}
                                        >
                                            <option value="en"
                                                >{$t("postcard.ref_en")}</option
                                            >
                                            <option value="ar"
                                                >{$t("postcard.ref_ar")}</option
                                            >
                                        </select>
                                        <span
                                            class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                                        >
                                            <Icon
                                                icon="charm:chevron-down"
                                                width="0.75rem"
                                            />
                                        </span>
                                    </div>
                                {/if}
                            </div>
                        </div>
                    {:else if tab === "text"}
                        <div class="flex flex-col gap-3.5">
                            <div>
                                <label for="pc-afont" class={labelClass}
                                    >{$t("postcard.arabic_font")}</label
                                >
                                <div class="relative">
                                    <select
                                        id="pc-afont"
                                        bind:value={arabicFont}
                                        class={selectClass}
                                    >
                                        {#each ARABIC_FONTS as f}
                                            <option value={f}>{f}</option>
                                        {/each}
                                    </select>
                                    <span
                                        class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                                    >
                                        <Icon
                                            icon="charm:chevron-down"
                                            width="0.75rem"
                                        />
                                    </span>
                                </div>
                            </div>
                            {@render slider(
                                $t("postcard.arabic_size"),
                                arabicSize,
                                28,
                                160,
                                1,
                                (v) => (arabicSize = v),
                                "px",
                            )}
                            {@render slider(
                                $t("postcard.line_spacing"),
                                arabicLine,
                                1.2,
                                3,
                                0.05,
                                (v) => (arabicLine = v),
                                "x",
                            )}
                            {@render colorField(
                                $t("postcard.arabic_color"),
                                arabicColor,
                                (v) => (arabicColor = v),
                            )}

                            <div
                                class="border-t border-brand-sand-100 dark:border-[#414559] pt-3 flex flex-col gap-3"
                            >
                                {@render toggleRow(
                                    $t("postcard.drop_shadow"),
                                    shadowOn,
                                    () => (shadowOn = !shadowOn),
                                )}
                                {#if shadowOn}
                                    {@render slider(
                                        $t("postcard.shadow_blur"),
                                        shadowBlur,
                                        0,
                                        60,
                                        1,
                                        (v) => (shadowBlur = v),
                                        "px",
                                    )}
                                    {@render slider(
                                        $t("postcard.shadow_x"),
                                        shadowDx,
                                        -30,
                                        30,
                                        1,
                                        (v) => (shadowDx = v),
                                        "px",
                                    )}
                                    {@render slider(
                                        $t("postcard.shadow_y"),
                                        shadowDy,
                                        -30,
                                        30,
                                        1,
                                        (v) => (shadowDy = v),
                                        "px",
                                    )}
                                    {@render slider(
                                        $t("postcard.shadow_opacity"),
                                        shadowOpacity,
                                        0,
                                        100,
                                        1,
                                        (v) => (shadowOpacity = v),
                                        "%",
                                    )}
                                    {@render colorField(
                                        $t("postcard.shadow_color"),
                                        shadowColor,
                                        (v) => (shadowColor = v),
                                    )}
                                {/if}
                            </div>

                            <div
                                class="border-t border-brand-sand-100 dark:border-[#414559] pt-3 flex flex-col gap-3"
                            >
                                <span class={labelClass + " mb-0"}
                                    >{$t("postcard.translation_style")}</span
                                >
                                <div class="relative">
                                    <select
                                        bind:value={transFont}
                                        class={selectClass}
                                    >
                                        {#each LATIN_FONTS as f}
                                            <option value={f}>{f}</option>
                                        {/each}
                                    </select>
                                    <span
                                        class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                                    >
                                        <Icon
                                            icon="charm:chevron-down"
                                            width="0.75rem"
                                        />
                                    </span>
                                </div>
                                {@render slider(
                                    $t("postcard.translation_size"),
                                    transSize,
                                    14,
                                    72,
                                    1,
                                    (v) => (transSize = v),
                                    "px",
                                )}
                                {@render slider(
                                    $t("postcard.line_spacing"),
                                    transLine,
                                    1.1,
                                    2.4,
                                    0.05,
                                    (v) => (transLine = v),
                                    "x",
                                )}
                                {@render colorField(
                                    $t("postcard.translation_color"),
                                    transColor,
                                    (v) => (transColor = v),
                                )}
                                {@render slider(
                                    $t("postcard.reference_size"),
                                    refSize,
                                    12,
                                    56,
                                    1,
                                    (v) => (refSize = v),
                                    "px",
                                )}
                                {@render colorField(
                                    $t("postcard.reference_color"),
                                    refColor,
                                    (v) => (refColor = v),
                                )}
                            </div>
                        </div>
                    {:else if tab === "background"}
                        <div class="flex flex-col gap-3.5">
                            <div>
                                <span class={labelClass}
                                    >{$t("postcard.bg_source")}</span
                                >
                                <div class="grid grid-cols-3 gap-1.5">
                                    {#each ["plain", "pattern", "manuscript"] as mode}
                                        <button
                                            onclick={() =>
                                                (bgMode = mode as typeof bgMode)}
                                            class="cursor-pointer rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide transition-colors {bgMode ===
                                            mode
                                                ? 'border-brand-gold-400 bg-brand-gold-100 dark:bg-[#414559] text-brand-gold-600 dark:text-[#e5c890]'
                                                : 'border-brand-sand-200 dark:border-[#414559] text-brand-charcoal-300 dark:text-[#838ba7] hover:border-brand-gold-300'}"
                                            >{$t(`postcard.bg_${mode}`)}</button
                                        >
                                    {/each}
                                </div>
                            </div>

                            {@render colorField(
                                $t("postcard.base_color"),
                                baseColor,
                                (v) => (baseColor = v),
                            )}

                            {#if bgMode === "pattern"}
                                <div>
                                    <span class={labelClass}
                                        >{$t("postcard.pattern")}</span
                                    >
                                    <div class="grid grid-cols-3 gap-1.5">
                                        {#each PATTERNS as p}
                                            <button
                                                onclick={() => (patternId = p.id)}
                                                title={$t(
                                                    `postcard.pattern_${p.id}`,
                                                )}
                                                class="cursor-pointer overflow-hidden rounded-lg border transition-colors {patternId ===
                                                p.id
                                                    ? 'border-brand-gold-400 ring-2 ring-brand-gold-200 dark:ring-[#e5c890]/30'
                                                    : 'border-brand-sand-200 dark:border-[#414559] hover:border-brand-gold-300'}"
                                                aria-label={$t(
                                                    `postcard.pattern_${p.id}`,
                                                )}
                                            >
                                                <span
                                                    class="block h-12 w-full"
                                                    style="background-color:{baseColor}; background-image:url('{patternDataUrl(
                                                        p,
                                                        patternColor,
                                                        p.filled ? 1 : 3,
                                                        0.42,
                                                    )}'); background-repeat:repeat;"
                                                ></span>
                                            </button>
                                        {/each}
                                    </div>
                                </div>
                                {@render colorField(
                                    $t("postcard.pattern_color"),
                                    patternColor,
                                    (v) => (patternColor = v),
                                )}
                                {@render slider(
                                    $t("postcard.opacity"),
                                    patternOpacity,
                                    0,
                                    100,
                                    1,
                                    (v) => (patternOpacity = v),
                                    "%",
                                )}
                                {@render slider(
                                    $t("postcard.pattern_scale"),
                                    patternScale,
                                    0.6,
                                    6,
                                    0.1,
                                    (v) => (patternScale = v),
                                    "x",
                                )}
                                {@render slider(
                                    $t("postcard.pattern_weight"),
                                    patternStroke,
                                    0.5,
                                    8,
                                    0.5,
                                    (v) => (patternStroke = v),
                                    "",
                                )}
                            {/if}

                            {#if bgMode === "manuscript"}
                                <div>
                                    <span class={labelClass}
                                        >{$t("postcard.manuscripts_for", {
                                            ref: `${surah}:${sortedSelection[0] ?? "-"}`,
                                        })}</span
                                    >
                                    {#if msLoading}
                                        <p
                                            class="py-3 text-center text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                                        >
                                            {$t("postcard.loading")}
                                        </p>
                                    {:else if msError}
                                        <p
                                            class="py-3 text-center text-[11px] text-red-500"
                                        >
                                            {$t("postcard.manuscripts_failed")}
                                        </p>
                                    {:else if msList.length === 0}
                                        <p
                                            class="py-3 text-center text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                                        >
                                            {$t("postcard.manuscripts_empty")}
                                        </p>
                                    {:else}
                                        <div
                                            class="default-scroll max-h-52 overflow-y-auto rounded-xl border border-brand-sand-200 dark:border-[#414559]"
                                        >
                                            {#each msSorted as ms (ms.manuscript_id)}
                                                {@const hasImage = msHasImage(ms)}
                                                {@const date = msDateLabel(
                                                    ms.manuscript_id,
                                                )}
                                                <button
                                                    onclick={() =>
                                                        pickManuscript(ms)}
                                                    disabled={!hasImage}
                                                    title={hasImage
                                                        ? ms.title
                                                        : $t("postcard.no_image")}
                                                    class="block w-full border-b border-brand-sand-100 dark:border-[#414559] px-2.5 py-2 text-left text-[11px] transition-colors last:border-b-0 {!hasImage
                                                        ? 'cursor-not-allowed opacity-45 text-brand-charcoal-400 dark:text-[#838ba7]'
                                                        : msSelectedId ===
                                                            ms.manuscript_id
                                                          ? 'cursor-pointer bg-brand-gold-100 dark:bg-[#414559] text-brand-gold-600 dark:text-[#e5c890]'
                                                          : 'cursor-pointer text-brand-charcoal-500 dark:text-[#c6d0f5] hover:bg-brand-sand-100 dark:hover:bg-[#363a4f]'}"
                                                >
                                                    <span
                                                        class="flex items-center gap-1.5"
                                                    >
                                                        {#if !hasImage}
                                                            <Icon
                                                                icon="solar:gallery-remove-bold-duotone"
                                                                width="0.85rem"
                                                                class="shrink-0"
                                                            />
                                                        {/if}
                                                        <span
                                                            class="min-w-0 flex-1 truncate font-semibold"
                                                            >{ms.title}</span
                                                        >
                                                        {#if date}
                                                            <span
                                                                class="shrink-0 rounded-full bg-brand-sand-100 dark:bg-[#292c3c] px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-brand-charcoal-400 dark:text-[#838ba7]"
                                                                >{date}</span
                                                            >
                                                        {/if}
                                                    </span>
                                                    <span
                                                        class="mt-0.5 block truncate text-[10px] text-brand-charcoal-300 dark:text-[#838ba7]"
                                                        >{!hasImage
                                                            ? $t("postcard.no_image")
                                                            : (ms.archive?.name ??
                                                              "")}</span
                                                    >
                                                </button>
                                            {/each}
                                        </div>
                                    {/if}
                                    {#if msSelected && msSelected.pages.length > 1}
                                        <div
                                            class="mt-2 flex items-center justify-between gap-2"
                                        >
                                            <button
                                                onclick={() =>
                                                    (msFolioIdx = Math.max(
                                                        0,
                                                        msFolioIdx - 1,
                                                    ))}
                                                disabled={msFolioIdx === 0}
                                                class="cursor-pointer rounded-full border border-brand-sand-200 dark:border-[#414559] px-2 py-1 text-[11px] disabled:opacity-40"
                                                aria-label={$t("postcard.prev_folio")}
                                                >‹</button
                                            >
                                            <span
                                                class="text-[11px] text-brand-charcoal-400 dark:text-[#838ba7]"
                                                >{$t("postcard.folio", {
                                                    folio: `${msPage?.folio ?? ""}${msPage?.side ?? ""}`,
                                                })}</span
                                            >
                                            <button
                                                onclick={() =>
                                                    (msFolioIdx = Math.min(
                                                        msSelected.pages.length - 1,
                                                        msFolioIdx + 1,
                                                    ))}
                                                disabled={msFolioIdx >=
                                                    msSelected.pages.length - 1}
                                                class="cursor-pointer rounded-full border border-brand-sand-200 dark:border-[#414559] px-2 py-1 text-[11px] disabled:opacity-40"
                                                aria-label={$t("postcard.next_folio")}
                                                >›</button
                                            >
                                        </div>
                                    {/if}
                                    {#if msImageLoading}
                                        <p
                                            class="mt-2 text-center text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                                        >
                                            {$t("postcard.loading_image")}
                                        </p>
                                    {:else if msImageError}
                                        <p
                                            class="mt-2 text-center text-[11px] text-red-500"
                                        >
                                            {$t("postcard.image_failed")}
                                        </p>
                                    {/if}
                                </div>
                                {@render slider(
                                    $t("postcard.opacity"),
                                    bgOpacity,
                                    0,
                                    100,
                                    1,
                                    (v) => (bgOpacity = v),
                                    "%",
                                )}
                                {@render slider(
                                    $t("postcard.zoom"),
                                    bgZoom,
                                    100,
                                    300,
                                    1,
                                    (v) => (bgZoom = v),
                                    "%",
                                )}
                                {@render slider(
                                    $t("postcard.offset_x"),
                                    bgOffsetX,
                                    -50,
                                    50,
                                    1,
                                    (v) => (bgOffsetX = v),
                                    "%",
                                )}
                                {@render slider(
                                    $t("postcard.offset_y"),
                                    bgOffsetY,
                                    -50,
                                    50,
                                    1,
                                    (v) => (bgOffsetY = v),
                                    "%",
                                )}
                                {#if supportsCanvasFilter}
                                    {@render slider(
                                        $t("postcard.blur"),
                                        bgBlur,
                                        0,
                                        30,
                                        1,
                                        (v) => (bgBlur = v),
                                        "px",
                                    )}
                                    {@render toggleRow(
                                        $t("postcard.grayscale"),
                                        bgGray,
                                        () => (bgGray = !bgGray),
                                    )}
                                {/if}
                            {/if}

                            <div
                                class="border-t border-brand-sand-100 dark:border-[#414559] pt-3 flex flex-col gap-3"
                            >
                                <div>
                                    <span class={labelClass}
                                        >{$t("postcard.gradient")}</span
                                    >
                                    <div class="grid grid-cols-4 gap-1.5">
                                        {#each GRADIENTS as g}
                                            <button
                                                onclick={() => (gradientId = g.id)}
                                                title={$t(
                                                    `postcard.gradient_${g.id}`,
                                                )}
                                                aria-label={$t(
                                                    `postcard.gradient_${g.id}`,
                                                )}
                                                class="cursor-pointer h-8 overflow-hidden rounded-lg border transition-colors {gradientId ===
                                                g.id
                                                    ? 'border-brand-gold-400 ring-2 ring-brand-gold-200 dark:ring-[#e5c890]/30'
                                                    : 'border-brand-sand-200 dark:border-[#414559] hover:border-brand-gold-300'}"
                                            >
                                                <span
                                                    class="flex h-full w-full items-center justify-center text-[9px] font-semibold text-brand-charcoal-300"
                                                    style={g.stops.length
                                                        ? `background:linear-gradient(160deg, ${g.stops.join(", ")});`
                                                        : "background:repeating-linear-gradient(45deg,#ddd 0 4px,#fff 4px 8px);"}
                                                    >{g.stops.length ? "" : "—"}</span
                                                >
                                            </button>
                                        {/each}
                                    </div>
                                </div>
                                {#if gradientId !== "none"}
                                    <div class="relative">
                                        <select
                                            bind:value={gradientDir}
                                            class={selectClass}
                                        >
                                            {#each GRADIENT_DIRECTIONS as d}
                                                <option value={d}
                                                    >{$t(`postcard.dir_${d}`)}</option
                                                >
                                            {/each}
                                        </select>
                                        <span
                                            class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                                        >
                                            <Icon
                                                icon="charm:chevron-down"
                                                width="0.75rem"
                                            />
                                        </span>
                                    </div>
                                    <div class="relative">
                                        <select
                                            bind:value={gradientBlend}
                                            class={selectClass}
                                        >
                                            {#each BLEND_MODES as b}
                                                <option value={b}
                                                    >{$t(`postcard.blend_${b}`)}</option
                                                >
                                            {/each}
                                        </select>
                                        <span
                                            class="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-brand-charcoal-300"
                                        >
                                            <Icon
                                                icon="charm:chevron-down"
                                                width="0.75rem"
                                            />
                                        </span>
                                    </div>
                                    {@render slider(
                                        $t("postcard.gradient_opacity"),
                                        gradientOpacity,
                                        0,
                                        100,
                                        1,
                                        (v) => (gradientOpacity = v),
                                        "%",
                                    )}
                                {/if}
                            </div>
                        </div>
                    {:else}
                        <div class="flex flex-col gap-3.5">
                            <div>
                                <span class={labelClass}
                                    >{$t("postcard.canvas_size")}</span
                                >
                                <div class="grid grid-cols-2 gap-1.5">
                                    {#each CARD_SIZES as s}
                                        <button
                                            onclick={() => (sizeId = s.id)}
                                            class="cursor-pointer rounded-lg border px-2 py-1.5 text-[10px] font-semibold transition-colors {sizeId ===
                                            s.id
                                                ? 'border-brand-gold-400 bg-brand-gold-100 dark:bg-[#414559] text-brand-gold-600 dark:text-[#e5c890]'
                                                : 'border-brand-sand-200 dark:border-[#414559] text-brand-charcoal-300 dark:text-[#838ba7] hover:border-brand-gold-300'}"
                                        >
                                            {$t(`postcard.size_${s.id}`)}
                                            <span
                                                class="block text-[9px] font-normal opacity-70"
                                                >{s.w}×{s.h}</span
                                            >
                                        </button>
                                    {/each}
                                </div>
                            </div>

                            <div>
                                <span class={labelClass}
                                    >{$t("postcard.text_align")}</span
                                >
                                <div class="grid grid-cols-3 gap-1.5">
                                    {#each ["right", "center", "left"] as al}
                                        <button
                                            onclick={() =>
                                                (textAlign = al as typeof textAlign)}
                                            class="cursor-pointer rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase transition-colors {textAlign ===
                                            al
                                                ? 'border-brand-gold-400 bg-brand-gold-100 dark:bg-[#414559] text-brand-gold-600 dark:text-[#e5c890]'
                                                : 'border-brand-sand-200 dark:border-[#414559] text-brand-charcoal-300 dark:text-[#838ba7] hover:border-brand-gold-300'}"
                                            >{$t(`postcard.align_${al}`)}</button
                                        >
                                    {/each}
                                </div>
                            </div>

                            {@render slider(
                                $t("postcard.vertical_position"),
                                vAlign,
                                0,
                                100,
                                1,
                                (v) => (vAlign = v),
                                "%",
                            )}
                            {@render slider(
                                $t("postcard.margin"),
                                padPct,
                                3,
                                20,
                                0.5,
                                (v) => (padPct = v),
                                "%",
                            )}
                            {@render toggleRow(
                                $t("postcard.auto_fit"),
                                autoFit,
                                () => (autoFit = !autoFit),
                            )}
                            {@render toggleRow(
                                $t("postcard.border"),
                                borderOn,
                                () => (borderOn = !borderOn),
                            )}
                            <p
                                class="text-[10px] leading-relaxed text-brand-charcoal-300 dark:text-[#838ba7]"
                            >
                                {$t("postcard.signature_note")}
                            </p>
                        </div>
                    {/if}
                </div>
            </div>
        </div>

        {#each resizeHandles as { cls, dir }}
            <div
                aria-hidden="true"
                class="resize-handle {cls}"
                onpointerdown={(e) => startResize(e, dir)}
            ></div>
        {/each}
    </div>
{/if}

<style>
    .resize-handle {
        position: absolute;
        z-index: 10;
    }
    .resize-n { top: 0; left: 6px; right: 6px; height: 6px; cursor: n-resize; }
    .resize-s { bottom: 0; left: 6px; right: 6px; height: 6px; cursor: s-resize; }
    .resize-e { top: 6px; right: 0; bottom: 6px; width: 6px; cursor: e-resize; }
    .resize-w { top: 6px; left: 0; bottom: 6px; width: 6px; cursor: w-resize; }
    .resize-ne { top: 0; right: 0; width: 12px; height: 12px; cursor: ne-resize; }
    .resize-se { bottom: 0; right: 0; width: 20px; height: 20px; cursor: se-resize; }
    .resize-sw { bottom: 0; left: 0; width: 12px; height: 12px; cursor: sw-resize; }
    .resize-nw { top: 0; left: 0; width: 12px; height: 12px; cursor: nw-resize; }
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

    .pc-range {
        appearance: none;
        height: 4px;
        border-radius: 999px;
        background: var(--color-brand-sand-200, #ede2ce);
        outline: none;
    }
    :global(.dark) .pc-range {
        background: #414559;
    }
    .pc-range::-webkit-slider-thumb {
        appearance: none;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--color-brand-gold-400, #c8a96a);
        cursor: pointer;
        border: 2px solid #fff;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
    }
    .pc-color::-webkit-color-swatch-wrapper {
        padding: 0;
    }
    .pc-color::-webkit-color-swatch {
        border: none;
        border-radius: 4px;
    }
</style>
