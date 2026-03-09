import { writable, type Writable } from 'svelte/store';
import type { LexicalEditor } from 'lexical';

export const typstMode:             Writable<boolean>            = writable(false);
export const typstSource:           Writable<string>             = writable('');
export const lexicalSnapshot:       Writable<string | null>      = writable(null);
export const lexicalEditorInstance: Writable<LexicalEditor | null> = writable(null);
/** Increment to force TypstEditor to recompile without changing the source. */
export const typstRecompile:        Writable<number>             = writable(0);

/** Shared compile output — written by TypstEditor, read by TypstPreview. */
export const typstSvgPages:     Writable<string[]> = writable([]);
export const typstCompileError: Writable<string>   = writable('');
export const typstIsCompiling:  Writable<boolean>  = writable(false);
