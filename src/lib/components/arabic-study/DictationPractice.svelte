<!-- A reusable "listen & repeat" widget: tap the mic, say the target Arabic
     text, get encouraging (never precise) feedback. Uses the browser's own
     SpeechRecognition API — Tauri's webview exposes it on Windows (WebView2)
     and macOS (WKWebView), not on Linux (WebKitGTK), so this degrades to a
     disabled state with an explanation rather than pretending to listen.
     There is no other "OS-level dictation" capability anywhere in this app
     or in Tauri to fall back to. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";

    interface Props {
        /** The Arabic text the learner is asked to say. */
        target: string;
        /** Short label shown under the mic, e.g. "Tap & recite ب". */
        label: string;
    }
    let { target, label }: Props = $props();

    type SpeechRecognitionCtor = new () => {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        start: () => void;
        stop: () => void;
        onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
        onerror: (() => void) | null;
        onend: (() => void) | null;
    };

    function getRecognitionCtor(): SpeechRecognitionCtor | null {
        if (typeof window === "undefined") return null;
        const w = window as unknown as {
            SpeechRecognition?: SpeechRecognitionCtor;
            webkitSpeechRecognition?: SpeechRecognitionCtor;
        };
        return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
    }

    const supported = getRecognitionCtor() !== null;

    let listening = $state(false);
    let feedback = $state<"ok" | "retry" | null>(null);

    // Loose match only — diacritics/spacing stripped, never a precise grade.
    // Written as explicit \u escapes, not raw combining marks, so the
    // regex is unambiguous and can't hide an invisible bidi/combining
    // character pasted into source.
    const DIACRITICS = /[\u064B-\u065F\u0670\s]/g;
    function normalize(s: string): string {
        return s.replace(DIACRITICS, "").trim();
    }

    function listen() {
        const Ctor = getRecognitionCtor();
        if (!Ctor || listening) return;
        feedback = null;
        const rec = new Ctor();
        rec.lang = "ar";
        rec.interimResults = false;
        rec.maxAlternatives = 3;
        rec.onresult = (e) => {
            const heard = Array.from(e.results[0] ?? [])
                .map((alt) => normalize(alt.transcript))
                .filter(Boolean);
            const wanted = normalize(target);
            feedback = heard.some((h) => h.includes(wanted) || wanted.includes(h)) ? "ok" : "retry";
        };
        rec.onerror = () => {
            listening = false;
        };
        rec.onend = () => {
            listening = false;
        };
        listening = true;
        rec.start();
    }
</script>

<div
    class="flex items-center gap-4 rounded-2xl border border-brand-sand-200 bg-white p-3.5 dark:border-[#414559] dark:bg-[#292c3c]"
>
    <div class="flex shrink-0 flex-col items-center gap-1.5">
        <button
            onclick={listen}
            disabled={!supported}
            aria-label={label}
            class="relative flex h-12 w-12 items-center justify-center rounded-full text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40 {listening
                ? 'bg-red-400'
                : 'bg-brand-gold-400 hover:bg-brand-gold-600 dark:bg-brand-gold-500'}"
        >
            {#if listening}
                <span class="absolute inset-[-6px] animate-ping rounded-full bg-brand-gold-300/50"
                ></span>
            {/if}
            <Icon icon="solar:microphone-bold-duotone" width="1.2rem" />
        </button>
        <span class="text-center text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
            {label}
        </span>
    </div>

    {#if !supported}
        <p class="text-[0.6875rem] leading-relaxed text-brand-charcoal-300 dark:text-[#838ba7]">
            {$t("arabicStudy.dictation.unsupported")}
        </p>
    {:else if feedback === "ok"}
        <div
            class="flex items-center gap-2 rounded-full border border-[#9dd4c8] bg-[#ebf5f3] px-3.5 py-1.5"
        >
            <Icon
                icon="solar:check-circle-bold"
                width="0.9rem"
                class="shrink-0 text-[#1a6b57]"
            />
            <span class="text-[0.6875rem] font-semibold text-[#1a6b57]">
                {$t("arabicStudy.dictation.sounded_right")}
            </span>
        </div>
    {:else if feedback === "retry"}
        <div
            class="flex items-center gap-2 rounded-full border border-brand-sand-200 bg-brand-sand-100 px-3.5 py-1.5 dark:border-[#414559] dark:bg-[#363a4f]"
        >
            <Icon
                icon="solar:refresh-bold"
                width="0.9rem"
                class="shrink-0 text-brand-charcoal-400 dark:text-[#838ba7]"
            />
            <span class="text-[0.6875rem] font-semibold text-brand-charcoal-500 dark:text-[#c6d0f5]">
                {$t("arabicStudy.dictation.try_again")}
            </span>
        </div>
    {:else}
        <p class="text-[0.6875rem] italic text-brand-charcoal-300 dark:text-[#838ba7]">
            {listening
                ? $t("arabicStudy.dictation.listening")
                : $t("arabicStudy.dictation.hint")}
        </p>
    {/if}
</div>
