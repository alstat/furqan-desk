<!--
  Lean Infoview — the panel that shows what the compiler said about the buffer.

  This is the app's analogue of the Lean 4 VS Code extension's infoview: the
  elaborator's messages for the file, grouped by severity, each anchored to a
  source position you can click to jump to. Because `#eval` and `#check` report
  their results as `information` diagnostics, the panel doubles as the output
  window for evaluated terms — which is why the info section is expanded by
  default while warnings are not.
-->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import {
        sortDiagnostics,
        countBySeverity,
        leanLiveCompile,
        type LeanRuntime,
        type LeanDiagnostic,
        type LeanSeverity,
    } from "$lib/stores/lean-compiler.store";

    let {
        runtime,
        /** Current buffer text, read when the user presses Compile. */
        getCode,
        /** Jump the editor's caret to a diagnostic's position. */
        onJump = undefined,
        /** Hide the live-compilation toggle (cells drive it from their header). */
        showLiveToggle = true,
    }: {
        runtime: LeanRuntime;
        getCode: () => string;
        onJump?: (line: number, column: number) => void;
        showLiveToggle?: boolean;
    } = $props();

    const { diagnostics, raw, status, elapsedMs, errorMessage, lastCompiledAt } =
        runtime;

    let sorted = $derived(sortDiagnostics($diagnostics));
    let counts = $derived(countBySeverity($diagnostics));
    let isCompiling = $derived($status === "compiling");

    // Severity filter. All three start on; clicking a count chip narrows the
    // list, which is how you read a file that reports fifty `#eval` results
    // alongside one error.
    let show = $state<Record<LeanSeverity, boolean>>({
        error: true,
        warning: true,
        information: true,
    });

    let visible = $derived(sorted.filter((d) => show[d.severity]));

    const SEVERITY_STYLE: Record<
        LeanSeverity,
        { icon: string; label: string; text: string; bg: string; border: string }
    > = {
        error: {
            icon: "lucide:x-circle",
            label: "lean_infoview.error",
            text: "text-red-600 dark:text-red-400",
            bg: "bg-red-50/80 dark:bg-red-900/15",
            border: "border-red-200/80 dark:border-red-700/40",
        },
        warning: {
            icon: "lucide:alert-triangle",
            label: "lean_infoview.warning",
            text: "text-amber-600 dark:text-amber-400",
            bg: "bg-amber-50/80 dark:bg-amber-900/15",
            border: "border-amber-200/80 dark:border-amber-700/40",
        },
        information: {
            icon: "lucide:info",
            label: "lean_infoview.information",
            text: "text-sky-600 dark:text-sky-400",
            bg: "bg-sky-50/80 dark:bg-sky-900/15",
            border: "border-sky-200/80 dark:border-sky-700/40",
        },
    };

    async function compileNow() {
        await runtime.compile(getCode());
    }

    function toggleFilter(severity: LeanSeverity) {
        show = { ...show, [severity]: !show[severity] };
    }

    // Lean reports 1-based lines and 0-based columns; the editor's gutter shows
    // 1-based columns, so present them the way the editor does.
    function positionLabel(d: LeanDiagnostic): string {
        return `${d.line}:${d.column + 1}`;
    }

    function formatElapsed(ms: number): string {
        return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
    }
</script>

