<script setup lang="ts">
import type { CellClickData, PredefinedGraphOption } from "@milaboratories/graph-maker";
import { GraphMaker } from "@milaboratories/graph-maker";
import { makeLandscapeChartState } from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import { getUniqueSourceValuesWithLabels } from "@platforma-sdk/model";
import type { PObjectId } from "@platforma-sdk/model";
import { PlAlert, PlTabs } from "@platforma-sdk/ui-vue";
import { computed, ref, watch } from "vue";
import { useApp } from "./app";
import { useDrillDowns } from "./drillDown";
import Settings from "./Settings.vue";

const app = useApp();
const { open: openDrillDown } = useDrillDowns();

// One chart per score: a heatmap chart has a single colour scale, so scores in different units
// cannot share one.
//
// Only one is on screen at a time, picked by the tabs. Stacking them needs a graph-maker fix:
// it mounts every chart into a hardcoded DOM id (`chartSvgContainer`), so a second instance on
// the page lands in the first one's container. Its settings-modal teleport target and miplots4's
// tooltip lookup are shared the same way.
const panels = computed(() => app.model.outputs.landscapePanels ?? []);

const tabOptions = computed(() => panels.value.map((p) => ({ value: p.key, label: p.label })));

// Falls back to the first score when nothing is chosen, or the chosen one is gone. Read-only, so
// a dropped score costs no write to data.
const activePanel = computed(() => {
  const list = panels.value;
  const chosen = list.find((p) => p.key === app.model.data.selectedLandscapeScore);
  return chosen ?? list[0];
});

// Seed a chart's saved settings the first time it appears, so `v-model` has something to bind.
// Not a hairpin: the states reach neither args nor any output, and two clients racing here write
// the same default for the same key.
watch(
  panels,
  (list) => {
    const states = app.model.data.singleMutantHeatmapStates;
    for (const panel of list) {
      if (states[panel.key] === undefined) {
        states[panel.key] = makeLandscapeChartState(panel.label, null);
      }
    }
  },
  { immediate: true },
);

// Close the Settings drawer when a run starts. Idempotent, and currentTab does not feed back
// into isRunning, so not a hairpin.
watch(
  () => app.model.outputs.isRunning,
  (isRunning, wasRunning) => {
    if (!isRunning || wasRunning) return;
    app.model.data.singleMutantHeatmapState.currentTab = null;
    for (const state of Object.values(app.model.data.singleMutantHeatmapStates)) {
      state.currentTab = null;
    }
  },
);

// Region track under the position (X) axis, position-keyed, so it serves every score. Only when the
// profiler supplied a region scheme.
const regionOption = computed((): PredefinedGraphOption<"heatmap">[] => {
  const regionCol = app.model.outputs.singleMutantHeatmapPCols?.find(
    (p) => p.spec.name === "pl7.app/repertoire/regionAnnotation",
  );
  return regionCol ? [{ inputName: "annotationsX", selectedSource: regionCol.spec }] : [];
});

// Parent residue as the second part of the X axis label rather than a track beneath it, so each
// column reads "32, D" — the position and the residue it started as. It is position-keyed, and
// position is already the first X source, so the heatmap accepts it as an X source too.
const parentAxisOption = computed((): PredefinedGraphOption<"heatmap">[] => {
  const parentCol = app.model.outputs.singleMutantHeatmapPCols?.find(
    (p) => p.spec.name === "pl7.app/repertoire/parentResidue",
  );
  return parentCol ? [{ inputName: "x", selectedSource: parentCol.spec }] : [];
});

// How many multi-mutants carry this substitution, in the tooltip beside the score. The map has
// one visual channel and the score already owns it, so until miplots4 grows a glyph overlay the
// hover is the only place this can be said — and it is what tells the user whether browsing into
// a cell would hold anything before they spend the click. Worth showing for its own sake too: it
// says how well a substitution has been explored in combination.
const coOccurrenceOption = computed((): PredefinedGraphOption<"heatmap">[] => {
  const col = app.model.outputs.singleMutantHeatmapPCols?.find(
    (p) => p.spec.name === "pl7.app/repertoire/coOccurringVariants",
  );
  return col ? [{ inputName: "tooltipContent", selectedSource: col.spec }] : [];
});

