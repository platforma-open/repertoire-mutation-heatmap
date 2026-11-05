import { computed, ref } from "vue";

/** How to read a map whose opacity is bound to the score's error. Shown on every map that has one. */
export const ERROR_NOTICE =
  "Cell opacity shows the measurement error. Faint cells have a larger error, solid cells a smaller one. Cells without an error estimate are drawn solid.";

// Scores whose notice the user closed. Module memory rather than `data`: closing it is view-local,
// costs no write to the backend, and the notice comes back after a reload.
const closedFor = ref<string[]>([]);

/**
 * The notice's open state for one score, shared by that score's landscape and drill-down pages.
 * Keyed by score, because one page instance serves every score and a single flag would stay closed
 * across all of them.
 */
export function useErrorNotice(scoreKey: () => string | undefined) {
  return computed({
    get: () => {
      const key = scoreKey();
      return key !== undefined && !closedFor.value.includes(key);
    },
    set: (open: boolean) => {
      const key = scoreKey();
      if (!open && key !== undefined && !closedFor.value.includes(key)) {
        closedFor.value = [...closedFor.value, key];
      }
    },
  });
}
