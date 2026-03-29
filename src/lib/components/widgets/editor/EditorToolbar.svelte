<script lang="ts">
    import { onMount } from "svelte";
    import { invoke } from "@tauri-apps/api/core";
    import { listen } from "@tauri-apps/api/event";
    import { open as openDialog } from "@tauri-apps/plugin-dialog";
    import { openUrl } from "@tauri-apps/plugin-opener";
    import Icon from "@iconify/svelte";
    import ControlCard from "../cards/ControlCard.svelte";
    import GroupCards from "../cards/GroupCards.svelte";
    import {
        typstRecompile,
        editorTheme,
        cmFontSize,
        appDarkMode,
        type EditorTheme,
    } from "$lib/stores/editor.store";
    import { createTab, tabs, activeTabId } from "$lib/stores/tabs.store";
    import { isSidebar, surahOrientation } from "$lib/stores/quran.svelte";
    import { rotateSpring } from "$lib/stores/animation";
    // ── ilm package state ──────────────────────────────────────────────────────
    const ILM_NS = "preview";
    const ILM_NAME = "ilm";
    const ILM_VERSION = "1.4.2";

    // ── diatypst package state ─────────────────────────────────────────────────
    const DIATYPST_NS = "preview";
    const DIATYPST_NAME = "diatypst";
    const DIATYPST_VERSION = "0.9.1";

    type InstallStatus = "unknown" | "installed" | "installing" | "error";

    let installStatus: InstallStatus = $state("unknown");
    let installError = $state("");

    let diatypstStatus: InstallStatus = $state("unknown");
    let diatypstError = $state("");

    // ── Julia install state ────────────────────────────────────────────────────
    let juliaStatus: InstallStatus = $state("unknown");
    let juliaError = $state("");
    let juliaCustomPath = $state(""); // text in the manual-path input
    let juliaPathError = $state(""); // validation error for the manual path

    // ── create new tab ─────────────────────────────────────────────────────────
    let showNewOptions = $state(false);

    function createNew(type: "lexical" | "typst" | "julia") {
        const tab = createTab(type);
        tabs.update((ts) => [...ts, tab]);
        activeTabId.set(tab.id);
        showNewOptions = false;

        // Auto-open the sidebar if it is currently collapsed
        if (!$isSidebar) {
            $isSidebar = true;
            rotateSpring.set(
                $surahOrientation() === "flex-row-reverse" ? 180 : 0,
            );
        }
    }

    async function installJulia() {
        juliaStatus = "installing";
        juliaError = "";
        try {
            await invoke("install_julia");
            // Re-check after install (juliaup may have added julia to PATH)
            const r = await invoke<string>("check_julia");
            juliaStatus = r === "installed" ? "installed" : "error";
            if (juliaStatus === "error")
                juliaError =
                    "Install finished but Julia binary still not found. Try setting the path manually.";
        } catch (e) {
            juliaStatus = "error";
            juliaError = String(e);
        }
    }

    async function browseJuliaPath() {
        const result = await openDialog({
            title: "Select Julia binary",
            multiple: false,
            // On Windows the executable has an .exe extension; on unix no extension
            filters: [{ name: "Executable", extensions: ["exe", "*"] }],
        });
        if (!result || Array.isArray(result)) return;
        juliaCustomPath = result as string;
    }

    async function applyJuliaPath() {
        juliaPathError = "";
        try {
            const r = await invoke<string>("set_julia_path", {
                path: juliaCustomPath,
            });
            juliaStatus = r === "installed" ? "installed" : "error";
        } catch (e) {
            juliaPathError = String(e);
        }
    }

    onMount(async () => {
        const installed = await invoke<boolean>("check_typst_package", {
            namespace: ILM_NS,
            name: ILM_NAME,
            version: ILM_VERSION,
        });
        installStatus = installed ? "installed" : "error";
        if (installed) installError = "";

        const diatypstInstalled = await invoke<boolean>("check_typst_package", {
            namespace: DIATYPST_NS,
            name: DIATYPST_NAME,
            version: DIATYPST_VERSION,
        });
        diatypstStatus = diatypstInstalled ? "installed" : "error";
        if (diatypstInstalled) diatypstError = "";

        // Load any persisted custom Julia path, then check
        juliaCustomPath = await invoke<string>("get_julia_path");
        const juliaResult = await invoke<string>("check_julia");
        juliaStatus = juliaResult === "installed" ? "installed" : "error";

        // Listen for Julia install progress events
        listen<{ message: string }>("julia-install-progress", (event) => {
            juliaError = event.payload.message;
        });
    });

    async function installIlm() {
        installStatus = "installing";
        installError = "";
        try {
            await invoke("install_typst_package", {
                namespace: ILM_NS,
                name: ILM_NAME,
                version: ILM_VERSION,
            });
            installStatus = "installed";
            typstRecompile.update((n: number) => n + 1);
        } catch (e) {
            installStatus = "error";
            installError = String(e);
        }
    }

    async function installDiatypst() {
        diatypstStatus = "installing";
        diatypstError = "";
        try {
            await invoke("install_typst_package", {
                namespace: DIATYPST_NS,
                name: DIATYPST_NAME,
                version: DIATYPST_VERSION,
            });
            diatypstStatus = "installed";
            typstRecompile.update((n: number) => n + 1);
        } catch (e) {
            diatypstStatus = "error";
            diatypstError = String(e);
        }
    }

    const labelClass =
        "mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300";

    let { onOpenSettings = () => {} }: { onOpenSettings?: () => void } =
        $props();
