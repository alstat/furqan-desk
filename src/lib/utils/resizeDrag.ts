export interface ResizeSession {
    move(event: PointerEvent): void;
    end(): void;
}

interface ResizeDragOptions {
    cursor: "col-resize" | "row-resize";
    start(event: PointerEvent): ResizeSession | undefined;
}

/** Frame-coalesced divider dragging. Callers measure once in start(), update
 * only live layout in move(), and persist in end(), never on the hot path. */
export function resizeDrag(node: HTMLElement, options: ResizeDragOptions) {
    let finish: (() => void) | undefined;

    function down(event: PointerEvent) {
        if (event.button !== 0 || !event.isPrimary || finish) return;
        const session = options.start(event);
        if (!session) return;
        event.preventDefault();

        const pointerId = event.pointerId;
        const body = node.ownerDocument.body;
        const win = node.ownerDocument.defaultView!;
        const oldCursor = body.style.cursor;
        const oldSelect = body.style.userSelect;
        const oldMarker = body.getAttribute("data-resizing");
        body.style.cursor = options.cursor;
        body.style.userSelect = "none";
        body.setAttribute("data-resizing", "");
        let frame: number | null = null;
        let latest: PointerEvent | null = null;

        function flush() {
            frame = null;
            if (!latest) return;
            const next = latest;
            latest = null;
            session!.move(next);
        }

        function move(e: PointerEvent) {
            if (e.pointerId !== pointerId) return;
            latest = e;
            if (frame === null) frame = win.requestAnimationFrame(flush);
        }

        function up(e: PointerEvent) {
            if (e.pointerId !== pointerId) return;
            // Include the release position even if its last move wasn't painted.
            latest = e;
            finish?.();
        }

        function cancel(e: PointerEvent) {
            if (e.pointerId === pointerId) finish?.();
        }

        function blur() { finish?.(); }

        finish = () => {
            finish = undefined;
            win.removeEventListener("pointermove", move);
            win.removeEventListener("pointerup", up);
            win.removeEventListener("pointercancel", cancel);
            win.removeEventListener("blur", blur);
            node.removeEventListener("lostpointercapture", cancel);
            if (frame !== null) win.cancelAnimationFrame(frame);
            flush();
            try { node.releasePointerCapture(pointerId); } catch { /* already lost */ }
            body.style.cursor = oldCursor;
            body.style.userSelect = oldSelect;
            if (oldMarker === null) body.removeAttribute("data-resizing");
            else body.setAttribute("data-resizing", oldMarker);
            session.end();
        };

        win.addEventListener("pointermove", move);
        win.addEventListener("pointerup", up);
        win.addEventListener("pointercancel", cancel);
        win.addEventListener("blur", blur);
        node.addEventListener("lostpointercapture", cancel);
        try { node.setPointerCapture(pointerId); } catch { /* window listeners still work */ }
    }

    node.addEventListener("pointerdown", down);
    return {
        update(next: ResizeDragOptions) { options = next; },
        destroy() {
            finish?.();
            node.removeEventListener("pointerdown", down);
        },
    };
}
