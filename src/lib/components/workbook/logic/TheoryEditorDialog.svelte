<!-- The Theory editor: where a proof's source of truth is authored.
     
     A Theory is *accepted*, not proved. Nothing in this dialog verifies that an
     axiom is true — Lean will confirm the declarations are well-formed and
     nothing more. So the trust panel is not an afterthought here: it is the
     part that tells the author exactly what they are choosing to take on faith,
     and it stays visible while they edit.
     
     Saving publishes an immutable revision. Editing an axiom mints revision
     n+1 and leaves every proof that pinned revision n marked stale rather than
     silently re-interpreting it. -->
<script lang="ts">
    import Icon from "@iconify/svelte";
    import { t } from "$lib/i18n";
    import {
        declarationText,
        elaborateTheory,
        emptyTheory,
        publishRevision,
        theoryContentHash,
        type LogicTheory,
        type TrustedDeclaration,
        type VocabularyDeclaration,
        type VocabularyKind,
    } from "$lib/stores/logic/theory";

    interface Props {
        open: boolean;
        theory: LogicTheory | null;
        onClose: () => void;
        /** Hands back a published revision — the caller stores it on the document. */
        onPublish: (theory: LogicTheory) => void;
    }

    let { open, theory, onClose, onPublish }: Props = $props();

    // Edited as a local copy so a half-finished edit never becomes the pinned
    // revision; only Publish commits. Seeded empty and filled by the effect
    // below when the dialog opens — the dialog renders nothing while closed,
    // so there is no window in which this placeholder is visible.
    let draft = $state<LogicTheory>(emptyTheory());
    let lastLoaded = "";

    $effect(() => {
        const incoming = theory ? `${theory.id}@${theory.revision}` : "none";
        if (open && incoming !== lastLoaded) {
            lastLoaded = incoming;
            draft = theory ? structuredClone($state.snapshot(theory)) : emptyTheory();
        }
    });

    const elaboration = $derived(elaborateTheory(draft));
    const dirty = $derived(!theory || theoryContentHash(draft) !== theory.contentHash);

    const problemsFor = (id: string) => elaboration.problems.filter((p) => p.subjectId === id);

    const VOCAB_KINDS: { kind: VocabularyKind; labelKey: string; signature: string }[] = [
        { kind: "type", labelKey: "logic.vocab.type", signature: "" },
        { kind: "entity", labelKey: "logic.vocab.entity", signature: "Act" },
        { kind: "predicate", labelKey: "logic.vocab.predicate", signature: "Act → Prop" },
        { kind: "function", labelKey: "logic.vocab.function", signature: "Act → Act" },
    ];

    function addVocab(kind: VocabularyKind, signature: string) {
        draft.vocabulary = [
            ...draft.vocabulary,
            { id: crypto.randomUUID(), kind, name: "", signature: signature || undefined },
        ];
    }

    function addDeclaration(kind: TrustedDeclaration["kind"]) {
        draft.trustedDeclarations = [
            ...draft.trustedDeclarations,
            { id: crypto.randomUUID(), kind, name: "", binders: [], source: "", resultType: kind === "definition" ? "Prop" : undefined },
        ];
    }

    function removeVocab(id: string) {
        draft.vocabulary = draft.vocabulary.filter((v) => v.id !== id);
    }

    function removeDeclaration(id: string) {
        draft.trustedDeclarations = draft.trustedDeclarations.filter((d) => d.id !== id);
    }

    function patchVocab(id: string, patch: Partial<VocabularyDeclaration>) {
        draft.vocabulary = draft.vocabulary.map((v) => (v.id === id ? { ...v, ...patch } : v));
    }

    function patchDecl(id: string, patch: Partial<TrustedDeclaration>) {
        draft.trustedDeclarations = draft.trustedDeclarations.map((d) => (d.id === id ? { ...d, ...patch } : d));
    }

    /** Binders are typed as `a : Act, b : Person` — one line, parsed on the way in. */
    function bindersText(decl: TrustedDeclaration): string {
        return decl.binders.map((b) => (b.type ? `${b.name} : ${b.type}` : b.name)).join(", ");
    }

    function setBinders(id: string, text: string) {
        const binders = text
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => {
                const [name, type] = part.split(":").map((s) => s.trim());
                return { name, type: type || undefined };
            })
            .filter((b) => !!b.name);
        patchDecl(id, { binders });
    }

    function publish() {
        const next = publishRevision(theory ?? { ...draft, revision: 0, contentHash: "" }, draft);
        onPublish(next);
        onClose();
    }
