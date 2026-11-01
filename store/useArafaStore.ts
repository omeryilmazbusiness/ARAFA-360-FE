import { create } from "zustand";

type ArafaState = {
  /** True while the automatic cinematic camera owns the view. */
  cinematicMode: boolean;
  /** True between 06:00 and 18:00 Arafat time (from `getSkyState().isDay`). Drives the HUD palette. */
  isDay: boolean;
  /** Hands the camera over to the user (stops the cinematic sequence). */
  takeControl: () => void;
  /** Gives the camera back to the cinematic sequence. */
  resumeCinematic: () => void;
  setIsDay: (isDay: boolean) => void;
  /** Instance id (= index in BLUEPRINT_LAYOUT) of the selected tent, or null. */
  selectedTentId: number | null;
  selectTent: (id: number | null) => void;
};

export const useArafaStore = create<ArafaState>((set) => ({
  cinematicMode: true,
  // Placeholder until DayNightRig reports the real value on its first effect.
  isDay: true,
  takeControl: () => set({ cinematicMode: false }),
  resumeCinematic: () => set({ cinematicMode: true }),
  // Bail out when unchanged so the 10 s clock tick never re-renders subscribers.
  setIsDay: (isDay) => set((s) => (s.isDay === isDay ? s : { isDay })),
  selectedTentId: null,
  selectTent: (id) => set((s) => (s.selectedTentId === id ? s : { selectedTentId: id })),
}));
