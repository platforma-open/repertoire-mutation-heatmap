import {
  drillDownHref,
  makeDrillDownChartState,
} from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import { createPlDataTableStateV2 } from "@platforma-sdk/model";
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
        {
          mutationId,
          scoreKey,
          tab: "heatmap",
          heatmapState: makeDrillDownChartState(),
          tableState: createPlDataTableStateV2(),
        },
      ];
    }
    app.navigateTo(drillDownHref(mutationId));
  }

  /** Close one browser and leave for the neighbour it sat next to, or the landscape. */
  function close(mutationId: string) {
    const remaining = app.model.data.drillDowns.filter((d) => d.mutationId !== mutationId);
    app.model.data.drillDowns = remaining;
    if (app.model.data.activeDrillDown === mutationId) {
      app.model.data.activeDrillDown = undefined;
    }
    const last = remaining[remaining.length - 1];
    app.navigateTo(last ? drillDownHref(last.mutationId) : "/");
  }

  return { open, close };
}
