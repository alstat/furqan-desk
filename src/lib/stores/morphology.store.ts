import { writable, type Writable } from 'svelte/store';

export const morphFontFamily: Writable<string> = writable('font-scheherazade');
export const morphFontSize: Writable<string> = writable('text-xl');