// --- Browsing into a substitution ---
//
// A click on a cell opens the per-position variant browser for the substitution it names. The
// cell gives a position and a residue; the parent residue at that position is the third part, and
// it is already on the X axis as the second label part — so graph-maker hands back both X sources
// and the designator is composed from them without a lookup.
//
// The workflow builds `mutationId` the same way (parent residue, position, state), and the two
// must stay byte-identical: it is the axis value the drill-down's chart is pinned to.
const POSITION_AXIS = "pl7.app/repertoire/position";
const PARENT_RESIDUE = "pl7.app/repertoire/parentResidue";

/** Substitutions worth opening — the ones with at least one co-occurring variant. */
const browsable = ref<Set<string>>(new Set());
/** The enumeration above is async; until it settles an empty set means "not known yet". */
const browsableLoaded = ref(false);
watch(
  () => ({
    pframe: app.model.outputs.browsableMutationsPf,
    colId: app.model.outputs.browsableMutationsColId,
  }),
  async ({ pframe, colId }) => {
    if (!pframe || !colId) {
      browsable.value = new Set();
      browsableLoaded.value = false;
      return;
    }
    try {
      const res = await getUniqueSourceValuesWithLabels(pframe, {
        columnId: colId as PObjectId,
        axisIdx: 0,
      });
      browsable.value = new Set(res.values.map((v) => v.value));
      browsableLoaded.value = true;
    } catch {
      browsable.value = new Set();
      browsableLoaded.value = false;
    }
  },
  { immediate: true },
);

/**
 * True once the map has drawn and not one substitution in it appears inside a multi-mutant.
 *
 * Without this the block looks broken rather than empty: every cell's tooltip reads
 * "Co-occurring variants 0" and every click does nothing, which is correct but indistinguishable
 * from a feature that failed. Gated on `landscapeReady` so it never fires before the first run,
 * when `browsable` is empty only because nothing has been computed yet.
 */
const landscapeReady = computed(() => (app.model.outputs.landscapePanels?.length ?? 0) > 0);
const nothingToBrowse = computed(
  () => landscapeReady.value && browsableLoaded.value && browsable.value.size === 0,
);

function onCellClick(cell: CellClickData) {
  const position = cell.x.find((s) => s.spec?.name === POSITION_AXIS)?.value;
  const parent = cell.x.find((s) => s.spec?.name === PARENT_RESIDUE)?.value;
  // Y is the state axis, and it is the only source bound there.
  const state = cell.y[0]?.value;
  const scoreKey = activePanel.value?.key;
  if (position == null || parent == null || state == null || scoreKey === undefined) return;

  const mutationId = `${parent}${position}${state}`;
  // A cell with nothing co-occurring would open a browser holding only the singleton the user
  // just clicked, so it is not a click target. The parent cell lands here too: it carries the
  // outline but no substitution, so it is never in the browsable set.
  if (!browsable.value.has(mutationId)) return;
  openDrillDown(mutationId, scoreKey);
}

