<script lang="ts">
    // A slim indeterminate progress bar. juliaup doesn't report a real
    // percentage for updates/installs, so we show an animated sweep rather
    // than a fake determinate value.
    interface Props {
        class?: string;
        ariaLabel?: string;
    }
    let { class: className = '', ariaLabel = 'In progress' }: Props = $props();
</script>

<div
    class="jip-track {className}"
    role="progressbar"
    aria-label={ariaLabel}
    aria-busy="true"
>
    <div class="jip-bar"></div>
</div>

<style>
    .jip-track {
        position: relative;
        height: 4px;
        width: 100%;
        overflow: hidden;
        border-radius: 9999px;
        background-color: rgb(0 0 0 / 0.08);
    }
    :global(html.dark) .jip-track {
        background-color: rgb(255 255 255 / 0.08);
    }
    .jip-bar {
        position: absolute;
        top: 0;
        bottom: 0;
        width: 40%;
        border-radius: 9999px;
        background: linear-gradient(
            90deg,
            transparent,
            #d4a24e 50%,
            transparent
        );
        animation: jip-slide 1.25s ease-in-out infinite;
    }
    :global(html.dark) .jip-bar {
        background: linear-gradient(
            90deg,
            transparent,
            #e5c890 50%,
            transparent
        );
    }
    @keyframes jip-slide {
        0% {
            left: -40%;
        }
        100% {
            left: 100%;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .jip-bar {
            animation-duration: 2.5s;
        }
    }
</style>
