/**
 * The script languages the app runs: Julia, R and Python.
 *
 * Each is a file type with an editor, a REPL beside it, a toolchain the user
 * may not have installed yet, and plots that come back from a running session.
 * Julia came first and its behaviour is spread across a dozen files that name
 * it directly; R and Python are described here instead, as data, so the pieces
 * they share — detection, labelling, the REPL banner, the install prompt, the
 * binaries to look for — are written once rather than three times.
 *
 * Julia is listed too, so that anything generic over "a script language" can
 * treat all three alike. Its dedicated modules still own its structured REPL
 * protocol, which predates this and is richer than what R and Python need.
 */

/** The tab types that carry a runnable script. */
export type ScriptLanguageId = 'julia' | 'r' | 'python';

export interface ScriptLanguageSpec {
	id: ScriptLanguageId;
	/** Shown in menus, the REPL header and install prompts. */
	label: string;
	/** Extension a new, unsaved file of this kind is saved with. */
	defaultExtension: string;
	/** Every extension that opens as this type, lower-cased, no dot. */
	extensions: string[];
	/** Iconify name, matching what the tab strip and new-file menu use. */
	icon: string;
	/** CodeMirror grammar id — see `$lib/codemirror/languages`. */
	grammar: string;
	/** Line-comment token, used by the editor's comment command. */
	lineComment: string;
	/**
	 * Executables to look for on PATH, in order of preference. R ships as `R`;
	 * Python is `python3` on macOS/Linux and `python` on Windows, and a `py`
	 * launcher is common on Windows too.
	 */
	binaries: string[];
	/** Argument that makes the binary print its version and exit. */
	versionArg: string;
	/** Arguments that start a plain, non-interactive-tty REPL on a pipe. */
	replArgs: string[];
	/** How the user is told to install it when it is missing. */
	install: {
		/** Where to send someone who would rather install it themselves. */
		url: string;
		/** Package managers we can drive, per platform, best first. */
		macos: string[];
		linux: string[];
		windows: string[];
	};
}

export const SCRIPT_LANGUAGES: Record<ScriptLanguageId, ScriptLanguageSpec> = {
	julia: {
		id: 'julia',
		label: 'Julia',
		defaultExtension: 'jl',
		extensions: ['jl'],
		icon: 'devicon-plain:julia',
		grammar: 'julia',
		lineComment: '#',
		binaries: ['julia'],
		versionArg: '--version',
		replArgs: ['--startup-file=no', '-i'],
		install: {
			url: 'https://julialang.org/downloads/',
			macos: ['juliaup'],
			linux: ['juliaup'],
			windows: ['juliaup'],
		},
	},
	r: {
		id: 'r',
		label: 'R',
		defaultExtension: 'R',
		// `.r` as well as `.R`: the language's own convention is capital, but
		// plenty of files in the wild are lower-case, and `.rmd` is R Markdown.
		extensions: ['r', 'rmd'],
		icon: 'simple-icons:r',
		grammar: 'r',
		lineComment: '#',
		binaries: ['R'],
		versionArg: '--version',
		// `--no-save` so quitting never stops to ask about the workspace;
		// `--quiet` drops the startup banner, which the pane prints itself.
		// `--no-readline` because on a pipe R's line editor echoes every line it
		// reads back to stdout — the session's own startup code included — and the
		// pane has already drawn what the user typed (see `replArgsFor`).
		replArgs: ['--no-save', '--quiet', '--no-readline', '--interactive'],
		install: {
			url: 'https://cran.r-project.org/',
			macos: ['brew'],
			linux: ['apt', 'dnf', 'pacman'],
			windows: ['winget'],
		},
	},
	python: {
		id: 'python',
		label: 'Python',
		defaultExtension: 'py',
		extensions: ['py', 'pyw'],
		icon: 'simple-icons:python',
		grammar: 'python',
		lineComment: '#',
		binaries: ['python3', 'python', 'py'],
		versionArg: '--version',
		// `-u` keeps stdout unbuffered, so output reaches the pane as it is
		// produced rather than in blocks when the buffer happens to flush; `-q`
		// drops the version banner, as R's `--quiet` does.
		replArgs: ['-u', '-q', '-i'],
		install: {
			url: 'https://www.python.org/downloads/',
			macos: ['brew'],
			linux: ['apt', 'dnf', 'pacman'],
			windows: ['winget'],
		},
	},
};

/** Every script language, in the order they should appear in a menu. */
export const SCRIPT_LANGUAGE_LIST: ScriptLanguageSpec[] = [
	SCRIPT_LANGUAGES.julia,
	SCRIPT_LANGUAGES.r,
	SCRIPT_LANGUAGES.python,
];

/** Whether a tab type is one of the runnable script languages. */
export function isScriptLanguage(type: string | undefined): type is ScriptLanguageId {
	return type === 'julia' || type === 'r' || type === 'python';
}

/** The spec for a tab type, or null when it is not a script language. */
export function scriptLanguageFor(type: string | undefined): ScriptLanguageSpec | null {
	return isScriptLanguage(type) ? SCRIPT_LANGUAGES[type] : null;
}

const BY_EXTENSION = new Map<string, ScriptLanguageId>(
	SCRIPT_LANGUAGE_LIST.flatMap(spec =>
		spec.extensions.map(ext => [ext, spec.id] as const),
	),
);

/** The script language a file name belongs to, or null for anything else. */
export function scriptLanguageForFile(pathOrName: string): ScriptLanguageId | null {
	const ext = pathOrName.split('.').pop()?.toLowerCase() ?? '';
	return BY_EXTENSION.get(ext) ?? null;
}

/**
 * The arguments to start `language`'s session with, on this platform.
 *
 * `--no-readline` is the Unix front end's option: Rterm has no readline to turn
 * off and would start with a `WARNING: unknown option` line in the transcript,
 * so Windows gets the list without it — and needs nothing in its place, since
 * the echo it removes is readline's doing.
 */
export function replArgsFor(language: ScriptLanguageId): string[] {
	const args = SCRIPT_LANGUAGES[language].replArgs;
	const windows =
		typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent);
	return windows ? args.filter(arg => arg !== '--no-readline') : args;
}
