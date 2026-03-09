<script lang="ts">
    import type { MorphWord } from "$lib/types/morphology";
    import Icon from "@iconify/svelte";
    import { buckwalterToArabic } from "$lib/functions/utils/utils";
    import { fly } from "svelte/transition";

    interface Props {
        word: MorphWord;
        position: { x: number; y: number; placement: "above" | "below" };
        onClose: () => void;
    }

    let { word, position, onClose }: Props = $props();

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return { destroy() { node.remove(); } };
    }

    type TokenStyle = {
        bg: string;
        border: string;
        badge: string;
        text: string;
        dot: string;
        accent: string;
    };

    const TOKEN_STYLES: Record<string, TokenStyle> = {
        N:    { bg: "bg-sky-50/60",     border: "border-sky-200",     badge: "bg-sky-100 text-sky-700",       text: "text-sky-700",     dot: "bg-sky-400",     accent: "bg-sky-400"    },
        V:    { bg: "bg-emerald-50/60", border: "border-emerald-200", badge: "bg-emerald-100 text-emerald-700", text: "text-emerald-700", dot: "bg-emerald-400", accent: "bg-emerald-400" },
        P:    { bg: "bg-violet-50/60",  border: "border-violet-200",  badge: "bg-violet-100 text-violet-700",  text: "text-violet-700",  dot: "bg-violet-400",  accent: "bg-violet-400"  },
        PN:   { bg: "bg-indigo-50/60",  border: "border-indigo-200",  badge: "bg-indigo-100 text-indigo-700",  text: "text-indigo-700",  dot: "bg-indigo-400",  accent: "bg-indigo-400"  },
        ADJ:  { bg: "bg-amber-50/60",   border: "border-amber-200",   badge: "bg-amber-100 text-amber-700",    text: "text-amber-700",   dot: "bg-amber-400",   accent: "bg-amber-400"   },
        DET:  { bg: "bg-slate-50/60",   border: "border-slate-200",   badge: "bg-slate-100 text-slate-600",    text: "text-slate-600",   dot: "bg-slate-400",   accent: "bg-slate-300"   },
        PRON: { bg: "bg-rose-50/60",    border: "border-rose-200",    badge: "bg-rose-100 text-rose-700",      text: "text-rose-700",    dot: "bg-rose-400",    accent: "bg-rose-400"    },
        REL:  { bg: "bg-rose-50/60",    border: "border-rose-200",    badge: "bg-rose-100 text-rose-700",      text: "text-rose-700",    dot: "bg-rose-400",    accent: "bg-rose-400"    },
        DEM:  { bg: "bg-rose-50/60",    border: "border-rose-200",    badge: "bg-rose-100 text-rose-700",      text: "text-rose-700",    dot: "bg-rose-400",    accent: "bg-rose-400"    },
        CONJ: { bg: "bg-orange-50/60",  border: "border-orange-200",  badge: "bg-orange-100 text-orange-700",  text: "text-orange-700",  dot: "bg-orange-400",  accent: "bg-orange-400"  },
        NEG:  { bg: "bg-red-50/60",     border: "border-red-200",     badge: "bg-red-100 text-red-700",        text: "text-red-700",     dot: "bg-red-400",     accent: "bg-red-400"     },
    };

    const DEFAULT_STYLE: TokenStyle = {
        bg: "bg-slate-50/60", border: "border-slate-200",
        badge: "bg-slate-100 text-slate-600", text: "text-slate-600",
        dot: "bg-slate-400", accent: "bg-slate-300",
    };

    function getStyle(tag: string): TokenStyle {
        return TOKEN_STYLES[tag] ?? DEFAULT_STYLE;
    }

    const FEATURES: Array<{ key: keyof typeof word.tokens[0]['features']; label: string; arabic?: boolean }> = [
        { key: 'root',        label: 'Root',   arabic: true  },
        { key: 'lemma',       label: 'Lemma',  arabic: true  },
        { key: 'pos',         label: 'POS'                   },
        { key: 'gender',      label: 'Gender'                },
        { key: 'number',      label: 'Number'                },
        { key: 'case_type',   label: 'Case'                  },
        { key: 'person',      label: 'Person'                },
        { key: 'aspect',      label: 'Aspect'                },
        { key: 'voice',       label: 'Voice'                 },
        { key: 'mood',        label: 'Mood'                  },
        { key: 'state',       label: 'State'                 },
        { key: 'derivation',  label: 'Form'                  },
        { key: 'prefix_type', label: 'Prefix'                },
        { key: 'suffix_type', label: 'Suffix'                },
    ];
</script>

<div
    use:portal
    class="ayah-tooltip fixed z-9999 flex w-[22rem] max-h-[76vh] flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white/98 shadow-2xl backdrop-blur-sm"
    style={position.placement === "below"
        ? `left: ${position.x}px; top: ${position.y + 8}px;`
        : `left: ${position.x}px; bottom: calc(100vh - ${position.y}px + 8px);`}
    transition:fly={{ y: position.placement === "below" ? 6 : -6, duration: 160, opacity: 0 }}
>
    <!-- Header -->
    <div class="flex shrink-0 items-center justify-between bg-gradient-to-b from-slate-50 to-white px-4 py-3.5 border-b border-slate-100">
        <div dir="rtl" class="flex flex-col gap-1">
            <span class="font-scheherazade text-3xl leading-none text-slate-800">
                {word.combined_arabic}
            </span>
            <span class="text-[10px] font-medium text-slate-400">
                {word.tokens.length} token{word.tokens.length !== 1 ? 's' : ''}
            </span>
        </div>
        <button
            onclick={onClose}
            class="cursor-pointer flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-600 active:scale-95"
        >
            <Icon icon="mdi:close" width="14" />
        </button>
    </div>

    <!-- Token list -->
    <div class="flex-1 space-y-2.5 overflow-y-auto p-3">
        {#each word.tokens as token}
            {@const s = getStyle(token.tag)}
            <div class="overflow-hidden rounded-xl border {s.border} {s.bg}">

                <!-- Colored accent bar -->
                <div class="h-0.5 w-full {s.accent}"></div>

                <!-- Token header -->
                <div class="flex items-start justify-between px-3 pt-2.5 pb-2">
                    <span class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold {s.badge}">
                        <span class="h-1.5 w-1.5 rounded-full {s.dot}"></span>
                        {token.tag_name}
                    </span>
                    <div class="flex flex-col items-end gap-1" dir="rtl">
                        <span class="font-scheherazade text-2xl leading-none {s.text}">
                            {token.form_arabic}
                        </span>
                        <code class="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500" dir="ltr">
                            {token.form_buckwalter}
                        </code>
                    </div>
                </div>

                <!-- Features -->
                {#if FEATURES.some(f => token.features[f.key])}
                    <div class="divide-y divide-slate-100 border-t {s.border} px-3 pb-0.5">
                        {#each FEATURES as { key, label, arabic }}
                            {#if token.features[key]}
                                <div class="flex items-center justify-between gap-3 py-1.5">
                                    <span class="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                                        {label}
                                    </span>
                                    {#if arabic}
                                        <span class="font-scheherazade text-sm font-medium {s.text}" dir="rtl">
                                            {buckwalterToArabic(token.features[key] as string)}
                                        </span>
                                    {:else}
                                        <span class="text-[11px] font-medium text-slate-600">
                                            {token.features[key]}
                                        </span>
                                    {/if}
                                </div>
                            {/if}
                        {/each}
                    </div>
                {/if}
            </div>
        {/each}
    </div>
</div>
