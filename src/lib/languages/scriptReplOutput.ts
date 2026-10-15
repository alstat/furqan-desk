/**
 * Cleaning up what R and Python write to a pipe.
 *
 * Both interpreters are started as interactive sessions reading from a pipe
 * (see `script_repl.rs`), which is the shape the transcript wants — but an
 * interactive session still writes the prompt it would show a terminal, and
 * writes it without a trailing newline. So the prompt does not arrive as a line
 * of its own: it arrives stuck to the front of whatever the session printed
 * next, as `>>> Traceback (most recent call last):` or `\x01[1] 2`.
 *
 * The pane draws its own prompt, so every one of these is noise. R's is reduced
 * to `\x01` by the plot hook the moment the session starts, because a byte no
 * real output contains can be stripped without having to guess; the default
 * `> ` and `+ ` are still recognised, for the moments before the hook lands and
 * for a session where it failed. Python's `>>> ` and `... ` cannot be changed
 * this way — `sys.ps1` is only consulted by a session on a terminal — so they
 * are matched literally.
 *
 * Two things this cannot tell apart, both of them the first line a statement
 * prints — a prompt is written when the session asks for input, never
 * mid-output, so no later line is at risk. Real output that itself begins with
 * a prompt's spelling, `cat("> quoted\n")`, loses that prefix; and a blank
 * first line, `cat("\n")`, is indistinguishable from the prompt sitting alone
 * on the line, so it is dropped. The alternative is showing every prompt.
 */

/** A line that is nothing but prompts, which a waiting session wrote. */
const PROMPT_ONLY = /^(?:(?:\x01|>>>|\.\.\.|>|\+)\s*)+$/;

/** A run of prompts at the start of a line, each with the space it is written with. */
const PROMPT_RUN = /^(?:\x01|>>> |\.\.\. |> |\+ )+/;

/**
 * `text` without its leading prompts, or `null` when there was nothing else on
 * the line — a prompt the session wrote while waiting, which is not output at
 * all. A line that is genuinely empty is output, and comes back unchanged.
 */
export function stripPrompts(text: string): string | null {
	if (PROMPT_ONLY.test(text.trim())) return null;
	return text.replace(PROMPT_RUN, '');
}
