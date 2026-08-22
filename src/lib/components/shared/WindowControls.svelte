<!--
  Minimise / maximise / close for platforms where the window is undecorated and
  this app draws its own title bar. macOS keeps its native traffic lights
  (`titleBarStyle: "Overlay"`), and Linux keeps its compositor's decorations, so
  only Windows renders these — see tauri.windows.conf.json.

  The glyphs are inline SVG rather than icon-font lookups: they are three
  straight-line shapes, and Windows draws them as hairlines at any DPI.
-->
<script lang="ts">
    import { getCurrentWindow } from "@tauri-apps/api/window";

    let maximized = $state(false);

    // Not every failure here is worth surfacing: outside Tauri (browser dev)
    // the whole module is absent, and the buttons simply do nothing.
    async function withWindow(fn: (w: ReturnType<typeof getCurrentWindow>) => Promise<unknown>) {
        try {
            await fn(getCurrentWindow());
        } catch (e) {
            console.error("window control failed", e);
        }
    }

    $effect(() => {
        let unlisten: (() => void) | undefined;
        void (async () => {
            try {
                const w = getCurrentWindow();
                maximized = await w.isMaximized();
                unlisten = await w.onResized(async () => {
                    maximized = await w.isMaximized();
                });
            } catch {
                /* not running inside Tauri */
            }
        })();
        return () => unlisten?.();
    });

    const minimize = () => withWindow((w) => w.minimize());
    const toggleMaximize = () => withWindow((w) => w.toggleMaximize());
    // close(), not destroy() — this has to run the unsaved-changes prompt that
    // +layout.svelte hangs off onCloseRequested.
    const close = () => withWindow((w) => w.close());

    const btn =
        "flex h-full w-11 shrink-0 cursor-pointer items-center justify-center " +
        "text-brand-charcoal-500 dark:text-[#c6d0f5] transition-colors " +
        "hover:bg-brand-sand-200 dark:hover:bg-[#414559]";
</script>

<!-- -mr-2 cancels the header's px-2 so the strip meets the window corner, the
     way a native caption bar does. -->
<div class="-mr-2 ml-1 flex h-full shrink-0 items-stretch">
    <button onclick={minimize} class={btn} title="Minimize" aria-label="Minimize">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 5h10" stroke="currentColor" stroke-width="1" fill="none" />
        </svg>
    </button>

    <button
        onclick={toggleMaximize}
        class={btn}
        title={maximized ? "Restore Down" : "Maximize"}
        aria-label={maximized ? "Restore Down" : "Maximize"}
    >
        {#if maximized}
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path
                    d="M2.5 0.5h7v7M0.5 2.5h7v7h-7z"
                    stroke="currentColor"
                    stroke-width="1"
                    fill="none"
                />
            </svg>
        {:else}
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect
                    x="0.5"
                    y="0.5"
                    width="9"
                    height="9"
                    stroke="currentColor"
                    stroke-width="1"
                    fill="none"
                />
            </svg>
        {/if}
    </button>

    <button
        onclick={close}
        class="{btn} hover:bg-red-600 hover:text-white dark:hover:bg-red-600 dark:hover:text-white"
        title="Close"
        aria-label="Close"
    >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
            <path d="M0 0l10 10M10 0L0 10" stroke="currentColor" stroke-width="1" fill="none" />
        </svg>
    </button>
</div>
