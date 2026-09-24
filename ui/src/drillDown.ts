import {
  drillDownHref,
  landscapeHref,
} from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import { watch } from "vue";
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
   * Drop drill-downs the current results can no longer serve.
   *
   * An open entry is a substitution plus the score it is measured on, and both can stop existing
   * under the block: deselect that score, or move the plot to another parent, and the section
   * stays in the sidebar pointing at a page with an empty table and a map with no value column.
   *
   * Pruned on positive evidence only, never on its absence. `landscapePanels` is `undefined`
   * while the outputs are not ready and `[]` before any score has produced data, and treating
   * either as "your score is gone" would throw the user's open browsers away every time a run
   * starts. Same for the parent: an entry that recorded none, or a block that currently has none
   * selected, is left alone.
   *
   * No navigation from here. This runs in whatever page happens to be mounted, which is usually
   * not the pruned one, and yanking the route from under someone reading a different page is
   * worse than the stale section it would fix. `DrillDownPage` redirects itself when its own
   * entry disappears.
   */
  watch(
    [() => app.model.outputs.landscapePanels, () => app.model.data.selectedParentId],
    ([panels, parentId]) => {
      const open = app.model.data.drillDowns;
      if (open.length === 0) return;

      const scoreKeys =
        panels !== undefined && panels.length > 0 ? new Set(panels.map((p) => p.key)) : undefined;

      const kept = open.filter((d) => {
        if (d.parentId !== undefined && parentId !== undefined && d.parentId !== parentId) {
          return false;
        }
        if (scoreKeys !== undefined && !scoreKeys.has(d.scoreKey)) return false;
        return true;
      });

      // Guarded, and `drillDowns` is read untracked above: the write cannot retrigger this.
      if (kept.length === open.length) return;
      app.model.data.drillDowns = kept;
    },
    { immediate: true },
  );

  /**
   * Open the browser for one substitution, or jump to it when it is already open — clicking the
   * same cell twice must not leave two identical sections behind.
   *
   * @param scoreKey the score whose map this was opened from, so the drill-down keeps measuring
   *        what the user was looking at
   */
  function open(mutationId: string, scoreKey: string) {
    // Tell the model which substitution is active now, in the same write that adds the section,
    // rather than leaving it to the page's on-mount watcher a route change later. One round trip
    // earlier, and on a block whose very first drill-down this is, one fewer pass through the
    // undefined state that `close` now avoids.
    app.model.data.activeDrillDown = mutationId;

    const already = app.model.data.drillDowns.some((d) => d.mutationId === mutationId);
    if (!already) {
      // Replace the array rather than pushing: the model's `.sections()` reads it, and a whole
      // new value is what makes that recompute.
      app.model.data.drillDowns = [
        ...app.model.data.drillDowns,
        // No chart or table state per entry: one of each is shared across drill-downs, so an
        // open costs ~100 bytes of block data rather than ~11 KB.
        {
          mutationId,
          scoreKey,
          parentId: app.model.data.selectedParentId,
          tab: "heatmap",
        },
      ];
    }
    app.navigateTo(drillDownHref(mutationId));
  }

  /**
   * Leave for the last browser still open, or for a landscape when none is.
   *
   * Not to "/": once a run has produced scores, every landscape page is `/?score=...` and "/" is
   * not a listed section at all, so leaving on it selects nothing in the sidebar. "/" is only
   * right before the first run.
   *
   * Lives here rather than in the page because the page's `useApp` is typed to its own href
   * shape and cannot navigate to a landscape one.
   */
  function leave() {
    const open = app.model.data.drillDowns;
    const last = open[open.length - 1];
    if (last) {
      app.navigateTo(drillDownHref(last.mutationId));
      return;
    }
    const panels = app.model.outputs.landscapePanels ?? [];
    app.navigateTo(panels.length > 0 ? landscapeHref(panels[0].key) : "/");
  }

  /** Close one browser and leave for the neighbour it sat next to, or the landscape. */
  function close(mutationId: string) {
    const remaining = app.model.data.drillDowns.filter((d) => d.mutationId !== mutationId);
    app.model.data.drillDowns = remaining;
    // Hand the model straight to the substitution we are switching to, and when there is none
    // left, leave the field naming the one just closed rather than blanking it.
    //
    // `drillDownTable` is the only reader, and it returns nothing for an undefined id — which
    // tears the whole table down: model output, columns, data source. Rebuilding that is the
    // multi-second cold start behind the not-ready placeholder on the next drill-down opened,
    // because a freshly mounted grid shows that overlay until its first rows arrive. Recomputing
    // from one live table to another does not go through that state, so the grid fills before
    // the overlay is perceptible.
    //
    // A stale id costs nothing: no section lists it, no page renders it, and `.sections()` does
    // not read it. The model simply keeps one table spec warm for a page nobody is on.
    const next = remaining[remaining.length - 1];
    if (next !== undefined && app.model.data.activeDrillDown === mutationId) {
      app.model.data.activeDrillDown = next.mutationId;
    }
    leave();
  }

  return { open, close, leave };
}