<div class="flex h-full min-h-0 flex-col">
    <!-- Header: title, status, controls -->
    <div
        class="flex shrink-0 items-center justify-between gap-2 border-b border-brand-sand-200 dark:border-[#414559] px-4 py-1"
    >
        <span class="flex min-w-0 items-center gap-1.5">
            <span
                class="text-[11px] font-semibold uppercase tracking-wide text-brand-charcoal-300 dark:text-[#838ba7]"
            >
                {$t("lean_infoview.title")}
            </span>

            {#if $status === "ok"}
                <span
                    class="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400"
                >
                    <Icon icon="lucide:check" width="0.7rem" />
                    {$t("lean_infoview.no_errors")}
                </span>
            {/if}
        </span>

        <span class="flex shrink-0 items-center gap-1.5">
            <!-- Severity filter chips — also the message counts -->
            {#each ["error", "warning", "information"] as const as severity (severity)}
                {@const n =
                    severity === "error"
                        ? counts.errors
                        : severity === "warning"
                          ? counts.warnings
                          : counts.infos}
                {#if n > 0}
                    <button
                        onclick={() => toggleFilter(severity)}
                        aria-pressed={show[severity]}
                        title={$t(
                            show[severity]
                                ? "lean_infoview.hide_severity"
                                : "lean_infoview.show_severity",
                        )}
                        class="flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] transition-colors
                               {SEVERITY_STYLE[severity].border} {show[severity]
                            ? `${SEVERITY_STYLE[severity].bg} ${SEVERITY_STYLE[severity].text}`
                            : 'bg-transparent text-brand-charcoal-300 dark:text-[#626880] opacity-60'}"
                    >
                        <Icon
                            icon={SEVERITY_STYLE[severity].icon}
                            width="0.6rem"
                        />
                        {n}
                    </button>
                {/if}
            {/each}

            {#if showLiveToggle}
                <!-- Live compilation: recompile on a pause in typing -->
                <button
                    onclick={() => leanLiveCompile.set(!$leanLiveCompile)}
                    aria-pressed={$leanLiveCompile}
                    title={$t(
                        $leanLiveCompile
                            ? "lean_infoview.live_on_hint"
                            : "lean_infoview.live_off_hint",
                    )}
                    class="flex cursor-pointer items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors
                       {$leanLiveCompile
                        ? 'bg-brand-gold-100 dark:bg-brand-gold-400/15 text-brand-gold-600 dark:text-brand-gold-400 hover:bg-brand-gold-200 dark:hover:bg-brand-gold-400/25'
                        : 'bg-brand-sand-200 dark:bg-[#414559] text-brand-charcoal-500 dark:text-[#838ba7] hover:bg-brand-sand-400 dark:hover:bg-[#51566a]'}"
                >
                    <Icon
                        icon={$leanLiveCompile ? "lucide:zap" : "lucide:zap-off"}
                        width="11"
                    />
                    {$leanLiveCompile
                        ? $t("lean_infoview.live")
                        : $t("lean_infoview.manual")}
                </button>
            {/if}

            <!-- Compile now -->
            <button
                onclick={compileNow}
                disabled={isCompiling}
                title="{$t('lean_infoview.compile')} (Ctrl/Cmd+Enter)"
                class="flex cursor-pointer items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors
                       bg-brand-gold-100 dark:bg-brand-gold-400/15 text-brand-gold-600 dark:text-brand-gold-400
                       hover:bg-brand-gold-200 dark:hover:bg-brand-gold-400/25
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Icon
                    icon={isCompiling
                        ? "svg-spinners:180-ring"
                        : "solar:play-bold"}
                    width="11"
                />
                {isCompiling
                    ? $t("lean_infoview.compiling")
                    : $t("lean_infoview.compile")}
            </button>
        </span>
    </div>

    <!-- Body -->
    <div class="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {#if $status === "unavailable" && $errorMessage}
            <div
                role="alert"
                class="flex items-start gap-2 rounded-md border border-amber-200/80 bg-amber-50/90 px-2.5 py-2 dark:border-amber-700/40 dark:bg-amber-900/15"
            >
                <Icon
                    icon="lucide:plug-zap"
                    width="0.8rem"
                    class="mt-[2px] shrink-0 text-amber-600 dark:text-amber-300"
                />
                <div class="min-w-0 flex-1">
                    <div
                        class="text-[11px] font-semibold text-amber-800 dark:text-amber-200"
                    >
                        {$t("lean_infoview.unavailable")}
                    </div>
                    <div
                        class="mt-1 font-mono text-[10.5px] break-words text-amber-700/90 dark:text-amber-300/90"
                    >
                        {$errorMessage}
                    </div>
                </div>
            </div>
        {:else if $lastCompiledAt === 0 && !isCompiling}
            <div
                class="flex h-full flex-col items-center justify-center gap-1.5 py-6 text-center"
            >
                <Icon
                    icon="solar:documents-minimalistic-bold-duotone"
                    width="1.4rem"
                    class="text-brand-charcoal-200 dark:text-[#51576d]"
                />
                <p
                    class="text-[11px] font-medium text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    {$t("lean_infoview.empty_title")}
                </p>
                <p
                    class="max-w-[22rem] text-[10px] text-brand-charcoal-200 dark:text-[#626880]"
                >
                    {$t("lean_infoview.empty_desc")}
                </p>
            </div>
        {:else}
            {#if $raw}
                <pre
                    class="mb-1.5 m-0 whitespace-pre-wrap break-words rounded-md border border-brand-sand-200 bg-brand-sand-50 px-2 py-1.5 font-mono text-[11px] leading-tight text-brand-charcoal-700 dark:border-[#414559] dark:bg-[#232634] dark:text-[#c6d0f5]">{$raw}</pre>
            {/if}

            {#each visible as diag, i (`${diag.severity}-${diag.line}-${diag.column}-${i}`)}
                {@const style = SEVERITY_STYLE[diag.severity]}
                <div
                    class="mb-1 flex items-start gap-2 rounded-md border px-2 py-1.5 {style.bg} {style.border}"
                >
                    <Icon
                        icon={style.icon}
                        width="0.75rem"
                        class="mt-[3px] shrink-0 {style.text}"
                    />
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5">
                            <span
                                class="text-[10px] font-semibold uppercase tracking-wide {style.text}"
                            >
                                {$t(style.label)}
                            </span>
                            {#if onJump}
                                <button
                                    onclick={() =>
                                        onJump?.(diag.line, diag.column)}
                                    title={$t("lean_infoview.jump_to")}
                                    class="cursor-pointer rounded px-1 font-mono text-[10px] text-brand-charcoal-400 transition-colors hover:bg-black/5 hover:text-brand-charcoal-700 dark:text-[#838ba7] dark:hover:bg-white/10 dark:hover:text-[#c6d0f5]"
                                >
                                    {positionLabel(diag)}
                                </button>
                            {:else}
                                <span
                                    class="font-mono text-[10px] text-brand-charcoal-400 dark:text-[#838ba7]"
                                >
                                    {positionLabel(diag)}
                                </span>
                            {/if}
                        </div>
                        <pre
                            class="m-0 mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] leading-tight text-brand-charcoal-800 dark:text-[#c6d0f5]">{diag.message}</pre>
                    </div>
                </div>
            {/each}

            {#if visible.length === 0 && !$raw && !isCompiling}
                <div
                    class="flex items-center gap-1.5 py-3 text-[11px] text-brand-charcoal-300 dark:text-[#838ba7]"
                >
                    <Icon
                        icon="lucide:check-circle-2"
                        width="0.8rem"
                        class="text-green-600 dark:text-green-400"
                    />
                    {#if $diagnostics.length > 0}
                        {$t("lean_infoview.all_filtered")}
                    {:else}
                        {$t("lean_infoview.compiled_clean")}
                    {/if}
                </div>
            {/if}
        {/if}
    </div>

    <!-- Status line -->
    {#if $lastCompiledAt > 0}
        <div
            class="flex shrink-0 items-center justify-between border-t border-brand-sand-200 px-4 py-0.5 font-mono text-[9.5px] text-brand-charcoal-300 dark:border-[#414559] dark:text-[#626880]"
        >
            <span>
                {$t("lean_infoview.messages_count", {
                    count: String($diagnostics.length),
                })}
            </span>
            <span>{formatElapsed($elapsedMs)}</span>
        </div>
    {/if}
</div>
