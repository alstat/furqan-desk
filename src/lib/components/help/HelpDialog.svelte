<script lang="ts">
    import { onDestroy } from 'svelte';
    import Icon from '@iconify/svelte';
    import { openUrl } from '@tauri-apps/plugin-opener';

    interface Props {
        open: boolean;
        onClose: () => void;
    }

    let { open, onClose }: Props = $props();

    const PANEL_W = 620;
    const PANEL_H = 500;

    let x = $state(0);
    let y = $state(0);
    let isDragging = $state(false);
    let dragStartX = 0;
    let dragStartY = 0;
    let startX = 0;
    let startY = 0;
    let initialized = false;

    let activeSection = $state('help-started');
    let contentPane: HTMLElement | null = null;
    let observer: IntersectionObserver | null = null;

    const sections = [
        { id: 'help-started',       label: 'Getting Started' },
        { id: 'help-reader',        label: 'The Quran Reader' },
        { id: 'help-manuscripts',   label: 'Manuscript Viewer' },
        { id: 'help-actions',       label: 'Reader Actions' },
        { id: 'help-recitation',    label: 'Recitation Player' },
        { id: 'help-surah-widget',  label: 'Surah & Translation' },
        { id: 'help-editor',        label: 'The Editor Panel' },
        { id: 'help-lexical',       label: 'Lexical — Rich Text' },
        { id: 'help-typst',         label: 'Typst — Publishing' },
        { id: 'help-julia',         label: 'Julia — Computing' },
        { id: 'help-settings',      label: 'Settings & Tour' },
        { id: 'help-privacy',       label: 'Privacy' },
        { id: 'help-data-sources',  label: 'Data Sources' },
    ];

    $effect(() => {
        if (typeof window === 'undefined') return;
        if (open) {
            if (!initialized) {
                x = Math.max(0, (window.innerWidth - PANEL_W) / 2);
                y = Math.max(0, (window.innerHeight - PANEL_H) / 2);
                initialized = true;
            }
            window.addEventListener('keydown', handleKeydown);
        } else {
            initialized = false;
            window.removeEventListener('keydown', handleKeydown);
        }
        return () => {
            window.removeEventListener('keydown', handleKeydown);
        };
    });

    $effect(() => {
        if (open && contentPane) {
            setupObserver();
        }
        return () => {
            observer?.disconnect();
            observer = null;
        };
    });

    function setupObserver() {
        observer?.disconnect();
        if (!contentPane) return;
        observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        activeSection = entry.target.id;
                        break;
                    }
                }
            },
            { root: contentPane, threshold: 0.3 },
        );
        for (const s of sections) {
            const el = contentPane.querySelector(`#${s.id}`);
            if (el) observer.observe(el);
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') onClose();
    }

    function startDrag(e: PointerEvent) {
        if (typeof window === 'undefined') return;
        isDragging = true;
        dragStartX = e.clientX;
        dragStartY = e.clientY;
        startX = x;
        startY = y;
        window.addEventListener('pointermove', onDrag);
        window.addEventListener('pointerup', stopDrag, { once: true });
    }

    function onDrag(e: PointerEvent) {
        x = Math.max(0, Math.min(window.innerWidth - PANEL_W, startX + (e.clientX - dragStartX)));
        y = Math.max(0, Math.min(window.innerHeight - 60, startY + (e.clientY - dragStartY)));
    }

    function stopDrag() {
        isDragging = false;
        window.removeEventListener('pointermove', onDrag);
    }

    function scrollToSection(id: string) {
        activeSection = id;
        const el = contentPane?.querySelector(`#${id}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    onDestroy(() => {
        if (typeof window !== 'undefined') {
            window.removeEventListener('pointermove', onDrag);
            window.removeEventListener('keydown', handleKeydown);
        }
        observer?.disconnect();
    });
</script>

{#if open}
    <div
        class="fixed z-[500] flex flex-col rounded-2xl shadow-2xl
               bg-white dark:bg-[#303446]
               border border-slate-100 dark:border-[#414559]"
        style="width:{PANEL_W}px; height:{PANEL_H}px; left:{x}px; top:{y}px;"
    >
        <!-- Header / drag handle -->
        <div
            class="flex items-center justify-between px-4 py-3 shrink-0
                   border-b border-slate-100 dark:border-[#414559]
                   select-none rounded-t-2xl
                   {isDragging ? 'cursor-grabbing' : 'cursor-grab'}"
            onpointerdown={startDrag}
            role="banner"
        >
            <div class="flex items-center gap-2">
                <Icon icon="solar:question-circle-bold-duotone" width="1.1rem"
                      class="text-brand-gold-500" />
                <span class="text-sm font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5]">
                    Help & User Guide
                </span>
            </div>
            <button
                onclick={onClose}
                class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-lg bg-brand-gold-200 dark:bg-[#414559] text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-200/80 dark:hover:bg-[#51576d] transition-colors"
                aria-label="Close help"
            >
                <Icon icon="solar:close-circle-bold-duotone" width="1.1rem" />
            </button>
        </div>

        <!-- Body -->
        <div class="flex flex-1 min-h-0">
            <!-- TOC rail -->
            <nav
                class="w-[140px] shrink-0 overflow-y-auto border-r border-slate-100 dark:border-[#414559]
                       py-2 flex flex-col gap-0.5"
                aria-label="Table of contents"
            >
                {#each sections as section (section.id)}
                    <button
                        onclick={() => scrollToSection(section.id)}
                        class="cursor-pointer text-left w-full px-3 py-1.5 text-[11px] font-medium rounded-lg mx-1
                               transition-colors leading-tight
                               {activeSection === section.id
                                   ? 'bg-brand-sand-100 dark:bg-[#363a4f] text-brand-gold-500'
                                   : 'text-brand-charcoal-400 dark:text-[#a5adce] hover:bg-brand-sand-50 dark:hover:bg-[#292c3c]'}"
                        style="width: calc(100% - 8px);"
                    >
                        {section.label}
                    </button>
                {/each}
            </nav>

            <!-- Content pane -->
            <div
                bind:this={contentPane}
                class="flex-1 overflow-y-auto px-5 py-4 text-sm text-brand-charcoal-500 dark:text-[#c6d0f5]"
            >
                <!-- 1. Getting Started -->
                <section id="help-started" class="mb-8">
                    <h2 class="text-base font-bold mb-2 text-brand-charcoal-500 dark:text-[#e5c890]">Getting Started</h2>
                    <p class="mb-2">AyahLab has a two-panel layout: the <strong>Quran Reader</strong> on the left and the <strong>Editor Panel</strong> on the right.</p>
                    <ul class="list-disc pl-4 space-y-1 text-[12.5px]">
                        <li>A <strong>gold chevron button</strong> on the divider collapses or expands the editor panel.</li>
                        <li><strong>Surah Controls</strong> widget floats in the bottom-right corner — click it to expand the control card.</li>
                        <li><strong>Editor Tools</strong> widget floats in the bottom-left corner — click it to access file management and app settings.</li>
                    </ul>
                </section>

                <!-- 2. The Quran Reader -->
                <section id="help-reader" class="mb-8">
                    <h2 class="text-base font-bold mb-2 text-brand-charcoal-500 dark:text-[#e5c890]">The Quran Reader</h2>
                    <p class="mb-2">The reader displays the full Quran with morphological annotations on every word.</p>
                    <ul class="list-disc pl-4 space-y-1 text-[12.5px]">
                        <li>Click any <strong>Arabic word</strong> to open a morphology popup — shows root, part of speech, and grammar details.</li>
                        <li>Use <strong>Prev / Next</strong> buttons at the bottom edge to navigate between surahs.</li>
                        <li>Font size and family are adjustable via the Surah Controls widget.</li>
                    </ul>
                </section>

                <!-- 3. Manuscript Viewer -->
                <section id="help-manuscripts" class="mb-8">
                    <h2 class="text-base font-bold mb-2 text-brand-charcoal-500 dark:text-[#e5c890]">Manuscript Viewer</h2>
                    <p class="mb-2">Browse high-resolution images of early Quranic manuscripts sourced from the <strong>Corpus Coranicum</strong> project (Berlin-Brandenburg Academy of Sciences), covering manuscripts held in archives worldwide.</p>
                    <ul class="list-disc pl-4 space-y-1.5 text-[12.5px]">
                        <li><strong>Opening the viewer</strong> — hover any ayah number in the reader. A small scroll icon (📜) appears next to the play button. Click it to open the Manuscript Viewer for that specific ayah.</li>
                        <li><strong>Manuscript list</strong> — the left rail lists all manuscripts that contain the selected ayah, sorted by estimated date (earliest first). Each entry shows the archive name, city, and date where available.</li>
                        <li><strong>Folio tabs</strong> — when a manuscript has multiple folios covering the ayah, tab buttons appear so you can switch between them.</li>
                        <li><strong>Metadata panel</strong> — below the image, a grid shows available details: estimated date, radiocarbon dating, writing surface (parchment, paper, etc.), script style, physical dimensions, number of folios, call number, and lines per page. An expandable <em>Catalogue entry</em> is shown when available.</li>
                        <li><strong>In-panel zoom</strong> — use the <strong>＋ / −</strong> buttons or scroll the mouse wheel over the image to zoom up to 8×. Drag to pan when zoomed in. A percentage badge shows the current zoom level. Click the reset button (⊡) to return to fit view.</li>
                        <li><strong>Fullscreen</strong> — click the fullscreen icon (⛶) to expand the image to a dark overlay. Click anywhere outside or press <kbd>Escape</kbd> to exit.</li>
                        <li><strong>Download</strong> — click <em>Download full</em> to save a high-resolution version of the current folio to your Downloads folder. A spinner shows progress; a confirmation message confirms the saved filename.</li>
                        <li><strong>Hide/show list</strong> — click the sidebar toggle button in the header to collapse the manuscript list, giving the image more space.</li>
                        <li><strong>Images are cached</strong> — downloaded thumbnails are stored locally so revisiting the same ayah loads instantly without a network request.</li>
                        <li><strong>Clear cache</strong> — go to <em>Settings → Manuscripts → Clear cache</em> to free up disk space.</li>
                        <li><strong>Enable / disable</strong> — the manuscript button on ayah numbers can be toggled off in <em>Settings → Manuscripts</em> if you prefer a cleaner hover state.</li>
                    </ul>
                    <div class="mt-3 rounded-lg bg-brand-sand-50 dark:bg-[#292c3c] border border-brand-sand-200 dark:border-[#414559] px-3 py-2 text-[11.5px] text-brand-charcoal-300 dark:text-[#838ba7]">
                        <span class="font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5]">Data source:</span> Metadata and images are fetched live from the Corpus Coranicum public API (api.corpuscoranicum.de). An internet connection is required for the first load; images are then cached locally.
                    </div>
                </section>

                <!-- 4. Reader Actions -->
                <section id="help-actions" class="mb-8">
                    <h2 class="text-base font-bold mb-2 text-brand-charcoal-500 dark:text-[#e5c890]">Reader Actions</h2>
                    <p class="mb-2">Three action buttons appear above the reader when hovering the top edge:</p>
                    <ul class="list-disc pl-4 space-y-1.5 text-[12.5px]">
                        <li><strong>Bookmark</strong> (bookmark icon) — save any ayah with an optional note; jump back to it anytime from the bookmarks list.</li>
                        <li><strong>Highlight</strong> (magic stick icon) — select Arabic text in the reader, then click "Save Highlight" in the popup.</li>
                        <li><strong>Search</strong> (magnifier icon) — searches Arabic text or translation. A translator must be selected in Surah Controls for translation search to work. Results load as a filtered multi-surah view.</li>
                    </ul>
                </section>

                <!-- 4. Recitation Player -->
                <section id="help-recitation" class="mb-8">
                    <h2 class="text-base font-bold mb-2 text-brand-charcoal-500 dark:text-[#e5c890]">Recitation Player</h2>
                    <p class="mb-2">To enable audio playback, open Surah Controls and pick a reciter (Mishary or Saad Al-Ghamdi). The player appears at the bottom of the reader.</p>
                    <ul class="list-disc pl-4 space-y-1 text-[12.5px]">
                        <li>Tap <strong>play / pause</strong>, or skip forward / back by ayah.</li>
                        <li>Download a surah for offline use via the <strong>download icon</strong>.</li>
                        <li>After a search, the player switches to <strong>playlist mode</strong> — cycling through all matched ayahs automatically.</li>
                    </ul>
                </section>

                <!-- 5. Surah & Translation Controls -->
                <section id="help-surah-widget" class="mb-8">
                    <h2 class="text-base font-bold mb-2 text-brand-charcoal-500 dark:text-[#e5c890]">Surah & Translation Controls</h2>
                    <p class="mb-2">Click the <strong>bottom-right widget</strong> to expand the control card:</p>
                    <ul class="list-disc pl-4 space-y-1 text-[12.5px]">
                        <li><strong>Surah</strong> picker — scrollable list of all 114 surahs.</li>
                        <li><strong>Font</strong> — choose Scheherazade New or Amiri Quran; sizes Small / Medium / Large.</li>
                        <li><strong>Translator</strong> — select from dozens of languages; your choice persists across sessions.</li>
                        <li><strong>WBW</strong> (Word-by-Word) — shows the meaning of each word beneath the Arabic.</li>
                        <li><strong>Transliteration</strong> — shows romanized pronunciation under each word.</li>
                        <li><strong>Hide Reader</strong> toggle — collapses the Quran pane to give the editor full width.</li>
                    </ul>
                </section>

                <!-- 6. The Editor Panel -->
                <section id="help-editor" class="mb-8">
                    <h2 class="text-base font-bold mb-2 text-brand-charcoal-500 dark:text-[#e5c890]">The Editor Panel</h2>
                    <p class="mb-2">A multi-tab workspace. Create tabs via <strong>Editor Tools → New File</strong>, then choose Lexical, Typst, or Julia.</p>
                    <ul class="list-disc pl-4 space-y-1 text-[12.5px]">
                        <li>Tabs are <strong>persistent</strong> — your work is saved automatically.</li>
                        <li>The sidebar collapses with the <strong>gold chevron</strong> button on the divider.</li>
                        <li>Tabs show an <em>italic title</em> in "preview" mode (single-click to open a file). <strong>Double-click</strong> to pin a tab permanently.</li>
                    </ul>
                </section>

                <!-- 7. Lexical -->
                <section id="help-lexical" class="mb-8">
                    <h2 class="text-base font-bold mb-2 text-brand-charcoal-500 dark:text-[#e5c890]">Lexical — Rich Text Notes</h2>
                    <p class="mb-2">A rich text editor for free-form study notes and commentary.</p>
                    <ul class="list-disc pl-4 space-y-1 text-[12.5px]">
                        <li>Supports <strong>headings, bold, italic, bullet lists, numbered lists,</strong> and inline links.</li>
                        <li>Ideal for capturing translations, research notes, or personal commentary alongside the reader.</li>
                    </ul>
                </section>

                <!-- 8. Typst -->
                <section id="help-typst" class="mb-8">
                    <h2 class="text-base font-bold mb-2 text-brand-charcoal-500 dark:text-[#e5c890]">Typst — Professional Publishing</h2>
                    <p class="mb-2">A markup-based typesetting language with <strong>live preview</strong>. Write source in the editor; the rendered document updates in real time.</p>
                    <ul class="list-disc pl-4 space-y-1 text-[12.5px]">
                        <li>Requires the <strong>ilm</strong> package for styled documents — install it via <em>Editor Tools → Typst Packages → Install</em>.</li>
                        <li>Great for structured papers, formatted essays, and printable documents.</li>
                    </ul>
                </section>

                <!-- 9. Julia -->
                <section id="help-julia" class="mb-8">
                    <h2 class="text-base font-bold mb-2 text-brand-charcoal-500 dark:text-[#e5c890]">Julia — Scientific Computing</h2>
                    <p class="mb-2">A full Julia REPL embedded in the editor.</p>
                    <ul class="list-disc pl-4 space-y-1 text-[12.5px]">
                        <li>Install Julia via <em>Editor Tools → Julia → Auto-install</em> (or point to an existing binary).</li>
                        <li>Built-in <strong>AyahLab API</strong> lets Julia control the Quran reader directly:</li>
                    </ul>
                    <div class="mt-2 rounded-lg bg-brand-sand-50 dark:bg-[#292c3c] border border-brand-sand-200 dark:border-[#414559] px-3 py-2 font-mono text-[11.5px] space-y-0.5">
                        <div><span class="text-brand-gold-500">AL.surah(n)</span> <span class="text-brand-charcoal-300 dark:text-[#8caaee]">— navigate reader to surah number n</span></div>
                        <div><span class="text-brand-gold-500">AL.ayah(n)</span> <span class="text-brand-charcoal-300 dark:text-[#8caaee]">— jump to ayah n in the current surah</span></div>
                    </div>
                    <p class="mt-2 text-[12.5px]">Use these to build data-driven analyses that update the reader live as code runs.</p>
                </section>

                <!-- 11. Settings & Tour -->
                <section id="help-settings" class="mb-8">
                    <h2 class="text-base font-bold mb-2 text-brand-charcoal-500 dark:text-[#e5c890]">Settings & Tour</h2>
                    <p class="mb-2">Open <strong>Editor Tools → Settings</strong> to:</p>
                    <ul class="list-disc pl-4 space-y-1 text-[12.5px]">
                        <li>Restart the <strong>onboarding tour</strong> from step 1.</li>
                        <li>Toggle <strong>Light / Dark</strong> mode.</li>
                        <li>Re-open this <strong>Help panel</strong>.</li>
                        <li>Toggle the <strong>Manuscript Viewer</strong> on or off, and clear the local image cache.</li>
                    </ul>
                </section>

                <!-- 12. Privacy -->
                <section id="help-privacy" class="mb-8">
                    <h2 class="text-base font-bold mb-2 text-brand-charcoal-500 dark:text-[#e5c890]">Privacy</h2>
                    <div class="rounded-lg bg-brand-sand-50 dark:bg-[#292c3c] border border-brand-sand-200 dark:border-[#414559] px-4 py-3 flex gap-3 items-start">
                        <Icon icon="solar:shield-check-bold-duotone" class="text-brand-gold-500 shrink-0 mt-0.5" width="1.2rem" />
                        <div class="space-y-1.5 text-[12.5px]">
                            <p class="font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5]">Your data never leaves your device.</p>
                            <p class="text-brand-charcoal-300 dark:text-[#838ba7] leading-relaxed">
                                AyahLab is a fully offline desktop application. There are no accounts, no telemetry, and no analytics of any kind.
                                Your notes, bookmarks, and settings are stored entirely on your local device.
                                The author has absolutely no way to see, access, or collect any of your data.
                            </p>
                            <p class="text-brand-charcoal-300 dark:text-[#838ba7] leading-relaxed">
                                The only network requests the app makes are: fetching manuscript images from the Corpus Coranicum public API (on demand, when you open the Manuscript Viewer), and downloading recitation audio files when you explicitly request them. No personal information is included in these requests.
                            </p>
                        </div>
                    </div>
                </section>

                <!-- 13. Data Sources -->
                <section id="help-data-sources" class="mb-4">
                    <h2 class="text-base font-bold mb-2 text-brand-charcoal-500 dark:text-[#e5c890]">Data Sources</h2>
                    <p class="text-[12.5px] text-brand-charcoal-300 dark:text-[#838ba7] mb-3">AyahLab is built on open, scholarly datasets. All data is bundled locally with the app.</p>
                    <div class="space-y-2">
                        {#each [
                            { icon: 'solar:book-bold-duotone', label: 'Qur\'an Text & Morphology', desc: 'Quranic Arabic Corpus', url: 'https://corpus.quran.com' },
                            { icon: 'solar:translation-bold-duotone', label: 'Translation, Transliteration & Tafsir', desc: 'Tarteel AI — Open Quran Data', url: 'https://qul.tarteel.ai/' },
                            { icon: 'solar:document-text-bold-duotone', label: 'Early Manuscripts', desc: 'Corpus Coranicum, Berlin-Brandenburg Academy of Sciences', url: 'https://corpuscoranicum.de/' },
                        ] as src}
                            <div class="flex items-center justify-between gap-3 rounded-xl border border-brand-sand-200 dark:border-[#414559] bg-white dark:bg-[#303446] px-3.5 py-2.5">
                                <div class="flex items-center gap-2.5 min-w-0">
                                    <Icon icon={src.icon} class="text-brand-gold-400 shrink-0" width="1rem" />
                                    <div class="min-w-0">
                                        <p class="text-[11.5px] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5]">{src.label}</p>
                                        <p class="text-[10.5px] text-brand-charcoal-300 dark:text-[#838ba7] truncate">{src.desc}</p>
                                    </div>
                                </div>
                                <button
                                    onclick={() => openUrl(src.url)}
                                    class="cursor-pointer shrink-0 flex items-center gap-1 rounded-lg bg-brand-gold-200 dark:bg-[#414559] px-2.5 py-1 text-[10.5px] font-semibold text-brand-gold-600 dark:text-[#c6d0f5] hover:bg-brand-gold-300 dark:hover:bg-[#51576d] transition-colors"
                                >
                                    <Icon icon="solar:arrow-right-up-linear" width="0.65rem" />
                                    Visit
                                </button>
                            </div>
                        {/each}
                    </div>
                </section>
            </div>
        </div>
    </div>
{/if}