</script>

{#if open}
    <div class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-6">
        <div
            class="flex h-full max-h-[46rem] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#303446]"
        >
            <header class="flex shrink-0 items-center gap-3 border-b border-brand-sand-200 px-5 py-3 dark:border-[#414559]">
                <Icon icon="solar:library-bold-duotone" width="1.2rem" class="text-brand-gold-500" />
                <input
                    bind:value={draft.name}
                    class="flex-1 rounded-lg bg-transparent px-1 py-0.5 text-sm font-semibold text-brand-charcoal-700 outline-none dark:text-[#c6d0f5]"
                />
                <span class="text-[0.7rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                    {$t("logic.theory.revision")} {draft.revision}{dirty ? " *" : ""}
                </span>
                <button
                    onclick={onClose}
                    aria-label={$t("common.close")}
                    class="cursor-pointer rounded-lg p-1 text-brand-charcoal-400 hover:bg-brand-sand-100 dark:hover:bg-[#414559]"
                >
                    <Icon icon="solar:close-circle-bold-duotone" width="1.1rem" />
                </button>
            </header>

            <div class="flex min-h-0 flex-1">
                <div class="min-h-0 flex-1 overflow-auto px-5 py-4">
                    <!-- Vocabulary -->
                    <h3 class="text-[0.7rem] font-bold uppercase tracking-wide text-brand-charcoal-400 dark:text-[#838ba7]">
                        {$t("logic.theory.vocabulary")}
                    </h3>
                    <div class="mt-1.5 flex flex-wrap gap-1.5">
                        {#each VOCAB_KINDS as v (v.kind)}
                            <button
                                onclick={() => addVocab(v.kind, v.signature)}
                                class="cursor-pointer rounded-lg bg-brand-sand-100 px-2 py-1 text-[0.65rem] font-semibold text-brand-charcoal-600 hover:bg-brand-sand-200 dark:bg-[#414559] dark:text-[#c6d0f5] dark:hover:bg-[#51576d]"
                            >
                                + {$t(v.labelKey)}
                            </button>
                        {/each}
                    </div>
                    <div class="mt-2 space-y-1.5">
                        {#each draft.vocabulary as v (v.id)}
                            <div class="rounded-lg border border-brand-sand-200 p-2 dark:border-[#414559]">
                                <div class="flex items-center gap-1.5">
                                    <span class="w-16 shrink-0 text-[0.6rem] font-semibold uppercase text-brand-charcoal-400 dark:text-[#838ba7]">
                                        {$t(`logic.vocab.${v.kind}`)}
                                    </span>
                                    <input
                                        value={v.name}
                                        oninput={(e) => patchVocab(v.id, { name: e.currentTarget.value })}
                                        placeholder={$t("logic.vocab.name")}
                                        class="w-32 rounded border border-brand-sand-200 px-1.5 py-0.5 font-mono text-[0.7rem] dark:border-[#51576d] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                                    />
                                    {#if v.kind !== "type"}
                                        <span class="text-brand-charcoal-400">:</span>
                                        <input
                                            value={v.signature ?? ""}
                                            oninput={(e) => patchVocab(v.id, { signature: e.currentTarget.value })}
                                            placeholder="Act → Prop"
                                            class="flex-1 rounded border border-brand-sand-200 px-1.5 py-0.5 font-mono text-[0.7rem] dark:border-[#51576d] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                                        />
                                    {/if}
                                    <button
                                        onclick={() => removeVocab(v.id)}
                                        aria-label={$t("common.remove")}
                                        class="cursor-pointer rounded p-0.5 text-brand-charcoal-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40"
                                    >
                                        <Icon icon="solar:trash-bin-trash-bold-duotone" width="0.85rem" />
                                    </button>
                                </div>
                                {#each problemsFor(v.id) as problem, i (i)}
                                    <p class="mt-0.5 text-[0.625rem] {problem.severity === 'error' ? 'text-rose-600 dark:text-rose-300' : 'text-amber-600 dark:text-amber-300'}">
                                        {problem.message}
                                    </p>
                                {/each}
                            </div>
                        {/each}
                    </div>

                    <!-- Declarations -->
                    <h3 class="mt-5 text-[0.7rem] font-bold uppercase tracking-wide text-brand-charcoal-400 dark:text-[#838ba7]">
                        {$t("logic.theory.declarations")}
                    </h3>
                    <div class="mt-1.5 flex flex-wrap gap-1.5">
                        <button
                            onclick={() => addDeclaration("axiom")}
                            class="cursor-pointer rounded-lg bg-amber-100 px-2 py-1 text-[0.65rem] font-semibold text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200"
                        >
                            + {$t("logic.decl.axiom")}
                        </button>
                        <button
                            onclick={() => addDeclaration("definition")}
                            class="cursor-pointer rounded-lg bg-brand-sand-100 px-2 py-1 text-[0.65rem] font-semibold text-brand-charcoal-600 hover:bg-brand-sand-200 dark:bg-[#414559] dark:text-[#c6d0f5]"
                        >
                            + {$t("logic.decl.definition")}
                        </button>
                    </div>
                    <div class="mt-2 space-y-1.5">
                        {#each draft.trustedDeclarations as d (d.id)}
                            <div class="rounded-lg border border-brand-sand-200 p-2 dark:border-[#414559]">
                                <div class="flex items-center gap-1.5">
                                    <span
                                        class="w-16 shrink-0 rounded px-1 text-center text-[0.6rem] font-semibold uppercase {d.kind ===
                                        'axiom'
                                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                                            : 'text-brand-charcoal-400 dark:text-[#838ba7]'}"
                                    >
                                        {$t(`logic.decl.${d.kind}`)}
                                    </span>
                                    <input
                                        value={d.name}
                                        oninput={(e) => patchDecl(d.id, { name: e.currentTarget.value })}
                                        placeholder={$t("logic.decl.name")}
                                        class="w-40 rounded border border-brand-sand-200 px-1.5 py-0.5 font-mono text-[0.7rem] dark:border-[#51576d] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                                    />
                                    <input
                                        value={bindersText(d)}
                                        oninput={(e) => setBinders(d.id, e.currentTarget.value)}
                                        placeholder={$t("logic.decl.binders")}
                                        class="flex-1 rounded border border-brand-sand-200 px-1.5 py-0.5 font-mono text-[0.7rem] dark:border-[#51576d] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                                    />
                                    <button
                                        onclick={() => removeDeclaration(d.id)}
                                        aria-label={$t("common.remove")}
                                        class="cursor-pointer rounded p-0.5 text-brand-charcoal-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900/40"
                                    >
                                        <Icon icon="solar:trash-bin-trash-bold-duotone" width="0.85rem" />
                                    </button>
                                </div>
                                <textarea
                                    value={d.source}
                                    oninput={(e) => patchDecl(d.id, { source: e.currentTarget.value })}
                                    placeholder={$t("logic.decl.statement")}
                                    spellcheck="false"
                                    rows="2"
                                    class="mt-1 w-full resize-y rounded border border-brand-sand-200 px-1.5 py-1 font-mono text-[0.7rem] dark:border-[#51576d] dark:bg-[#292c3c] dark:text-[#c6d0f5]"
                                ></textarea>
                                {#if d.source.trim() && !problemsFor(d.id).some((p) => p.severity === "error")}
                                    <p class="truncate font-mono text-[0.625rem] text-brand-charcoal-400 dark:text-[#838ba7]">
                                        {declarationText(d)}
                                    </p>
                                {/if}
                                {#each problemsFor(d.id) as problem, i (i)}
                                    <p class="text-[0.625rem] {problem.severity === 'error' ? 'text-rose-600 dark:text-rose-300' : 'text-amber-600 dark:text-amber-300'}">
                                        {problem.message}
                                    </p>
                                {/each}
                            </div>
                        {/each}
                    </div>
                </div>

                <!-- The trust panel, always visible while editing. -->
                <aside class="w-64 shrink-0 overflow-auto border-l border-brand-sand-200 bg-brand-sand-50 px-4 py-4 dark:border-[#414559] dark:bg-[#292c3c]">
                    <h3 class="text-[0.7rem] font-bold uppercase tracking-wide text-brand-charcoal-400 dark:text-[#838ba7]">
                        {$t("logic.theory.trust")}
                    </h3>
                    <p class="mt-2 text-[0.7rem] leading-relaxed text-brand-charcoal-600 dark:text-[#c6d0f5]">
                        {$t("logic.theory.trust_note")}
                    </p>
                    <dl class="mt-3 space-y-1.5 text-[0.7rem]">
                        <div class="flex justify-between">
                            <dt class="text-brand-charcoal-500 dark:text-[#a5adce]">{$t("logic.theory.vocabulary")}</dt>
                            <dd class="font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5]">{elaboration.trust.vocabulary.length}</dd>
                        </div>
                        <div class="flex justify-between">
                            <dt class="text-amber-700 dark:text-amber-300">{$t("logic.decl.axiom")}</dt>
                            <dd class="font-semibold text-amber-700 dark:text-amber-300">{elaboration.trust.axioms.length}</dd>
                        </div>
                        <div class="flex justify-between">
                            <dt class="text-brand-charcoal-500 dark:text-[#a5adce]">{$t("logic.decl.definition")}</dt>
                            <dd class="font-semibold text-brand-charcoal-700 dark:text-[#c6d0f5]">{elaboration.trust.definitions.length}</dd>
                        </div>
                    </dl>
                    {#if elaboration.trust.axioms.length}
                        <ul class="mt-3 space-y-1">
                            {#each elaboration.trust.axioms as axiom (axiom.id)}
                                <li class="truncate font-mono text-[0.625rem] text-amber-700 dark:text-amber-300" title={declarationText(axiom)}>
                                    {axiom.name || $t("logic.decl.unnamed")}
                                </li>
                            {/each}
                        </ul>
                    {/if}
                </aside>
            </div>

            <footer class="flex shrink-0 items-center justify-between border-t border-brand-sand-200 px-5 py-3 dark:border-[#414559]">
                <p class="text-[0.7rem] {elaboration.ok ? 'text-brand-charcoal-400 dark:text-[#838ba7]' : 'text-rose-600 dark:text-rose-300'}">
                    {elaboration.ok
                        ? $t("logic.theory.ready")
                        : $t("logic.theory.problems").replace(
                              "{n}",
                              String(elaboration.problems.filter((p) => p.severity === "error").length),
                          )}
                </p>
                <div class="flex gap-2">
                    <button
                        onclick={onClose}
                        class="cursor-pointer rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold text-brand-charcoal-500 hover:bg-brand-sand-100 dark:text-[#c6d0f5] dark:hover:bg-[#414559]"
                    >
                        {$t("common.cancel")}
                    </button>
                    <button
                        onclick={publish}
                        disabled={!elaboration.ok}
                        class="cursor-pointer rounded-lg bg-brand-gold-500 px-3 py-1.5 text-[0.75rem] font-semibold text-white transition-colors hover:bg-brand-gold-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {$t("logic.theory.publish")}
                    </button>
                </div>
            </footer>
        </div>
    </div>
{/if}
