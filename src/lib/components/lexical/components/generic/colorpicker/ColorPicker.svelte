<script lang="ts">
  import {
    basicColors,
    transformColor,
    type Position,
    skipAddingToHistoryStack,
  } from './helpers.js';
  import MoveWrapper from './MoveWrapper.svelte';
  import TextInput from '../input/TextInput.svelte';

  const WIDTH = 240;
  const HEIGHT = 160;

  interface Props {
    color: string;
    onChange: ((value: string, skipHistoryStack: boolean) => void) | undefined;
  }

  let {color, onChange}: Props = $props();

  let selfColor = $state(transformColor('hex', color));
  let inputColor = $state(color);

  let saturationPosition = $derived({
    x: (selfColor.hsv.s / 100) * WIDTH,
    y: ((100 - selfColor.hsv.v) / 100) * HEIGHT,
  });

  let huePosition = $derived({
    x: (selfColor.hsv.h / 360) * WIDTH,
  });

  // Call onChange from each interaction — never on mount (avoids auto-applying on open)
  const onSetHex = (hex: string) => {
    inputColor = hex;
    if (/^#[0-9A-Fa-f]{6}$/i.test(hex)) {
      const newColor = transformColor('hex', hex);
      selfColor = newColor;
      onChange?.(newColor.hex, false);
    }
  };

  const onMoveSaturation = ({x, y}: Position) => {
    const newHsv = {
      ...selfColor.hsv,
      s: (x / WIDTH) * 100,
      v: 100 - (y / HEIGHT) * 100,
    };
    const newColor = transformColor('hsv', newHsv);
    selfColor = newColor;
    inputColor = newColor.hex;
    onChange?.(newColor.hex, $skipAddingToHistoryStack);
  };

  const onMoveHue = ({x}: Position) => {
    const newHsv = {...selfColor.hsv, h: (x / WIDTH) * 360};
    const newColor = transformColor('hsv', newHsv);
    selfColor = newColor;
    inputColor = newColor.hex;
    onChange?.(newColor.hex, $skipAddingToHistoryStack);
  };

  const onPickBasicColor = (basicColor: string) => {
    inputColor = basicColor;
    selfColor = transformColor('hex', basicColor);
    onChange?.(basicColor, false);
  };
</script>

<div class="color-picker-wrapper" style="width: {WIDTH}px">
  <!-- Quick color swatches -->
  <div class="color-picker-basic-color">
    {#each basicColors as basicColor}
      <!-- svelte-ignore a11y_consider_explicit_label -->
      <button
        type="button"
        class={basicColor === selfColor.hex ? 'active' : ''}
        style="background-color: {basicColor}"
        onclick={() => onPickBasicColor(basicColor)}>
      </button>
    {/each}
  </div>

  <!-- Saturation / value gradient -->
  <MoveWrapper
    className="color-picker-saturation"
    style="background-color: hsl({selfColor.hsv.h}, 100%, 50%)"
    onChange={onMoveSaturation}>
    <div
      class="color-picker-saturation_cursor"
      style="background-color: {selfColor.hex}; left: {saturationPosition.x}px; top: {saturationPosition.y}px">
    </div>
  </MoveWrapper>

  <!-- Hue slider -->
  <MoveWrapper className="color-picker-hue" onChange={onMoveHue}>
    <div
      class="color-picker-hue_cursor"
      style="background-color: hsl({selfColor.hsv.h}, 100%, 50%); left: {huePosition.x}px">
    </div>
  </MoveWrapper>

  <!-- Preview + hex row -->
  <div class="color-picker-bottom">
    <div class="color-picker-color" style="background-color: {selfColor.hex}"></div>
    <TextInput label="Hex" onChange={onSetHex} value={inputColor} width="110px" />
  </div>
</div>

<style>
  .color-picker-wrapper {
    padding: 10px 12px 6px;
  }

  .color-picker-basic-color {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin: 0 0 14px;
    padding: 0;
  }

  .color-picker-basic-color button {
    border: 1px solid var(--color-brand-sand-200, #e8dcc8);
    border-radius: 5px;
    height: 20px;
    width: 20px;
    cursor: pointer;
    list-style-type: none;
    transition: transform 0.1s, box-shadow 0.1s;
  }

  .color-picker-basic-color button:hover {
    transform: scale(1.18);
  }

  .color-picker-basic-color button.active {
    box-shadow: 0 0 0 2.5px var(--color-brand-gold-400, #e8a844);
    border-color: transparent;
  }

  .color-picker-saturation_cursor {
    position: absolute;
    width: 16px;
    height: 16px;
    border: 2px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 1px 6px rgba(0,0,0,0.35);
    box-sizing: border-box;
    transform: translate(-8px, -8px);
  }

  .color-picker-hue_cursor {
    position: absolute;
    width: 16px;
    height: 16px;
    border: 2px solid #ffffff;
    border-radius: 50%;
    box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    box-sizing: border-box;
    transform: translate(-8px, -2px);
  }

  .color-picker-bottom {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 10px;
  }

  .color-picker-color {
    border: 1px solid var(--color-brand-sand-200, #e8dcc8);
    border-radius: 8px;
    flex-shrink: 0;
    width: 32px;
    height: 32px;
  }
</style>
