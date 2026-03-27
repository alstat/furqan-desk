import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

export const morphFontFamily: Writable<string> = writable('font-scheherazade');
export const morphFontSize: Writable<string> = writable('text-xl');

export const morphGlassEffect = writable<boolean>(
    browser ? (localStorage.getItem('morphGlassEffect') ?? 'false') !== 'false' : false
);
morphGlassEffect.subscribe(v => {
    if (browser) localStorage.setItem('morphGlassEffect', String(v));
});
