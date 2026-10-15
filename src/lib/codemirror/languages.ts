/**
 * Syntax modes for arbitrary flat files.
 *
 * Julia, Lean and Typst have hand-written languages of their own (see the
 * sibling modules) because the app reasons about their syntax beyond
 * highlighting — go-to-definition, cell splitting, include tracking. Every
 * other text file the user can open is served from here: a table from file
 * extension to one of the CodeMirror legacy stream modes, the way VS Code and
 * Zed pick a grammar from the file name.
 *
 * The modes come from `@codemirror/legacy-modes`, which is already a
 * dependency. They are imported eagerly rather than behind `import()`: each is
 * a few kilobytes of plain tables, and a desktop app pays for them once at
 * startup instead of flashing unhighlighted text every time a file is opened.
 */

import { StreamLanguage, type StreamParser } from '@codemirror/language';
import type { Extension } from '@codemirror/state';

import { c, cpp, csharp, java, kotlin, objectiveC, scala, dart } from '@codemirror/legacy-modes/mode/clike';
import { clojure } from '@codemirror/legacy-modes/mode/clojure';
import { cmake } from '@codemirror/legacy-modes/mode/cmake';
import { coffeeScript } from '@codemirror/legacy-modes/mode/coffeescript';
import { commonLisp } from '@codemirror/legacy-modes/mode/commonlisp';
import { crystal } from '@codemirror/legacy-modes/mode/crystal';
import { css, sCSS, less } from '@codemirror/legacy-modes/mode/css';
import { diff } from '@codemirror/legacy-modes/mode/diff';
import { dockerFile } from '@codemirror/legacy-modes/mode/dockerfile';
import { elm } from '@codemirror/legacy-modes/mode/elm';
import { erlang } from '@codemirror/legacy-modes/mode/erlang';
import { fortran } from '@codemirror/legacy-modes/mode/fortran';
import { gas } from '@codemirror/legacy-modes/mode/gas';
import { go } from '@codemirror/legacy-modes/mode/go';
import { groovy } from '@codemirror/legacy-modes/mode/groovy';
import { haskell } from '@codemirror/legacy-modes/mode/haskell';
import { http } from '@codemirror/legacy-modes/mode/http';
import { javascript, json, typescript } from '@codemirror/legacy-modes/mode/javascript';
import { lua } from '@codemirror/legacy-modes/mode/lua';
import { oCaml, fSharp, sml } from '@codemirror/legacy-modes/mode/mllike';
import { nginx } from '@codemirror/legacy-modes/mode/nginx';
import { octave } from '@codemirror/legacy-modes/mode/octave';
import { pascal } from '@codemirror/legacy-modes/mode/pascal';
import { perl } from '@codemirror/legacy-modes/mode/perl';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { properties } from '@codemirror/legacy-modes/mode/properties';
import { protobuf } from '@codemirror/legacy-modes/mode/protobuf';
import { python } from '@codemirror/legacy-modes/mode/python';
import { r } from '@codemirror/legacy-modes/mode/r';
import { ruby } from '@codemirror/legacy-modes/mode/ruby';
import { rust } from '@codemirror/legacy-modes/mode/rust';
import { sas } from '@codemirror/legacy-modes/mode/sas';
import { scheme } from '@codemirror/legacy-modes/mode/scheme';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { standardSQL, mySQL, pgSQL, sqlite } from '@codemirror/legacy-modes/mode/sql';
import { stex } from '@codemirror/legacy-modes/mode/stex';
import { stylus } from '@codemirror/legacy-modes/mode/stylus';
import { swift } from '@codemirror/legacy-modes/mode/swift';
import { tcl } from '@codemirror/legacy-modes/mode/tcl';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { turtle } from '@codemirror/legacy-modes/mode/turtle';
import { vb } from '@codemirror/legacy-modes/mode/vb';
import { verilog } from '@codemirror/legacy-modes/mode/verilog';
import { vhdl } from '@codemirror/legacy-modes/mode/vhdl';
import { xml, html } from '@codemirror/legacy-modes/mode/xml';
import { yaml } from '@codemirror/legacy-modes/mode/yaml';
import { markdown } from './markdown';

/** Line/block comment tokens, handed to CodeMirror's comment commands. */
export interface CommentTokens {
	line?: string;
	block?: { open: string; close: string };
}

