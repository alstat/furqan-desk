import { describe, expect, it } from 'vitest';
import {
    PLOT_MARKER,
    parsePlotMarker,
    plotFlushFor,
    plotHookFor,
} from '../src/lib/languages/scriptPlotHooks';
import { stripPrompts } from '../src/lib/languages/scriptReplOutput';
import { replArgsFor } from '../src/lib/languages/scriptLanguages';

describe('plot markers', () => {
    it('reads a png marker', () => {
        expect(parsePlotMarker(`${PLOT_MARKER} png /tmp/ziya-plots/plot-1.png`))
            .toEqual({ format: 'png', path: '/tmp/ziya-plots/plot-1.png' });
    });

    it('reads a plotly marker', () => {
        expect(parsePlotMarker(`${PLOT_MARKER} plotly /tmp/a.html`))
            .toEqual({ format: 'plotly', path: '/tmp/a.html' });
    });

    it('keeps a path containing spaces intact', () => {
        expect(parsePlotMarker(`${PLOT_MARKER} png /tmp/my plots/a.png`)?.path)
            .toBe('/tmp/my plots/a.png');
    });

    it('ignores ordinary output', () => {
        expect(parsePlotMarker('[1] 42')).toBeNull();
        expect(parsePlotMarker('>>> print(1)')).toBeNull();
    });

    it('rejects a format the viewer cannot render', () => {
        expect(parsePlotMarker(`${PLOT_MARKER} pdf /tmp/a.pdf`)).toBeNull();
    });

    it('rejects a marker with no path', () => {
        expect(parsePlotMarker(`${PLOT_MARKER} png`)).toBeNull();
    });
});

describe('prompt stripping', () => {
    it('drops a line that is only prompts', () => {
        for (const p of ['>>> ', '... ', '> ', '+ ', '>>> >>> ', '\x01', '\x01\x01']) {
            expect(stripPrompts(p)).toBeNull();
        }
    });

    it('takes the prompt off the output it is stuck to', () => {
        // The prompt carries no newline, so the session's next line of real
        // output arrives with it on the front.
        expect(stripPrompts('\x01[1] 2')).toBe('[1] 2');
        expect(stripPrompts('>>> >>> Traceback (most recent call last):'))
            .toBe('Traceback (most recent call last):');
        // R's default prompts, from before the hook replaces them.
        expect(stripPrompts('> + + \x01hi')).toBe('hi');
    });

    it('leaves output that carries no prompt alone', () => {
        for (const line of ['[1] 5', 'Error: boom', '  indented', '']) {
            expect(stripPrompts(line)).toBe(line);
        }
    });
});

describe('hooks', () => {
    it('gives R a task callback and Python a flush', () => {
        expect(plotHookFor('r')).toContain('addTaskCallback');
        expect(plotFlushFor('r')).toBeNull();
        expect(plotHookFor('python')).toContain('_ziya_flush');
        expect(plotFlushFor('python')).toContain('_ziya_flush()');
    });

    it('covers the library families each language needs', () => {
        const r = plotHookFor('r')!;
        expect(r).toContain('options(device');      // base / ggplot2 / lattice
        expect(r).toContain('htmlwidget');          // plotly
        const py = plotHookFor('python')!;
        expect(py).toContain('matplotlib.pyplot');  // matplotlib / seaborn
        expect(py).toContain('plotly.io');          // plotly
    });

    it('embeds the marker the pane looks for', () => {
        expect(plotHookFor('r')).toContain(PLOT_MARKER);
        expect(plotHookFor('python')).toContain(PLOT_MARKER);
    });

    it('has no hook for Julia, which captures plots its own way', () => {
        expect(plotHookFor('julia')).toBeNull();
    });
});

describe('session arguments', () => {
    it('turns off the echo R would otherwise write back', () => {
        // Its own line editor echoes every line it reads from the pipe, the
        // startup hook included, on top of the prompt the pane already drew.
        expect(replArgsFor('r')).toContain('--no-readline');
    });

    it('starts both languages without a banner', () => {
        expect(replArgsFor('r')).toContain('--quiet');
        expect(replArgsFor('python')).toContain('-q');
    });
});

describe('the R hook stays out of the transcript', () => {
    const r = plotHookFor('r')!;

    it('prints nothing of its own', () => {
        // `addTaskCallback` is the last thing it evaluates, and R prints the
        // value of a visible top-level expression.
        expect(r.trimStart().startsWith('invisible(')).toBe(true);
    });

    it('replaces R\'s prompt with the byte the pane strips', () => {
        expect(r).toContain('options(prompt = "\\001", continue = "\\001")');
    });

    it('can be installed over a session that already has it', () => {
        expect(r).toContain('removeTaskCallback("ziya_plots")');
    });
});
