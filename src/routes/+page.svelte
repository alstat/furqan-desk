<script lang="ts">
    import Parchment from "$lib/components/parchment/Parchment.svelte";
    import SurahWidget from "$lib/components/widgets/surah_ayah/SurahWidget.svelte";
    import AccountWidget from "$lib/components/widgets/account/AccountWidget.svelte";
    import EditorToolbar from "$lib/components/widgets/editor/EditorToolbar.svelte";
    import Sidebar from "$lib/components/sidebar/Sidebar.svelte";
    import NextPrevButton from "$lib/components/parchment/NextPrevButton.svelte";
    import { isSidebar, surahOrientation } from "$lib/stores/quran.svelte";
    import {
        surah,
        surahTranslation,
        selectedSurahName,
        basmallahTrans,
        surahTafsir,
        onLoadPayload,
        enSurahName,
    } from "$lib/stores/quran.svelte";
    import { getContext, onMount, setContext } from "svelte";
    import { fetchSurahList } from "$lib/api/quran_api";
    import { writable } from "svelte/store";

    let height: number = $state(10);

    // onMount(async () => {
    //     try {
    //         const outp = await fetchSurahList();
    //         console.log("here is the output");
    //         console.log(outp);
    //         onLoadPayload.set(outp.payload);
    //         surah.set($onLoadPayload.saved_surah);
    //         surahTranslation.set($onLoadPayload.surah_trans);
    //         selectedSurahName.set($onLoadPayload.ar_labels[0]);
    //         basmallahTrans.set($onLoadPayload.basmallah_trans);
    //         surahTafsir.set($onLoadPayload.surah_tafsir);
    //         enSurahName.set($onLoadPayload.en_labels[0]);
    //     } catch (error) {
    //         console.error(
    //             "Error:",
    //             error instanceof Error
    //                 ? error.message
    //                 : "Cannot fetch surah list.",
    //         );
    //     }
    // });
</script>

<svelte:window bind:innerHeight={height} />
<div class="w-[95%] max-w-375 relative mx-auto p-0 sm:py-6">
    <div
        class={`flex ${$surahOrientation()} ${$isSidebar ? "bg-white shadow-xl" : ""} flex-row justify-center`}
        style:height="{height - 47}px"
    >
        <Parchment />
        <Sidebar />
    </div>
</div>
<SurahWidget />
<EditorToolbar />