export interface LanguageSpec {
	/** Stable id, also what the status bar shows when there is no nicer label. */
	id: string;
	label: string;
	parser: StreamParser<unknown>;
	comment?: CommentTokens;
	/** Code languages spell-check only comments and strings; prose checks all. */
	prose?: boolean;
}

const SLASH: CommentTokens = { line: '//', block: { open: '/*', close: '*/' } };
const HASH: CommentTokens = { line: '#' };
const DASH: CommentTokens = { line: '--' };
const SEMI: CommentTokens = { line: ';' };

/** Every mode this app knows, keyed by its own id. */
const SPECS: LanguageSpec[] = [
	{ id: 'c', label: 'C', parser: c, comment: SLASH },
	{ id: 'cpp', label: 'C++', parser: cpp, comment: SLASH },
	{ id: 'csharp', label: 'C#', parser: csharp, comment: SLASH },
	{ id: 'java', label: 'Java', parser: java, comment: SLASH },
	{ id: 'kotlin', label: 'Kotlin', parser: kotlin, comment: SLASH },
	{ id: 'objective-c', label: 'Objective-C', parser: objectiveC, comment: SLASH },
	{ id: 'scala', label: 'Scala', parser: scala, comment: SLASH },
	{ id: 'dart', label: 'Dart', parser: dart, comment: SLASH },
	{ id: 'clojure', label: 'Clojure', parser: clojure, comment: SEMI },
	{ id: 'cmake', label: 'CMake', parser: cmake, comment: HASH },
	{ id: 'coffeescript', label: 'CoffeeScript', parser: coffeeScript, comment: HASH },
	{ id: 'commonlisp', label: 'Common Lisp', parser: commonLisp, comment: SEMI },
	{ id: 'crystal', label: 'Crystal', parser: crystal, comment: HASH },
	{ id: 'css', label: 'CSS', parser: css, comment: { block: { open: '/*', close: '*/' } } },
	{ id: 'scss', label: 'SCSS', parser: sCSS, comment: SLASH },
	{ id: 'less', label: 'Less', parser: less, comment: SLASH },
	{ id: 'stylus', label: 'Stylus', parser: stylus, comment: SLASH },
	{ id: 'diff', label: 'Diff', parser: diff, prose: true },
	{ id: 'dockerfile', label: 'Dockerfile', parser: dockerFile, comment: HASH },
	{ id: 'elm', label: 'Elm', parser: elm, comment: DASH },
	{ id: 'erlang', label: 'Erlang', parser: erlang, comment: { line: '%' } },
	{ id: 'fortran', label: 'Fortran', parser: fortran, comment: { line: '!' } },
	{ id: 'asm', label: 'Assembly', parser: gas, comment: HASH },
	{ id: 'go', label: 'Go', parser: go, comment: SLASH },
	{ id: 'groovy', label: 'Groovy', parser: groovy, comment: SLASH },
	{ id: 'haskell', label: 'Haskell', parser: haskell, comment: DASH },
	{ id: 'http', label: 'HTTP', parser: http, prose: true },
	{ id: 'javascript', label: 'JavaScript', parser: javascript, comment: SLASH },
	{ id: 'typescript', label: 'TypeScript', parser: typescript, comment: SLASH },
	{ id: 'json', label: 'JSON', parser: json },
	{ id: 'lua', label: 'Lua', parser: lua, comment: DASH },
	{ id: 'markdown', label: 'Markdown', parser: markdown, prose: true },
	{ id: 'ocaml', label: 'OCaml', parser: oCaml, comment: { block: { open: '(*', close: '*)' } } },
	{ id: 'fsharp', label: 'F#', parser: fSharp, comment: SLASH },
	{ id: 'sml', label: 'Standard ML', parser: sml, comment: { block: { open: '(*', close: '*)' } } },
	{ id: 'nginx', label: 'Nginx', parser: nginx, comment: HASH },
	{ id: 'matlab', label: 'MATLAB/Octave', parser: octave, comment: { line: '%' } },
	{ id: 'pascal', label: 'Pascal', parser: pascal, comment: SLASH },
	{ id: 'perl', label: 'Perl', parser: perl, comment: HASH },
	{ id: 'powershell', label: 'PowerShell', parser: powerShell, comment: HASH },
	{ id: 'ini', label: 'INI', parser: properties, comment: HASH },
	{ id: 'protobuf', label: 'Protocol Buffers', parser: protobuf, comment: SLASH },
	{ id: 'python', label: 'Python', parser: python, comment: HASH },
	{ id: 'r', label: 'R', parser: r, comment: HASH },
	{ id: 'ruby', label: 'Ruby', parser: ruby, comment: HASH },
	{ id: 'rust', label: 'Rust', parser: rust, comment: SLASH },
	{ id: 'sas', label: 'SAS', parser: sas, comment: { block: { open: '/*', close: '*/' } } },
	{ id: 'scheme', label: 'Scheme', parser: scheme, comment: SEMI },
	{ id: 'shell', label: 'Shell', parser: shell, comment: HASH },
	{ id: 'sql', label: 'SQL', parser: standardSQL, comment: DASH },
	{ id: 'mysql', label: 'MySQL', parser: mySQL, comment: DASH },
	{ id: 'postgresql', label: 'PostgreSQL', parser: pgSQL, comment: DASH },
	{ id: 'sqlite', label: 'SQLite', parser: sqlite, comment: DASH },
	{ id: 'latex', label: 'LaTeX', parser: stex, comment: { line: '%' }, prose: true },
	{ id: 'swift', label: 'Swift', parser: swift, comment: SLASH },
	{ id: 'tcl', label: 'Tcl', parser: tcl, comment: HASH },
	{ id: 'toml', label: 'TOML', parser: toml, comment: HASH },
	{ id: 'turtle', label: 'Turtle', parser: turtle, comment: HASH },
	{ id: 'vb', label: 'Visual Basic', parser: vb, comment: { line: "'" } },
	{ id: 'verilog', label: 'Verilog', parser: verilog, comment: SLASH },
	{ id: 'vhdl', label: 'VHDL', parser: vhdl, comment: DASH },
	{ id: 'xml', label: 'XML', parser: xml, comment: { block: { open: '<!--', close: '-->' } } },
	{ id: 'html', label: 'HTML', parser: html, comment: { block: { open: '<!--', close: '-->' } } },
	{ id: 'yaml', label: 'YAML', parser: yaml, comment: HASH },
];

