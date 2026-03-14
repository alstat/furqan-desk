import { writable } from "svelte/store";

const TOUR_KEY = "ayahlab-tour-seen";

export const tourActive = writable(false);
export const donationOpen = writable(false);

export function checkFirstRun() {
  if (!localStorage.getItem(TOUR_KEY)) {
    tourActive.set(true);
  }
}

export function completeTour() {
  localStorage.setItem(TOUR_KEY, "true");
  tourActive.set(false);
}

export function restartTour() {
  localStorage.removeItem(TOUR_KEY);
  tourActive.set(true);
}
