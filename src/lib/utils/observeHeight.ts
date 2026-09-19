/**
 * An element's height, reported without the cost `bind:clientHeight` carries.
 *
 * Svelte's own size binding observes the **border box** and, in the observer's
 * callback, reads `element.clientHeight` (`svelte/src/internal/client/dom/
 * elements/bindings/size.js`). Two things follow from that, and both hurt while
 * a divider is being dragged:
 *
 *   - It fires on *width* changes too, so a pane bound this way is measured on
 *     every frame of a drag that only makes it narrower.
 *   - The read forces layout inside the ResizeObserver's delivery pass, and the
 *     state it writes usually invalidates layout again in that same pass. The
 *     browser reports this as "ResizeObserver loop completed with undelivered
 *     notifications" and defers what is left to the next frame — which is what
 *     turns a smooth drag into a stuttering one. `AppHeader` hit this before
 *     and works around it the same way this does.
 *
 * So: take the height from the entry, which the browser has already computed
 * and hands over for free, and publish it on the next frame rather than inside
 * the pass. Unchanged heights are dropped, so a drag that only changes the
 * width costs one comparison per frame and nothing else.
 */
export function observeHeight(node: HTMLElement, set: (height: number) => void) {
	let frame: number | null = null;
	let latest = 0;
	let published = -1;

	function publish() {
		frame = null;
		if (latest === published) return;
		published = latest;
		set(latest);
	}

	const observer = new ResizeObserver(entries => {
		latest = entries[entries.length - 1].contentRect.height;
		if (frame === null) frame = requestAnimationFrame(publish);
	});
	observer.observe(node);

	// The observer's first callback is a frame away; this one read at mount
	// spares the pane a frame of deciding what to do with a height of zero.
	latest = node.clientHeight;
	publish();

	return {
		destroy() {
			observer.disconnect();
			if (frame !== null) cancelAnimationFrame(frame);
		},
	};
}