</script>

{#snippet cardBody()}
    <div class="flex flex-col gap-3.5 px-4 py-3">
        <!-- Settings -->
        <div>
            <button
                onclick={onOpenSettings}
                class="cursor-pointer mt-1.5 w-full px-3 py-1 text-[11px] font-semibold rounded-full
					   border border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200
					   text-brand-charcoal-500 transition-colors flex items-center justify-center gap-1.5"
            >
                <Icon icon="solar:settings-bold-duotone" width="0.85rem" />
                Settings
            </button>
        </div>

        <!-- Divider -->
        <div class="border-t border-brand-sand-200"></div>

        <!-- App Theme -->
        <div>
            <span class={labelClass}>App Theme</span>
            <div class="flex gap-2 mt-1.5">
                <button
                    onclick={() => appDarkMode.set(false)}
                    class={`cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors
						${
                            !$appDarkMode
                                ? "bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90"
                                : "border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 text-brand-charcoal-500"
                        }`}
                >
                    Light
                </button>
                <button
                    onclick={() => appDarkMode.set(true)}
                    class={`cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors
						${
                            $appDarkMode
                                ? "bg-[#1a1d2e] text-brand-gold-400 border-[#3e4568]"
                                : "border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 text-brand-charcoal-500"
                        }`}
                >
                    Dark
                </button>
            </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-brand-sand-200"></div>

        <!-- Editor Theme -->
        <div>
            <span class={labelClass}>Editor Theme</span>
            <div class="flex gap-2 mt-1.5">
                <button
                    onclick={() => editorTheme.set("ayu-light")}
                    class={`cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors
						${
                            $editorTheme === "ayu-light"
                                ? "bg-brand-gold-400 text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 active:bg-brand-gold-600/90"
                                : "border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]"
                        }`}
                >
                    Ayu Light
                </button>
                <button
                    onclick={() => editorTheme.set("ayu-mirage")}
                    class={`cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors
						${
                            $editorTheme === "ayu-mirage"
                                ? "bg-[#1f2430] text-[#ffa759] border-[#ffa759]"
                                : "border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200 dark:border-[#414559] dark:bg-[#363a4f] dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#c6d0f5]"
                        }`}
                >
                    Ayu Mirage
                </button>
            </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-brand-sand-200"></div>

        <!-- Code Editor Font Size -->
        <div>
            <span class={labelClass}>Code Editor Font Size</span>
            <div class="flex items-center gap-2 mt-1.5">
                <button
                    onclick={() => cmFontSize.set($cmFontSize - 1)}
                    disabled={$cmFontSize <= 10}
                    class="cursor-pointer w-7 h-7 flex items-center justify-center rounded-full border
						   border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200
						   text-brand-charcoal-500 font-semibold text-sm transition-colors
						   disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Decrease font size">
                    <svg width="10" height="2" viewBox="0 0 10 2" fill="none">
                        <line x1="0" y1="1" x2="10" y2="1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
                <span
                    class="flex-1 text-center text-[12px] font-mono font-semibold text-brand-charcoal-500"
                >
                    {$cmFontSize}px
                </span>
                <button
                    onclick={() => cmFontSize.set($cmFontSize + 1)}
                    disabled={$cmFontSize >= 24}
                    class="cursor-pointer w-7 h-7 flex items-center justify-center rounded-full border
						   border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200
						   text-brand-charcoal-500 font-semibold text-sm transition-colors
						   disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Increase font size">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <line x1="5" y1="0" x2="5" y2="10" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
        </div>

        <!-- Divider -->
        <div class="border-t border-brand-sand-200"></div>

        <!-- Create new file -->
        <div>
            <span class={labelClass}>New File</span>
            {#if showNewOptions}
                <div class="flex gap-2 mt-1.5">
                    <button
                        onclick={() => createNew("lexical")}
                        class="cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full
							   border border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200
							   text-brand-charcoal-500 transition-colors"
                    >
                        Lexical
                    </button>
                    <button
                        onclick={() => createNew("typst")}
                        class="cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full
							   bg-brand-gold-400 hover:bg-brand-gold-500 dark:bg-brand-gold-600 dark:hover:bg-brand-gold-500 dark:text-[#1a1d2e] text-white transition-colors"
                    >
                        Typst
                    </button>
                    {#if juliaStatus === "installed"}
                        <button
                            onclick={() => createNew("julia")}
                            class="cursor-pointer flex-1 px-2.5 py-1 text-[11px] font-semibold rounded-full
							   bg-violet-500 hover:bg-violet-600 dark:bg-violet-800 dark:hover:bg-violet-700 dark:text-violet-200 text-white transition-colors"
                        >
                            Julia
                        </button>
                    {/if}
                </div>
            {:else}
                <button
                    onclick={() => (showNewOptions = true)}
                    class="cursor-pointer mt-1.5 w-full px-3 py-1 text-[11px] font-semibold rounded-full
						   border border-brand-sand-200 bg-brand-sand-100 hover:bg-brand-sand-200
						   text-brand-charcoal-500 transition-colors flex items-center justify-center gap-1.5"
                >
                    <Icon
                        icon="solar:add-circle-bold-duotone"
                        width="0.85rem"
                    />
                    Create New
                </button>
            {/if}
        </div>

        <!-- Divider -->
        <div class="border-t border-brand-sand-200"></div>

        <!-- Typst package installers -->
        <div class="flex flex-col gap-2">
            <span class={labelClass}>Typst Packages</span>

            <!-- ilm -->
            <div class="flex items-center justify-between gap-2">
                <button
                    onclick={() => openUrl("https://github.com/talal/ilm")}
                    class="cursor-pointer text-[11px] font-mono text-brand-charcoal-500 hover:text-brand-gold-500 transition-colors"
                    title="View ilm on GitHub"
                >ilm {ILM_VERSION}</button>

                {#if installStatus === "unknown"}
                    <span class="text-[11px] text-brand-charcoal-300 italic">Checking…</span>
                {:else if installStatus === "installed"}
                    <span class="flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
                        <Icon icon="solar:check-circle-bold" width="0.9rem" />
                        Installed
                    </span>
                {:else if installStatus === "installing"}
                    <span class="flex items-center gap-1 text-[11px] text-brand-charcoal-400 italic">
                        <Icon icon="solar:refresh-bold" width="0.9rem" class="animate-spin" />
                        Installing…
                    </span>
                {:else}
                    <button
                        onclick={installIlm}
                        class="cursor-pointer px-2.5 py-0.5 text-[11px] font-semibold rounded-full
                               bg-brand-gold-400 text-white hover:bg-brand-gold-500 transition-colors"
                    >Install</button>
                {/if}
            </div>
            {#if installError && installStatus === "error"}
                <p class="text-[10px] text-red-500 leading-snug break-all" title={installError}>
                    {installError.slice(0, 120)}{installError.length > 120 ? "…" : ""}
                </p>
            {/if}

            <!-- <div class="h-px bg-brand-sand-200 dark:bg-[#414559]"></div> -->

            <!-- diatypst -->
            <div class="flex items-center justify-between gap-2">
                <button
                    onclick={() => openUrl("https://github.com/skriptum/Diatypst")}
                    class="cursor-pointer text-[11px] font-mono text-brand-charcoal-500 hover:text-brand-gold-500 transition-colors"
                    title="View Diatypst on GitHub"
                >diatypst {DIATYPST_VERSION}</button>

                {#if diatypstStatus === "unknown"}
                    <span class="text-[11px] text-brand-charcoal-300 italic">Checking…</span>
                {:else if diatypstStatus === "installed"}
                    <span class="flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400">
                        <Icon icon="solar:check-circle-bold" width="0.9rem" />
                        Installed
                    </span>
                {:else if diatypstStatus === "installing"}
                    <span class="flex items-center gap-1 text-[11px] text-brand-charcoal-400 italic">
                        <Icon icon="solar:refresh-bold" width="0.9rem" class="animate-spin" />
                        Installing…
                    </span>
                {:else}
                    <button
                        onclick={installDiatypst}
                        class="cursor-pointer px-2.5 py-0.5 text-[11px] font-semibold rounded-full
                               bg-brand-gold-400 text-white hover:bg-brand-gold-500 transition-colors"
                    >Install</button>
                {/if}
            </div>
            {#if diatypstError && diatypstStatus === "error"}
                <p class="text-[10px] text-red-500 leading-snug break-all" title={diatypstError}>
                    {diatypstError.slice(0, 120)}{diatypstError.length > 120 ? "…" : ""}
                </p>
            {/if}
        </div>

        <!-- Divider -->
        <div class="border-t border-brand-sand-200"></div>

        <!-- Julia installer -->
        <div>
            <span class={labelClass}>Julia</span>

            {#if juliaStatus === "unknown"}
                <span class="text-[11px] text-brand-charcoal-300 italic"
                    >Checking…</span
                >
            {:else if juliaStatus === "installed"}
                <span
                    class="flex items-center gap-1 text-[11px] font-medium text-green-600 dark:text-green-400"
                >
                    <Icon icon="solar:check-circle-bold" width="0.9rem" />
                    Installed
                    {#if juliaCustomPath}
                        <span
                            class="text-brand-charcoal-300 font-mono truncate max-w-32"
                            title={juliaCustomPath}
                            >({juliaCustomPath.split(/[\\/]/).pop()})</span
                        >
                    {/if}
                </span>
            {:else if juliaStatus === "installing"}
                <span
                    class="flex flex-col gap-0.5 text-[11px] text-brand-charcoal-400"
                >
                    <span class="flex items-center gap-1 italic">
                        <Icon
                            icon="solar:refresh-bold"
                            width="0.9rem"
                            class="animate-spin"
                        />
                        Installing…
                    </span>
                    {#if juliaError}
                        <span
                            class="text-[10px] text-brand-charcoal-300 italic break-all"
                            >{juliaError}</span
                        >
                    {/if}
                </span>
            {:else}
                <!-- Not found — offer auto-install AND manual path -->
                <div class="flex flex-col gap-2 mt-0.5">
                    <!-- Auto-install row -->
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-[11px] text-brand-charcoal-500 dark:text-[#838ba7]"
                            >Auto-install</span
                        >
                        <button
                            onclick={installJulia}
                            class="cursor-pointer px-2.5 py-0.5 text-[11px] font-semibold rounded-full
								   bg-brand-gold-400 dark:bg-brand-gold-400 text-white hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 transition-colors"
                        >
                            Install
                        </button>
                    </div>

                    <!-- Manual path row -->
                    <div class="flex flex-col gap-1">
                        <span class="text-[11px] text-brand-charcoal-500 dark:text-[#838ba7]"
                            >Or set path manually</span
                        >
                        <div class="flex items-center gap-1">
                            <input
                                bind:value={juliaCustomPath}
                                placeholder="/usr/local/bin/julia"
                                class="flex-1 min-w-0 px-2 py-1 text-[10px] font-mono rounded-xl border border-brand-sand-200 dark:border-[#414559]
									   bg-brand-sand-100 dark:bg-[#1e2030] text-brand-charcoal-900 dark:text-[#c6d0f5]
									   placeholder-brand-charcoal-300 dark:placeholder-[#626880]
									   focus:outline-none focus:ring-2 focus:ring-brand-gold-100 dark:focus:ring-brand-gold-900/30 focus:border-brand-gold-400 transition-colors"
                                spellcheck="false"
                            />
                            <button
                                onclick={browseJuliaPath}
                                title="Browse for julia binary"
                                class="cursor-pointer shrink-0 p-1 rounded-full border border-brand-sand-200 dark:border-[#414559]
									   bg-brand-sand-100 dark:bg-[#292c3c] hover:bg-brand-sand-200 dark:hover:bg-[#414559] text-brand-charcoal-500 dark:text-[#838ba7]
									   transition-colors"
                            >
                                <Icon
                                    icon="solar:folder-open-bold-duotone"
                                    width="0.85rem"
                                />
                            </button>
                            <button
                                onclick={applyJuliaPath}
                                title="Apply this path"
                                class="cursor-pointer shrink-0 px-2 py-0.5 text-[11px] font-semibold rounded-full
									   bg-brand-gold-400 dark:bg-brand-gold-400 text-white hover:bg-brand-gold-600 dark:hover:bg-brand-gold-500 transition-colors"
                            >
                                Use
                            </button>
                        </div>
                        {#if juliaPathError}
                            <p
                                class="text-[10px] text-red-500 leading-snug break-all"
                            >
                                {juliaPathError}
                            </p>
                        {/if}
                    </div>
                </div>

                {#if juliaError}
                    <p
                        class="mt-1 text-[10px] text-red-500 leading-snug break-all"
                        title={juliaError}
                    >
                        {juliaError.slice(0, 160)}{juliaError.length > 160
                            ? "…"
                            : ""}
                    </p>
                {/if}
            {/if}
        </div>
    </div>
{/snippet}

{#snippet collapsedIcon()}
    <Icon icon="solar:menu-dots-line-duotone" width="2em" />
{/snippet}

{#snippet controlCard()}
    <ControlCard cardTitle={"App Controls"} {cardBody} />
{/snippet}

<GroupCards
    {controlCard}
    {collapsedIcon}
    xPosition={"left"}
    id="tour-editor-toolbar"
/>
