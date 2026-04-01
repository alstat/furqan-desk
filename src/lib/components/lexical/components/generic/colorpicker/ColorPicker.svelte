<script lang="ts">
    import { untrack } from "svelte";
    import {
        basicColors,
        transformColor,
        type Position,
        skipAddingToHistoryStack,
    } from "./helpers.js";
    import MoveWrapper from "./MoveWrapper.svelte";
    import TextInput from "../input/TextInput.svelte";

    const WIDTH = 240;
    const HEIGHT = 150;

    interface Props {
        color: string;
        onChange:
            | ((value: string, skipHistoryStack: boolean) => void)
            | undefined;
    }

    let { color, onChange }: Props = $props();

    let selfColor = $state(untrack(() => transformColor("hex", color)));
    let inputColor = $state(untrack(() => color));

    $effect(() => {
        selfColor = transformColor("hex", color);
        inputColor = color;
    });

    let saturationPosition = $derived({
        x: Math.max(0, Math.min(WIDTH, (selfColor.hsv.s / 100) * WIDTH)),
        y: Math.max(
            0,
            Math.min(HEIGHT, ((100 - selfColor.hsv.v) / 100) * HEIGHT),
        ),
    });

    let huePosition = $derived({
        x: Math.max(0, Math.min(WIDTH, (selfColor.hsv.h / 360) * WIDTH)),
    });

    // Call onChange from each interaction — never on mount (avoids auto-applying on open)
    const onSetHex = (hex: string) => {
        inputColor = hex;
        if (/^#[0-9A-Fa-f]{6}$/i.test(hex)) {
            const newColor = transformColor("hex", hex);
            selfColor = newColor;
            onChange?.(newColor.hex, false);
        }
    };

    const onMoveSaturation = ({ x, y }: Position) => {
        const newHsv = {
            ...selfColor.hsv,
            s: (x / WIDTH) * 100,
            v: 100 - (y / HEIGHT) * 100,
        };
        const newColor = transformColor("hsv", newHsv);
        selfColor = newColor;
        inputColor = newColor.hex;
        onChange?.(newColor.hex, $skipAddingToHistoryStack);
    };

    const onMoveHue = ({ x }: Position) => {
        const newHsv = { ...selfColor.hsv, h: (x / WIDTH) * 360 };
        const newColor = transformColor("hsv", newHsv);
        selfColor = newColor;
        inputColor = newColor.hex;
        onChange?.(newColor.hex, $skipAddingToHistoryStack);
    };

    const onPickBasicColor = (basicColor: string) => {
        inputColor = basicColor;
        selfColor = transformColor("hex", basicColor);
        onChange?.(basicColor, false);
    };
</script>

<div class="pt-2.5 ml-1.5 pb-0.5" style="width: {WIDTH}px">
    <!-- Quick color swatches -->
    <div class="grid grid-cols-8 gap-1.75 mb-3.5">
        {#each basicColors as basicColor}
            <!-- svelte-ignore a11y_consider_explicit_label -->
            <button
                type="button"
                class={`rounded-full inset-shadow-2xs size-5 cursor-pointer transition-[transform,box-shadow] duration-100 hover:scale-[1.18] ${
                    basicColor === selfColor.hex
                        ? "shadow-[0_0_0_2.5px_var(--color-brand-gold-400)] border-transparent"
                        : "border-brand-sand-200"
                }`}
                style="background-color: {basicColor}"
                onclick={() => onPickBasicColor(basicColor)}
            >
            </button>
        {/each}
    </div>

    <!-- Saturation / value gradient -->
    <MoveWrapper
        className="w-full relative mt-3.75 h-37.5 bg-[linear-gradient(transparent,black),linear-gradient(to_right,white,transparent)] select-none"
        style="background-color: hsl({selfColor.hsv.h}, 100%, 50%)"
        onChange={onMoveSaturation}
    >
        <div
            class="absolute size-4 border-2 border-white rounded-full shadow-[0_1px_6px_rgba(0,0,0,0.35)] box-border transform-[translate(-8px,-8px)]"
            style="background-color: {selfColor.hex}; left: {saturationPosition.x}px; top: {saturationPosition.y}px"
        ></div>
    </MoveWrapper>

    <!-- Hue slider -->
    <MoveWrapper
        className="w-full relative mt-3.75 h-3 bg-[linear-gradient(to_right,rgb(255,0,0),rgb(255,255,0),rgb(0,255,0),rgb(0,255,255),rgb(0,0,255),rgb(255,0,255),rgb(255,0,0))] select-none rounded-xl overflow-hidden"
        onChange={onMoveHue}
    >
        <div
            class="absolute size-4 border-2 border-white rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.3)] box-border transform-[translate(-8px,-2px)]"
            style="background-color: hsl({selfColor.hsv
                .h}, 100%, 50%); left: {huePosition.x}px"
        ></div>
    </MoveWrapper>

    <!-- Preview + hex row -->
    <div class="flex justify-between items-center gap-2.5 mt-2.5">
        <div
            class="border border-brand-sand-200 rounded-full shrink-0 size-7"
            style="background-color: {selfColor.hex}"
        ></div>
        <TextInput
            label="Hex"
            onChange={onSetHex}
            value={inputColor}
            width="110px"
        />
    </div>
</div>
