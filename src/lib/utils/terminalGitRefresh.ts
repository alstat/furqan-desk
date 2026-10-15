/**
 * PTY output includes readline echo, completions and prompt redraws, not just
 * command results. Only watch output after a submitted line (or interrupt),
 * and cancel pending work as soon as editing resumes. Without shell integration
 * we cannot detect command completion exactly, so output is debounced while
 * armed, including later output from a long-running command.
 */
export function terminalGitRefresh(refresh: () => void, delay = 400) {
    let armed = false;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function cancel() {
        if (timer !== null) clearTimeout(timer);
        timer = null;
    }

    return {
        input(data: string) {
            if (disposed || !data) return;
            cancel();
            // A bracketed paste ends with an escape sequence, not Enter: it
            // must not arm refreshes until the user actually submits it.
            armed = /[\r\n\x03]$/.test(data);
        },
        output() {
            if (disposed || !armed) return;
            cancel();
            timer = setTimeout(() => {
                timer = null;
                refresh();
            }, delay);
        },
        dispose() {
            disposed = true;
            armed = false;
            cancel();
        },
    };
}
