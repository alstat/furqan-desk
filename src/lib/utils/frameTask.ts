/** Collapse repeated visual work into one callback at the next paint. */
export function frameTask(callback: () => void) {
    let frame: number | null = null;
    return {
        schedule() {
            if (frame !== null) return;
            frame = requestAnimationFrame(() => {
                frame = null;
                callback();
            });
        },
        cancel() {
            if (frame !== null) cancelAnimationFrame(frame);
            frame = null;
        },
    };
}
