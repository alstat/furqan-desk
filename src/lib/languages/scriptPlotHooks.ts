/**
 * Getting plots out of the R and Python sessions.
 *
 * Julia needs none of this: one custom `AbstractDisplay` pushed onto its
 * display stack catches every plotting package, because they all render
 * through `display` (see the injected `_ALDisplay` in `julia.rs`). Neither R
 * nor Python has a single mechanism like that, so each library family is
 * caught where it actually produces output:
 *
 *   - **R graphics devices** — base graphics, ggplot2 and lattice all draw to
 *     the active device, so overriding `options(device=)` with a PNG device
 *     catches all three at once. A task callback closes the device after each
 *     top-level expression, which is what flushes the file.
 *   - **matplotlib** — no device concept, so open figures are saved after each
 *     statement instead. seaborn and pandas `.plot()` ride on matplotlib, so
 *     they come along for free.
 *   - **plotly**, in both languages — an interactive HTML document rather than
 *     an image, so `show` is intercepted and the figure written to HTML. That
 *     is the same treatment PlotlyJS.jl gets on the Julia side, and the viewer
 *     already renders `plotly` entries in an iframe.
 *
 * Both hooks announce a finished plot by printing a marker line on stdout,
 * which `ScriptReplPane` picks out of the output stream. A marker rather than a
 * side channel because the session already has exactly one channel back to the
 * app, and a file path is small enough to send down it.
 */

import type { ScriptLanguageId } from './scriptLanguages';

/** Prefix of the line a session prints when a plot is ready. */
export const PLOT_MARKER = '__ZIYA_PLOT__';

/** A marker line, split into the format and the file holding it. */
export function parsePlotMarker(
	line: string,
): { format: 'png' | 'svg' | 'plotly'; path: string } | null {
	if (!line.startsWith(PLOT_MARKER)) return null;
	const rest = line.slice(PLOT_MARKER.length).trim();
	const space = rest.indexOf(' ');
	if (space <= 0) return null;
	const format = rest.slice(0, space);
	const path = rest.slice(space + 1).trim();
	if (!path) return null;
	if (format !== 'png' && format !== 'svg' && format !== 'plotly') return null;
	return { format, path };
}

/**
 * The R hook.
 *
 * Wrapped in `suppressWarnings(try(...))` so that a session without ggplot2,
 * or one where something here fails, still starts — a REPL that refuses to
 * open because plot capture could not be installed would be a bad trade for a
 * feature the user may not even use. Wrapped in `invisible()` as well, because
 * the last thing it evaluates is `addTaskCallback`, whose return value R would
 * otherwise print into the transcript as the session's first output.
 */
const R_HOOK = `
invisible(suppressWarnings(try({
  # The pane draws its own prompt, so R's is reduced to a byte the transcript
  # strips (see \`stripPrompts\`). It cannot be set to the empty string — R
  # rejects that — and it is written without a trailing newline, so left as
  # \`> \` it would glue itself to the front of the next line of real output.
  options(prompt = "\\001", continue = "\\001")

  # A pane can be dissolved and remade over a session that is still running.
  # Installing the callback twice would announce every plot twice.
  removeTaskCallback("ziya_plots")

  .ziya <- new.env()
  .ziya$dir <- file.path(tempdir(), "ziya-plots")
  dir.create(.ziya$dir, showWarnings = FALSE, recursive = TRUE)
  .ziya$seq <- 0L
  .ziya$pending <- character(0)

  # Every device-based package — base graphics, ggplot2, lattice — opens the
  # device named here, so one override catches all of them.
  options(device = function(...) {
    .ziya$seq <- .ziya$seq + 1L
    f <- file.path(.ziya$dir, sprintf("plot-%05d.png", .ziya$seq))
    .ziya$pending <- c(.ziya$pending, f)
    grDevices::png(filename = f, width = 1400, height = 900, res = 144)
  })

  # Runs after each top-level expression. Closing the device is what writes the
  # file, so nothing is announced until it is complete on disk.
  addTaskCallback(function(expr, value, ok, visible) {
    try({
      while (grDevices::dev.cur() > 1L) grDevices::dev.off()
      for (f in .ziya$pending) {
        if (file.exists(f) && file.info(f)$size > 0) {
          cat(sprintf("${PLOT_MARKER} png %s\\n", f))
        }
      }
      .ziya$pending <- character(0)

      # plotly and every other htmlwidget: an HTML document, not an image.
      if (isTRUE(ok) && isTRUE(visible) && inherits(value, "htmlwidget")) {
        .ziya$seq <- .ziya$seq + 1L
        h <- file.path(.ziya$dir, sprintf("plot-%05d.html", .ziya$seq))
        htmlwidgets::saveWidget(value, h, selfcontained = TRUE)
        if (file.exists(h)) cat(sprintf("${PLOT_MARKER} plotly %s\\n", h))
      }
    }, silent = TRUE)
    TRUE
  }, name = "ziya_plots")
}, silent = TRUE)))
`;

/**
 * The Python hook.
 *
 * Defined once at startup; `_ziya_flush()` is then appended to each submission
 * by the pane, because Python has no equivalent of R's task callback in an
 * interactive session. Everything is imported lazily inside the function, so
 * starting a session costs nothing for a user who never plots, and a missing
 * library is simply skipped.
 */
const PYTHON_HOOK = `
import os as _os, sys as _sys, tempfile as _tempfile
_ZIYA_DIR = _os.path.join(_tempfile.gettempdir(), "ziya-plots")
_os.makedirs(_ZIYA_DIR, exist_ok=True)
_ZIYA_SEQ = [0]

def _ziya_path(ext):
    _ZIYA_SEQ[0] += 1
    return _os.path.join(_ZIYA_DIR, "plot-%05d.%s" % (_ZIYA_SEQ[0], ext))

def _ziya_patch_plotly():
    # plotly renders by calling show(); intercepting it writes the figure out
    # instead of trying to open a browser, which a desktop app has no use for.
    pio = _sys.modules.get("plotly.io")
    if pio is None or getattr(pio, "_ziya_patched", False):
        return
    def _show(fig, *a, **k):
        p = _ziya_path("html")
        pio.write_html(fig, p, include_plotlyjs="cdn", full_html=True)
        print("${PLOT_MARKER} plotly " + p, flush=True)
    pio.show = _show
    pio._ziya_patched = True
    # Figure.show() resolves through pio.show, so both entry points are covered.

def _ziya_flush():
    try:
        _ziya_patch_plotly()
    except Exception:
        pass
    try:
        plt = _sys.modules.get("matplotlib.pyplot")
        if plt is not None:
            for num in plt.get_fignums():
                fig = plt.figure(num)
                # An empty figure is one the user opened but never drew on.
                if not fig.get_axes():
                    continue
                p = _ziya_path("png")
                fig.savefig(p, dpi=144, bbox_inches="tight")
                print("${PLOT_MARKER} png " + p, flush=True)
                plt.close(fig)
    except Exception:
        pass
`;

/** The snippet that installs plot capture in a freshly started session. */
export function plotHookFor(language: ScriptLanguageId): string | null {
	if (language === 'r') return R_HOOK;
	if (language === 'python') return PYTHON_HOOK;
	return null;
}

/**
 * Code to run after a submission, when the language needs an explicit nudge.
 *
 * R installs a task callback and so needs none. Python has no such hook in an
 * interactive session, so the flush is appended to what the user ran — after a
 * blank line, which also closes any block they just defined.
 */
export function plotFlushFor(language: ScriptLanguageId): string | null {
	return language === 'python' ? '\n_ziya_flush()\n' : null;
}
