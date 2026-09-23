import {
  drillDownHref,
  landscapeHref,
} from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import { useApp } from "./app";

/**
 * Opening and closing per-position variant browsers.
 *
 * Every write here lands in `BlockData` UI state only — it reaches neither `args` nor
 * `prerunArgs` — so browsing into a substitution never makes the block stale and no Run button
 * appears. The workflow already precomputed the drill-down for every cell.
 */
export function useDrillDowns() {
  const app = useApp();

  /**
   * Open the browser for one substitution, or jump to it when it is already open — clicking the
   * same cell twice must not leave two identical sections behind.
   *
   * @param scoreKey the score whose map this was opened from, so the drill-down keeps measuring
   *        what the user was looking at
   */
  function open(mutationId: string, scoreKey: string) {
    const already = app.model.data.drillDowns.some((d) => d.mutationId === mutationId);
    if (!already) {
      // Replace the array rather than pushing: the model's `.sections()` reads it, and a whole
      // new value is what makes that recompute.
      app.model.data.drillDowns = [
        ...app.model.data.drillDowns,
        // No chart or table state per entry: one of each is shared across drill-downs, so an
        // open costs ~100 bytes of block data rather than ~11 KB.
        { mutationId, scoreKey, tab: "heatmap" },
      ];
    }
    app.navigateTo(drillDownHref(mutationId));
  }

  /** Close one browser and leave for the neighbour it sat next to, or the landscape. */
  function close(mutationId: string) {
    const remaining = app.model.data.drillDowns.filter((d) => d.mutationId !== mutationId);
    app.model.data.drillDowns = remaining;
    const last = remaining[remaining.length - 1];
    if (last) {
      // Hand the model straight to the substitution we are switching to. Blanking it first
      // costs a visible round trip: `drillDownTable` reads `activeDrillDown` directly, so an
      // undefined one is a settled `undefined` — the table drops to its not-ready state
      // ("Select score columns in Settings, then Run"), throws away its columns and data
      // source, and has to rebuild from nothing once the route lands and the page writes the
      // new id back.
      if (app.model.data.activeDrillDown === mutationId) {
        app.model.data.activeDrillDown = last.mutationId;
      }
      app.navigateTo(drillDownHref(last.mutationId));
      return;
    }
    // Nothing left to show, so the model genuinely has no active substitution.
    if (app.model.data.activeDrillDown === mutationId) {
      app.model.data.activeDrillDown = undefined;
    }
    // No drill-downs left, so fall back to a landscape page. Not to "/": once a run has produced
    // scores, every landscape page is `/?score=...` and "/" is not a listed section at all, so
    // leaving on it selects nothing in the sidebar. "/" is only right before the first run.
    const panels = app.model.outputs.landscapePanels ?? [];
    app.navigateTo(panels.length > 0 ? landscapeHref(panels[0].key) : "/");
  }

  return { open, close };
}
