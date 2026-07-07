import { writable } from "svelte/store";

// Controls the "Verse of the Day" dialog. Lifted into a store so it can be
// opened both automatically on app launch (once per day) and on demand from
// the button beside the Take-Home Message button.
export const verseOfDayDialogOpen = writable<boolean>(false);
