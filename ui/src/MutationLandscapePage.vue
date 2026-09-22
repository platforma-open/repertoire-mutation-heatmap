<script setup lang="ts">
import type { PredefinedGraphOption } from "@milaboratories/graph-maker";
import { GraphMaker } from "@milaboratories/graph-maker";
import { makeLandscapeChartState } from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import { getUniqueSourceValuesWithLabels } from "@platforma-sdk/model";
import type { PObjectId } from "@platforma-sdk/model";
import { PlAutocomplete, PlTabs } from "@platforma-sdk/ui-vue";
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
// TEMPORARY. The real affordance is clicking the cell, which miplots4 cannot do yet: its heatmap
// wires onMouseOver and nothing else, and there is no cell-click emit to plumb through
// graph-maker. This picker calls exactly the same `openDrillDown`, so when the click lands it is
// the handler that changes and this control goes away.
//
// The options are the substitutions that HAVE a co-occurring variant — the same set a click will
// be allowed to open, so the two never disagree about what is browsable.
const browsableOptions = ref<{ value: string; label: string }[]>([]);
watch(
  () => ({
    pframe: app.model.outputs.browsableMutationsPf,
    colId: app.model.outputs.browsableMutationsColId,
  }),
  async ({ pframe, colId }) => {
    if (!pframe || !colId) {
      browsableOptions.value = [];
      return;
    }
    try {
      const res = await getUniqueSourceValuesWithLabels(pframe, {
        columnId: colId as PObjectId,
        axisIdx: 0,
      });
      browsableOptions.value = res.values.map((v) => ({ value: v.value, label: v.label }));
    } catch {
      browsableOptions.value = [];
    }
  },
  { immediate: true },
);

// PlAutocomplete searches rather than listing: a deep-mutational-scanning library can carry
// thousands of browsable substitutions, far past what a dropdown can show.
async function searchBrowsable(query: string) {
  const needle = query.trim().toLowerCase();
  const all = browsableOptions.value;
  const hits = needle ? all.filter((o) => o.label.toLowerCase().includes(needle)) : all;
  return hits.slice(0, 50);
}

function browseInto(mutationId: string | undefined) {
  const key = activePanel.value?.key;
  if (!mutationId || key === undefined) return;
  openDrillDown(mutationId, key);
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
  <GraphMaker
    v-if="activePanel"
    :key="activePanel.key"
    v-model="app.model.data.singleMutantHeatmapStates[activePanel.key]"
    chartType="heatmap"
    :p-frame="app.model.outputs.singleMutantHeatmapPf"
    :defaultOptions="defaultOptions"
    :defaultPalette="{ categorical: 'triadic' }"
    :readonly-inputs="['x', 'y', 'value']"
  >
    <!-- One tab per score, plus the temporary way into a drill-down. -->
    <template #titleLineSlot>
      <PlTabs
        v-if="tabOptions.length > 1"
        :model-value="activePanel.key"
        :options="tabOptions"
        :top-line="false"
        @update:model-value="(v: string) => (app.model.data.selectedLandscapeScore = v)"
      />
      <PlAutocomplete
        v-if="browsableOptions.length > 0"
        :model-value="undefined"
        label="Browse variants at"
        :options-search="searchBrowsable"
        @update:model-value="(v) => browseInto(v as string | undefined)"
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