// X = position, Y = state, colour = the single-mutant variant's own score. A cell is NOT a
// population marginal — it is one variant's value, so nothing averages over genetic backgrounds.
//
// GraphMaker finds the value column by matching the whole spec it is handed — domain and
// annotations included — which is what tells the score columns apart: they share name and axes.
const defaultOptions = computed((): PredefinedGraphOption<"heatmap">[] | undefined => {
  const spec = activePanel.value?.spec;
  const axes = spec?.axesSpec;
  if (!spec || !axes) return undefined;
  // Axis order: [position, state]. GraphMaker requires every axis of a heatmap's value column to
  // be consumed by an input; x and y take both, so no selector appears above the plot.
  const options: PredefinedGraphOption<"heatmap">[] = [
    { inputName: "value", selectedSource: spec },
    { inputName: "x", selectedSource: axes[0] }, // position
    ...parentAxisOption.value, // then parent residue, so the label reads "position, parent"
    { inputName: "y", selectedSource: axes[1] }, // state
    { inputName: "tooltipContent", selectedSource: axes[1] }, // show State in the tooltip
    ...coOccurrenceOption.value,
    ...regionOption.value,
  ];

  // Outline the parent residue at each position — the unmutated reference every score is measured
  // against — the way published deep-mutational-scanning figures mark it. The cell itself has no
  // single mutant by construction; the value column's dense axes are what make it exist at all.
  // The column is present only on those cells, so `subset` ("has a value") marks exactly them.
  // Not locked: the user can clear it or point the Highlight at something else.
  const pCols = app.model.outputs.singleMutantHeatmapPCols;
  const parentFlagCol = pCols?.find((p) => p.spec.name === "pl7.app/repertoire/isParentResidue");
  if (parentFlagCol) {
    options.push({
      inputName: "highlight",
      selectedSource: parentFlagCol.spec,
      filterType: "subset",
    });
  }

  return options;
});
</script>

<template>
  <!--
    `categorical: 'triadic'` matches the synthetic-repertoire-profiler block, whose state
    heat map renders the same two annotation tracks. It is the only categorical palette
    with enough colours for a residue alphabet: it carries all 27 base colours, where
    light/bright/dark carry 9 each and paired 18. Discrete colours are assigned
    `colors[idx % colors.length]`, so the 9-colour default reuses a colour every 9th
    residue — visible repetition across the 20 residues plus gap on the Parent AA track.
    Past 27 distinct states it still wraps; graph-maker honours only a palette NAME for
    annotation tracks, not an explicit residue->colour map.

    `:key` forces a fresh GraphMaker per score: its store is seeded from the state object at
    setup, so swapping the bound state without remounting would carry the previous score's
    settings over and write them into the new score's state.
  -->
  <PlAlert v-if="nothingToBrowse" type="warn" icon>
    No substitution in this dataset appears in a variant carrying more than one mutation, so there
    are no combinations to browse. Every cell reports "Co-occurring variants 0" and opens nothing.
  </PlAlert>

  <GraphMaker
    v-if="activePanel"
    :key="activePanel.key"
    v-model="app.model.data.singleMutantHeatmapStates[activePanel.key]"
    chartType="heatmap"
    :p-frame="app.model.outputs.singleMutantHeatmapPf"
    :defaultOptions="defaultOptions"
    :defaultPalette="{ categorical: 'triadic' }"
    :readonly-inputs="['x', 'y', 'value']"
    @cell-click="onCellClick"
  >
    <!-- One tab per score, only with something to switch between. -->
    <template v-if="tabOptions.length > 1" #titleLineSlot>
      <PlTabs
        :model-value="activePanel.key"
        :options="tabOptions"
        :top-line="false"
        @update:model-value="(v: string) => (app.model.data.selectedLandscapeScore = v)"
      />
    </template>
    <template #settingsSlot>
      <Settings />
    </template>
  </GraphMaker>

  <!-- Placeholder: carries the empty state and the Settings drawer, which on a fresh block is
       the only way in to pick a dataset. -->
  <GraphMaker
    v-else
    v-model="app.model.data.singleMutantHeatmapState"
    chartType="heatmap"
    :p-frame="app.model.outputs.singleMutantHeatmapPf"
    :defaultPalette="{ categorical: 'triadic' }"
    :status-text="{
      noPframe: { title: 'Select a dataset and score columns in Settings, then Run' },
    }"
  >
    <template #settingsSlot>
      <Settings />
    </template>
  </GraphMaker>
</template>
