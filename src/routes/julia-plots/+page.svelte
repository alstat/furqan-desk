<!--
  The Julia plot viewer as its own OS window.

  Plots are the one thing a secondary window cannot rebuild for itself: they
  exist only as entries in `juliaPlots`, appended by whichever window is running
  the REPL. So this window mirrors that store over Tauri events — it asks for
  the current list on mount, and both sides publish their changes from then on
  (see julia-plot-window.ts).
-->
<script lang="ts">
    import { onMount } from "svelte";
    import JuliaPlotViewer from "$lib/components/shared/JuliaPlotViewer.svelte";
    import {
        installPlotSync,
        requestPlots,
    } from "$lib/stores/julia-plot-window";

    onMount(() => {
        void installPlotSync().then(requestPlots);
    });
</script>

<svelte:head>
    <title>Plots</title>
</svelte:head>

<JuliaPlotViewer standalone={true} />