const BY_ID = new Map(SPECS.map(s => [s.id, s]));

/**
 * Extension → language id. Extensions the app owns outright (`typ`, `jl`,
 * `lean`) are deliberately absent: those files never become `text` tabs.
 */
const BY_EXTENSION: Record<string, string> = {
	c: 'c', h: 'c',
	cc: 'cpp', cpp: 'cpp', cxx: 'cpp', hpp: 'cpp', hh: 'cpp', hxx: 'cpp', ino: 'cpp',
	cs: 'csharp',
	java: 'java',
	kt: 'kotlin', kts: 'kotlin',
	m: 'objective-c', mm: 'objective-c',
	scala: 'scala', sbt: 'scala',
	dart: 'dart',
	clj: 'clojure', cljs: 'clojure', cljc: 'clojure', edn: 'clojure',
	cmake: 'cmake',
	coffee: 'coffeescript',
	lisp: 'commonlisp', cl: 'commonlisp', el: 'commonlisp',
	cr: 'crystal',
	css: 'css', scss: 'scss', sass: 'scss', less: 'less', styl: 'stylus',
	diff: 'diff', patch: 'diff',
	dockerfile: 'dockerfile',
	elm: 'elm',
	erl: 'erlang', hrl: 'erlang', ex: 'erlang', exs: 'erlang',
	f: 'fortran', for: 'fortran', f90: 'fortran', f95: 'fortran', f03: 'fortran',
	s: 'asm', asm: 'asm',
	go: 'go',
	groovy: 'groovy', gradle: 'groovy',
	hs: 'haskell', lhs: 'haskell',
	http: 'http',
	js: 'javascript', mjs: 'javascript', cjs: 'javascript',
	ts: 'typescript', mts: 'typescript', cts: 'typescript',
	jsx: 'javascript', tsx: 'typescript',
	json: 'json', jsonc: 'json', json5: 'json', webmanifest: 'json',
	lua: 'lua',
	md: 'markdown', mdx: 'markdown', markdown: 'markdown', rst: 'markdown',
	svx: 'markdown',
	ml: 'ocaml', mli: 'ocaml',
	fs: 'fsharp', fsi: 'fsharp', fsx: 'fsharp',
	sml: 'sml',
	conf: 'nginx',
	octave: 'matlab',
	pas: 'pascal',
	pl: 'perl', pm: 'perl', t: 'perl',
	ps1: 'powershell', psm1: 'powershell',
	ini: 'ini', cfg: 'ini', env: 'ini', properties: 'ini', editorconfig: 'ini',
	gitignore: 'ini', gitattributes: 'ini', npmrc: 'ini',
	proto: 'protobuf',
	py: 'python', pyw: 'python', pyi: 'python',
	r: 'r', rmd: 'r',
	rb: 'ruby', rake: 'ruby', gemspec: 'ruby',
	rs: 'rust',
	sas: 'sas',
	scm: 'scheme', ss: 'scheme', rkt: 'scheme',
	sh: 'shell', bash: 'shell', zsh: 'shell', fish: 'shell', ksh: 'shell',
	sql: 'sql', pgsql: 'postgresql', mysql: 'mysql', sqlite: 'sqlite',
	tex: 'latex', sty: 'latex', cls: 'latex', bib: 'latex',
	swift: 'swift',
	tcl: 'tcl',
	toml: 'toml',
	ttl: 'turtle',
	vb: 'vb', bas: 'vb',
	v: 'verilog', sv: 'verilog', svh: 'verilog',
	vhd: 'vhdl', vhdl: 'vhdl',
	xml: 'xml', svg: 'xml', xsl: 'xml', xsd: 'xml', plist: 'xml', rss: 'xml',
	html: 'html', htm: 'html', vue: 'html', svelte: 'html',
	yaml: 'yaml', yml: 'yaml',
};

