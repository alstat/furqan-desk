<!--
  The window's header bar — the GNOME/Ubuntu pattern of folding the toolbar
  into the title bar instead of stacking one under the other.

  Left: the editor action bar (undo/redo, open, export, save-as, find). It only
  appears once the sidebar is open — with the sidebar collapsed there is no
  editor panel beside the parchment for those buttons to act on.
  Centre: the editor tab strip, which scrolls horizontally and fades at
  whichever edge still has tabs behind it. Like the action bar it rides on
  $isSidebar — the flag that zeroes the sidebar panel's width — since tabs for
  an editor nobody can see are just noise. The window title takes its place.
  Right: the Quran action bar (bookmarks, highlights, manuscripts, postcard,
  search).

  The three slots are grid tracks — `1fr | capped | 1fr` — rather than flex
  children, so the centre track sits on the window's midline no matter how wide
  the two side groups are, or whether they are there at all. A flex row would
  centre the strip in whatever space the groups left over, sliding it sideways
  every time the sidebar toggled or Hide Surah Page emptied the right group.
  The side tracks claim their min-content first, so at punishing UI font scales
  the centre track gives up width rather than letting the groups overlap it.

  On macOS the window keeps its native traffic lights via
  `titleBarStyle: "Overlay"` (see tauri.macos.conf.json), so the left group
  starts after the space they occupy. That inset belongs to the left slot, not
  to the header: as header padding it would shift the whole grid — and with it
  the centred strip — off the window's midline.

  Windows and Linux have no equivalent overlay mode, so their windows are
  undecorated instead (see tauri.windows.conf.json / tauri.linux.conf.json) and
  this bar *is* the caption bar: it carries the drag region and the
  minimise/maximise/close buttons at its right end. Leaving Linux decorated
  would stack GNOME's own title bar on top of this one, so the action bars
  would cost a second row of height instead of folding into the first — the
  opposite of the pattern this bar exists to follow. WindowControls draws its
  "gnome" variant there. Dropping GTK's decorations does not cost the window
  its resize edges: tao hit-tests a 5px border itself and calls
  begin_resize_drag whenever the window is undecorated.
-->
<script lang="ts">
    import ActionBar from "$lib/components/lexical/components/actionbar/ActionBar.svelte";
    import EditorTabs from "$lib/components/editor/EditorTabs.svelte";
    import ParchmentActionBar from "$lib/components/parchment/ParchmentActionBar.svelte";
    import WindowControls from "./WindowControls.svelte";
    import { headerBottom, headerHeight } from "$lib/stores/header.store";
    import { zenMode, zenPeek } from "$lib/stores/editor.store";
    import { hideSurahPage, isSidebar } from "$lib/stores/quran.svelte";
    import { activeTab, tabs } from "$lib/stores/tabs.store";

    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isMac = ua.includes("Mac");
    // Windows and Linux run undecorated, so both need drawn controls; they
    // just disagree about what those look like. Android also says "Linux", so
    // rule it out — a phone has no caption buttons to draw.
    const isWindows = ua.includes("Windows");
    const isLinux = ua.includes("Linux") && !ua.includes("Android");

    // The page sizes itself from window.innerHeight rather than from a flex
    // parent, so it needs the height this bar actually took — which moves with
    // the UI font scale.
    let measured = $state(0);
    $effect(() => headerHeight.set(measured));

    // The panels that hang off this bar need its bottom edge in viewport
    // coordinates, which only the rect knows: `clientHeight` leaves out the
    // border and is rounded, and the bar's Y also shifts when the Linux frame
    // takes on (or drops) its shadow margin. Remeasured whenever the bar
    // changes size — the maximise that moves the margin resizes it too — and
    // on any window resize, since a bar that keeps its size can still move.
    let headerEl = $state<HTMLElement | null>(null);

    $effect(() => {
        if (!headerEl) return;
        // Touch `measured` so a font-scale change re-runs this too.
        void measured;
        const publish = () =>
            headerBottom.set(headerEl!.getBoundingClientRect().bottom);
        publish();

        const observer = new ResizeObserver(publish);
        observer.observe(headerEl);
        window.addEventListener("resize", publish);
        return () => {
            observer.disconnect();
            window.removeEventListener("resize", publish);
        };
    });

    const title = $derived($activeTab?.name ?? "AyahLab");
    const dirty = $derived($activeTab?.isDirty ?? false);

    // Zen mode dims every chrome element until it is hovered; the bar keeps its
    // height either way so the page underneath never reflows.
    const zenFade = $derived(
        $zenMode
            ? $zenPeek
                ? "opacity-50 transition-opacity duration-200"
                : "opacity-0 hover:opacity-100 transition-opacity duration-200"
            : "",
    );
</script>

<header
    data-tauri-drag-region
    bind:this={headerEl}
    bind:clientHeight={measured}
    class="relative z-40 grid h-11 shrink-0 select-none grid-cols-[minmax(min-content,1fr)_minmax(0,32rem)_minmax(min-content,1fr)] items-center gap-3 px-2 {$zenMode
        ? 'border-transparent bg-transparent'
        : 'border-b border-brand-sand-200 bg-brand-sand-50/95 dark:bg-[#2b2b2b]/95'} {zenFade}"
>
    <!-- Marked like the other two tracks, and for the same reason: a bare
         `data-tauri-drag-region` drags only when the click lands on *that*
         element (tauri/src/window/scripts/drag.js: `return el ===
         composedPath[0]`), so an unmarked track is dead space no matter that
         the <header> above it is a drag region. This track stretches (1fr)
         while the ActionBar shrinks to its buttons, which left everything from
         the last button to the tab strip unable to move the window. Buttons
         inside still block dragging on their own. -->
    <div
        data-tauri-drag-region
        class="flex min-w-0 items-center"
        style:padding-left={isMac ? "5rem" : undefined}
    >
        {#if $isSidebar}
            <ActionBar variant="header" />
        {/if}
    </div>

    <!-- Capped so a long tab list scrolls inside the track instead of stretching
         across the bar; a short one shrinks the track and stays centred. -->
    <div data-tauri-drag-region class="flex min-w-0 justify-center">
        {#if $isSidebar && $tabs.length}
            <EditorTabs variant="header" />
        {:else}
            <span
                class="truncate px-2 text-xs font-medium text-brand-charcoal-500"
                title={title}
            >
                {title}{dirty ? " •" : ""}
            </span>
        {/if}
    </div>

    <!-- self-stretch overrides the header's items-center for this track only:
         the window buttons need a definite full-row height to hover against. -->
    <div
        data-tauri-drag-region
        class="flex min-w-0 items-center justify-end self-stretch"
    >
        {#if !$hideSurahPage()}
            <ParchmentActionBar variant="header" />
        {/if}
        {#if isWindows || isLinux}
            <WindowControls variant={isLinux ? "gnome" : "windows"} />
        {/if}
    </div>
</header>
