<script lang="ts">
    import { createEventDispatcher } from "svelte";
    import { getActiveEditor } from "$lexical/core/composerContext.js";
    import { INSERT_EQUATION_COMMAND } from "$lexical/core/plugins/Equation/EquationPlugin.svelte";
    import TextArea from "$lexical/components/generic/input/TextArea.svelte";
    import { selectBtnStyle } from "$lib/data/toolbar/toolbar";
    import katex from "katex";

    const activeEditor = getActiveEditor();
    const dispatch = createEventDispatcher();

    let equation = $state("");
    let mathStyle = $state("inline");
    let isDisabled = $derived(equation === "");
    let preview = $state("");
    let error = $state("");

    function updatePreview(equation: string) {
        try {
            const element = document.getElementById(
                "latex-rendered-equation",
            ) as HTMLElement;
            katex.render(equation, element, {
                throwOnError: false,
                displayMode: mathStyle == "inline" ? false : true,
                output: "mathml",
            });
            preview = element.innerHTML;
            error = "";
        } catch (e) {
            error = e instanceof Error ? e.message : "Invalid equation";
            preview = "";
        }
    }

    function handleEquationChange(
        e: InputEvent & { currentTarget: HTMLTextAreaElement },
    ) {
        const target = e.target as HTMLTextAreaElement;
        equation = target.value;
        updatePreview(equation);
    }
</script>

<div class="m-0">
    <div class="p-1">
        <h2 class="font-sans text-sm">Insert Equation</h2>
    </div>
    <div class="flex flex-col rounded-md border p-4">
        <TextArea
            label="Inline Equation"
            placeholder="Write latex math codes here, e.g. x^2"
            bind:value={equation}
            dataTestId="image-modal-url-input"
            id="lexical-modal-image-url"
            onInput={handleEquationChange}
        />
        <div class="py-2" id="latex-rendered-equation"></div>
        <div class="mt-5 flex flex-row items-center justify-between space-x-4">
            <select
                name="equation-style"
                class={selectBtnStyle + " h-10 w-24"}
                bind:value={mathStyle}
            >
                <option class="cursor-pointer" value="inline" selected
                    >Inline</option
                >
                <option class="cursor-pointer" value="display">Display</option>
            </select>
            <button
                data-test-id="image-modal-confirm-btn"
                disabled={isDisabled}
                class="cursor-pointer rounded-md bg-brand-sand-200 p-2 font-sans text-sm shadow-md hover:bg-brand-sand-400 active:text-gray-100 dark:text-gray-700 hover:dark:text-gray-100 active:shadow-none text-brand-charcoal-900"
                onclick={() => {
                    console.log("equation: ", equation);
                    console.log("activeEditor: ", $activeEditor);
                    $activeEditor.dispatchCommand(INSERT_EQUATION_COMMAND, {
                        equation: equation,
                        inline: mathStyle == "inline" ? true : false,
                    });
                    dispatch("confirm");
                }}
            >
                Confirm
            </button>
        </div>
    </div>
</div>