/** Files whose whole name — not extension — picks the mode, as in VS Code. */
const BY_FILENAME: Record<string, string> = {
	dockerfile: 'dockerfile',
	containerfile: 'dockerfile',
	makefile: 'shell',
	gnumakefile: 'shell',
	rakefile: 'ruby',
	gemfile: 'ruby',
	'cmakelists.txt': 'cmake',
	'.bashrc': 'shell',
	'.bash_profile': 'shell',
	'.zshrc': 'shell',
	'.profile': 'shell',
	'.gitconfig': 'ini',
	'.npmrc': 'ini',
	'.env': 'ini',
};

/** The id used when nothing matches: no grammar, prose spell checking. */
export const PLAIN_TEXT = 'plaintext';

/** VS Code-style grammar pick for a file name or full path. */
export function languageIdForFile(pathOrName: string | null | undefined): string {
	if (!pathOrName) return PLAIN_TEXT;
	const base = pathOrName.split(/[\\/]/).pop()!.toLowerCase();
	const byName = BY_FILENAME[base];
	if (byName) return byName;
	// `.env.local` and `file.spec.ts` both want the mode of their *last*
	// meaningful segment, so walk the suffixes from the longest match down.
	const parts = base.split('.');
	for (let i = 1; i < parts.length; i++) {
		const id = BY_EXTENSION[parts.slice(i).join('.')] ?? BY_EXTENSION[parts[i]];
		if (id) return id;
	}
	// A dotfile with no extension at all (`.profile`) falls back to its name.
	if (base.startsWith('.') && parts.length === 2) {
		const id = BY_EXTENSION[parts[1]];
		if (id) return id;
	}
	return PLAIN_TEXT;
}

const extensionCache = new Map<string, Extension>();

/** The CodeMirror extension for a language id; empty for unknown/plain text. */
export function languageExtension(id: string): Extension {
	const spec = BY_ID.get(id);
	if (!spec) return [];
	let ext = extensionCache.get(id);
	if (!ext) {
		const lang = StreamLanguage.define(spec.parser);
		ext = spec.comment
			? [lang, lang.data.of({ commentTokens: spec.comment })]
			: lang;
		extensionCache.set(id, ext);
	}
	return ext;
}

/** Human-readable name for the status bar / language picker. */
export function languageLabel(id: string): string {
	return BY_ID.get(id)?.label ?? 'Plain Text';
}

/** True when spell checking should stay inside comments and strings. */
export function isCodeLanguage(id: string): boolean {
	const spec = BY_ID.get(id);
	return !!spec && !spec.prose;
}

/** Every known language, for a "select language mode" menu. */
export function allLanguages(): { id: string; label: string }[] {
	return [
		{ id: PLAIN_TEXT, label: 'Plain Text' },
		...SPECS.map(s => ({ id: s.id, label: s.label })).sort((a, b) =>
			a.label.localeCompare(b.label),
		),
	];
}
