import { writable } from "svelte/store";

/**
 * The app-wide animation switch.
 *
 * Off means *no* motion anywhere, for machines where compositing every fade and
 * slide costs more than it is worth. Two mechanisms are needed to cover the
 * app, because its motion comes from two places:
 *
 * - **CSS** — Tailwind's `transition-*` utilities, the keyframes in `app.css`,
 *   `animate-spin`. Killed by the `:root[data-animations="off"]` block in
 *   `app.css`, which the layout keeps in sync with this store.
 * - **Svelte transitions** (`transition:fade`, `fly`, `slide`) — these compile
 *   to Web Animations API calls, which no stylesheet can reach. Rather than
 *   thread a duration through the fifty-odd components that use them, the
 *   switch patches `Element.animate` to run at zero duration: the element
 *   still lands on the transition's end state and Svelte still hears the
 *   animation finish, so intro/outro bookkeeping is untouched — it simply
 *   happens in one frame.
 *
 * The choice is offered once, right after the first-run tour, and lives in
 * Settings › Appearance after that.
 */

const KEY = "app-animations";
/** Set once the user has answered — the post-tour prompt asks only while unset. */
const ASKED_KEY = "app-animations-asked";

function load(): boolean {
    try {
        return localStorage.getItem(KEY) !== "false";
    } catch {
        return true;
    }
}

const _animationsEnabled = writable<boolean>(load());

/** Read by the `Element.animate` patch, which cannot subscribe. */
let enabled = load();
_animationsEnabled.subscribe((v) => {
    enabled = v;
});

export const animationsEnabled = {
    subscribe: _animationsEnabled.subscribe,
    set(v: boolean) {
        try {
            localStorage.setItem(KEY, String(v));
        } catch {
            /* ignore */
        }
        _animationsEnabled.set(v);
    },
};

/** Whether the post-tour prompt still has a question to ask. */
export function animationChoiceMade(): boolean {
    try {
        return localStorage.getItem(ASKED_KEY) === "true";
    } catch {
        return true;
    }
}

export function markAnimationChoiceMade(): void {
    try {
        localStorage.setItem(ASKED_KEY, "true");
    } catch {
        /* ignore */
    }
}

/**
 * Collapse Web Animations to a single frame while the switch is off.
 *
 * One millisecond rather than zero, deliberately. Callers attach their
 * completion handler on the line *after* `animate()` returns — Svelte's
 * transition runtime assigns `animation.onfinish` there, and only removes an
 * outroing element when it fires. A zero-duration animation is already
 * finished by then, which puts the finish event's delivery on the edge of the
 * spec's notification timing; at 1ms the animation is plainly still running
 * when the handler lands, so the ordinary finish path runs. One frame is not
 * a perceptible animation, and the element still ends on its final keyframe.
 * Components marked `.animation-exempt-all` keep their native timing unless
 * the operating system requests reduced motion.
 */
function installZeroDurationAnimations() {
    if (typeof Element === "undefined") return;
    const proto = Element.prototype as Element & {
        __ayahlabAnimationPatch?: boolean;
    };
    if (proto.__ayahlabAnimationPatch) return;
    proto.__ayahlabAnimationPatch = true;

    const native = Element.prototype.animate;
    Element.prototype.animate = function (
        this: Element,
        keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
        options?: number | KeyframeAnimationOptions,
    ): Animation {
        const fullyExempt = this.closest(".animation-exempt-all") !== null;
        const reducedMotion = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        ).matches;
        if (enabled || (fullyExempt && !reducedMotion)) {
            return native.call(this, keyframes, options);
        }
        const opts: KeyframeAnimationOptions =
            typeof options === "number" ? {} : { ...(options ?? {}) };
        opts.duration = 1;
        opts.delay = 0;
        opts.endDelay = 0;
        return native.call(this, keyframes, opts);
    };
}

if (typeof window !== "undefined") {
    installZeroDurationAnimations();

    // Secondary windows (postcard editor, manuscript viewer, terminal…) read
    // the value once at boot; `storage` fires in every *other* window on the
    // origin, which keeps them in step with a change made anywhere.
    window.addEventListener("storage", (e) => {
        if (e.key !== KEY || e.newValue === null) return;
        _animationsEnabled.set(e.newValue !== "false");
    });
}
