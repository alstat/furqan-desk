import { writable } from "svelte/store";
import { animationChoiceMade } from "./animations.store";

const TOUR_KEY = "ayahlab-tour-seen";

export const tourActive = writable(false);
export const donationOpen = writable(false);
/** The one-question animation prompt that follows the first-run tour. */
export const animationPromptOpen = writable(false);

/**
 * True only for the tour a fresh install opens by itself. A tour restarted
 * from Settings ends without asking anything — the question it asks lives in
 * Settings, where that user already is.
 */
let firstRun = false;

export function checkFirstRun() {
  if (!localStorage.getItem(TOUR_KEY)) {
    firstRun = true;
    tourActive.set(true);
  }
}

export function completeTour() {
  localStorage.setItem(TOUR_KEY, "true");
  tourActive.set(false);
  // Skipping the tour still counts as reaching the end of first-run setup.
  if (firstRun) {
    firstRun = false;
    if (!animationChoiceMade()) animationPromptOpen.set(true);
  }
}

export function restartTour() {
  localStorage.removeItem(TOUR_KEY);
  tourActive.set(true);
}
