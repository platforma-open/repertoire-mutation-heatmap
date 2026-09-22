import {
  drillDownHref,
  makeDrillDownChartState,
  withParentOnXAxis,
} from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import { describe, expect, test } from "vitest";

/** Only the parts of a saved chart this migration reads, so the test needs no graph-maker. */
type GraphMakerState = Parameters<typeof withParentOnXAxis>[0];

/** Source ids exactly as a saved chart carries them. */
const POSITION =
  '{"domain":{"pl7.app/alphabet":"aminoacid","pl7.app/repertoire/numbering":"naive"},"kind":"axis","name":"pl7.app/repertoire/position","type":"String"}';
const REGION =
  '{"kind":"column","name":"{\\"name\\":\\"region/region\\",\\"resolvePath\\":[\\"main\\",\\"singleMutantHeatmapPf\\"]}","type":"String"}';
const PARENT =
  '{"kind":"column","name":"{\\"name\\":\\"parent/parentResidue\\",\\"resolvePath\\":[\\"main\\",\\"singleMutantHeatmapPf\\"]}","type":"String"}';
const PARENT_FLAG =
  '{"kind":"column","name":"{\\"name\\":\\"parentFlag/isParentResidue\\",\\"resolvePath\\":[\\"main\\",\\"singleMutantHeatmapPf\\"]}","type":"Int"}';

const savedChart = (annotationsX: string[], x: string[] = [POSITION]): GraphMakerState =>
  ({
    title: "Gate rank mean (7.5)",
    template: "heatmap",
    optionsState: {
      type: "heatmap",
      components: {
        value: { type: "simple", selectorStates: [] },
        x: { type: "simple", selectorStates: x.map((selectedSource) => ({ selectedSource })) },
        y: { type: "simple", selectorStates: [] },
        xGroupBy: { type: "simple", selectorStates: [] },
        yGroupBy: { type: "simple", selectorStates: [] },
        filters: { type: "filter", selectorStates: [] },
        tabBy: { type: "filter", selectorStates: [] },
        facetBy: { type: "simple", selectorStates: [] },
        annotationsX: {
          type: "simple",
          selectorStates: annotationsX.map((selectedSource) => ({ selectedSource })),
        },
        annotationsY: { type: "simple", selectorStates: [] },
        xSortBy: { type: "simple", selectorStates: [] },
        ySortBy: { type: "simple", selectorStates: [] },
        tooltipContent: { type: "simple", selectorStates: [] },
        highlight: { type: "filter", selectorStates: [] },
      },
      dividedAxes: {},
    },
    axesSettings: { axisX: { cellSize: 20 } },
  }) as unknown as GraphMakerState;

const sourcesOf = (state: GraphMakerState, input: "x" | "annotationsX") =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (
    (state.optionsState as any).components[input].selectorStates as { selectedSource: string }[]
  ).map((s) => s.selectedSource);

describe("withParentOnXAxis", () => {
  test("moves the parent residue onto X, after position, and leaves the region track", () => {
    const migrated = withParentOnXAxis(savedChart([REGION, PARENT]));

    expect(sourcesOf(migrated, "x")).toEqual([POSITION, PARENT]);
    expect(sourcesOf(migrated, "annotationsX")).toEqual([REGION]);
    expect(migrated.axesSettings?.axisX?.axisLabelsAngle).toBe(45);
    // the settings it did not come to change are untouched
    expect(migrated.axesSettings?.axisX?.cellSize).toBe(20);
  });

  test("leaves a chart with no parent track alone, angle included", () => {
    const before = savedChart([REGION]);
    const migrated = withParentOnXAxis(before);

    expect(sourcesOf(migrated, "annotationsX")).toEqual([REGION]);
    // A single-part label gains nothing from being tilted.
    expect(migrated.axesSettings?.axisX?.axisLabelsAngle).toBeUndefined();
  });

  test("is idempotent: running twice does not add the source twice", () => {
    const once = withParentOnXAxis(savedChart([REGION, PARENT]));
    const twice = withParentOnXAxis(once);

    expect(sourcesOf(twice, "x")).toEqual([POSITION, PARENT]);
  });

  test("does not mistake the highlight flag for the parent track", () => {
    // `parentFlag/isParentResidue` contains the same word; only the track must move.
    const migrated = withParentOnXAxis(savedChart([REGION, PARENT_FLAG]));

    expect(sourcesOf(migrated, "x")).toEqual([POSITION]);
    expect(sourcesOf(migrated, "annotationsX")).toEqual([REGION, PARENT_FLAG]);
  });
});

describe("drillDownHref", () => {
  test("is the route the app registers, with the designator in the query", () => {
    expect(drillDownHref("A5C")).toBe("/drilldown?m=A5C");
  });

  test("escapes a designator that would otherwise break the query string", () => {
    // The gap and stop residues are real states on the Y axis, and `*` and `-` are clickable
    // cells like any other — so they reach this function.
    expect(drillDownHref("A5*")).toBe("/drilldown?m=A5*");
    expect(decodeURIComponent(drillDownHref("A5-").split("=")[1])).toBe("A5-");
  });
});

describe("makeDrillDownChartState", () => {
  test("keeps uncovered cells empty rather than painting them as zeros", () => {
    // A partner map is sparse by construction: most (position, residue) pairs were never
    // observed as a double mutant. Treating those as 0 would fill the map with pairs nobody
    // measured — the same trap the landscape already avoids.
    expect(makeDrillDownChartState("A5C").layersSettings?.heatmap?.NAValueAs).toBeNull();
  });

  test("opens without the Settings drawer — the drill-down has nothing to configure", () => {
    expect(makeDrillDownChartState("A5C").currentTab).toBeNull();
  });
});
