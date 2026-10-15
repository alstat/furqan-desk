/**
 * Reaching the R / Python REPL from the editor.
 *
 * The two are no longer neighbours in the component tree: the editor sits in
 * the sidebar column and its REPL in the right-hand one, the arrangement Julia
 * uses. A `bind:this` cannot cross that gap, so the mounted pane publishes the
 * way to talk to it here and the editor's Run command looks it up — the same
 * job `executeJuliaCode` does for Julia.
 *
 * Keyed by language, not by tab: there is one R session and one Python session
 * per window, shared by every file of that kind, so running a second R file
 * lands in the session where the first one's definitions already live.
 */

import { writable } from 'svelte/store';
import type { ScriptLanguageId } from '$lib/languages/scriptLanguages';

type Sender = (code: string) => Promise<void>;

const senders = new Map<ScriptLanguageId, Sender>();

/** Bumped whenever a pane appears or goes, so `scriptReplReady` re-evaluates. */
const _generation = writable(0);

/** Which languages currently have a REPL pane on screen. */
export const scriptReplReady = {
	subscribe: (run: (value: Set<ScriptLanguageId>) => void) =>
		_generation.subscribe(() => run(new Set(senders.keys()))),
};

/**
 * Publish this pane as the place `language`'s code should go. Returns the
 * disposer the pane calls on unmount; it only clears the entry if it is still
 * this pane's, because a remount can register the replacement first.
 */
export function registerScriptRepl(
	language: ScriptLanguageId,
	send: Sender,
): () => void {
	senders.set(language, send);
	_generation.update(n => n + 1);
	return () => {
		if (senders.get(language) === send) {
			senders.delete(language);
			_generation.update(n => n + 1);
		}
	};
}

/**
 * Send code to a language's REPL. Silently does nothing when no pane is
 * mounted — which only happens if the layout has hidden it, and the caller has
 * no better answer than the user's own next action.
 */
export async function runInScriptRepl(
	language: ScriptLanguageId,
	code: string,
): Promise<void> {
	await senders.get(language)?.(code);
}

/** One line of a transcript, as the pane renders it. */
export type ReplLine = { kind: 'input' | 'out' | 'err' | 'info'; text: string };

/**
 * What a language's pane should show, kept outside the pane itself.
 *
 * A pane is not a fixture: the right-hand column holds one, and it is given the
 * active tab's language, so switching from an R file to a Python one hands the
 * same component a different language. Everything below used to live in the
 * component, which meant the Python pane opened on R's transcript — the session
 * underneath was right, the transcript was the one left behind. Holding it here,
 * keyed the way the sessions themselves are, means each language keeps its own
 * and gets it back when its files come forward again.
 */
export type ReplSessionState = {
	lines: ReplLine[];
	/** Submissions, oldest first, for the pane's arrow-key history. */
	history: string[];
	/** Whether this session has already had the plot hook installed. */
	hooked: boolean;
};

const states = new Map<ScriptLanguageId, ReplSessionState>();

/** The state for a language, created empty the first time it is asked for. */
export function replSessionState(language: ScriptLanguageId): ReplSessionState {
	let state = states.get(language);
	if (!state) {
		state = { lines: [], history: [], hooked: false };
		states.set(language, state);
	}
	return state;
}

