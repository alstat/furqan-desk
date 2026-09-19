/**
 * Whether R and Python are installed, and the prompt shown when they are not.
 *
 * This is deliberately thinner than `julia-install.store` or
 * `lean-install.store`. Those manage a toolchain the app installs itself, so
 * they carry download progress, a latest-version check and an update path. R
 * and Python are installed through the system's own package manager, and a
 * private copy would be the wrong one — it would not see the user's virtualenv,
 * their conda environment or their CRAN library. So the app locates what is
 * already there and, when there is nothing, tells the user how to get it.
 */

import { derived, get, writable } from 'svelte/store';
import { invoke } from '@tauri-apps/api/core';
import {
	SCRIPT_LANGUAGES,
	type ScriptLanguageId,
} from '$lib/languages/scriptLanguages';

/** What `find_script_binary` hands back. */
export interface ScriptBinary {
	path: string;
	/** The name it was found under — `python3` vs `python` is worth showing. */
	name: string;
	version: string;
}

/** `undefined` = not looked for yet, `null` = looked for and not found. */
type Found = ScriptBinary | null | undefined;

const _binaries = writable<Record<string, Found>>({});

/** The interpreter found for each language, keyed by language id. */
export const scriptBinaries = { subscribe: _binaries.subscribe };

/** Which language's "not installed" prompt is open, if any. */
export const scriptPromptFor = writable<ScriptLanguageId | null>(null);

export function openScriptInstallPrompt(id: ScriptLanguageId): void {
	scriptPromptFor.set(id);
}

export function closeScriptInstallPrompt(): void {
	scriptPromptFor.set(null);
}

/** The interpreter for `id`, or null when it is missing or not yet looked for. */
export function scriptBinaryFor(id: ScriptLanguageId): ScriptBinary | null {
	return get(_binaries)[id] ?? null;
}

const inFlight = new Map<ScriptLanguageId, Promise<ScriptBinary | null>>();

/**
 * Look for `id`'s interpreter, at most once per language per session.
 *
 * `force` re-runs the search, which is what the install prompt does after
 * sending the user away to install something: they come back to the app
 * expecting it to notice.
 */
export async function detectScriptLanguage(
	id: ScriptLanguageId,
	force = false,
): Promise<ScriptBinary | null> {
	if (!force) {
		const known = get(_binaries)[id];
		if (known !== undefined) return known;
		const pending = inFlight.get(id);
		if (pending) return pending;
	}

	const spec = SCRIPT_LANGUAGES[id];
	const search = (async () => {
		try {
			const found = await invoke<ScriptBinary | null>('find_script_binary', {
				language: id,
				names: spec.binaries,
				versionArg: spec.versionArg,
			});
			_binaries.update(m => ({ ...m, [id]: found ?? null }));
			return found ?? null;
		} catch {
			// Not running inside Tauri (browser dev), or the lookup failed.
			// Treated as "not found", which is the safe answer: the prompt
			// explains rather than the REPL failing to start with no reason.
			_binaries.update(m => ({ ...m, [id]: null }));
			return null;
		} finally {
			inFlight.delete(id);
		}
	})();

	inFlight.set(id, search);
	return search;
}

/**
 * The interpreter for `id`, opening the install prompt when there is none.
 * Returns null in that case, so the caller simply does not start a session.
 */
export async function requireScriptLanguage(
	id: ScriptLanguageId,
): Promise<ScriptBinary | null> {
	const found = await detectScriptLanguage(id);
	if (!found) openScriptInstallPrompt(id);
	return found;
}

/** True once a language has been looked for and found. */
export const rInstalled = derived(_binaries, $b => !!$b.r);
export const pythonInstalled = derived(_binaries, $b => !!$b.python);
