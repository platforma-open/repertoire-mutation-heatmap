<script setup lang="ts">
import type { CellClickData, PredefinedGraphOption } from "@milaboratories/graph-maker";
import { GraphMaker } from "@milaboratories/graph-maker";
import {
  landscapeHref,
  makeLandscapeChartState,
} from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import { getUniqueSourceValuesWithLabels } from "@platforma-sdk/model";
import type { PObjectId } from "@platforma-sdk/model";
import { PlNotificationAlert } from "@platforma-sdk/ui-vue";
import { computed, ref, watch } from "vue";
import { useApp } from "./app";
import { useDrillDowns } from "./drillDown";
import Settings from "./Settings.vue";

const app = useApp<`/?score=${string}`>();
const { open: openDrillDown } = useDrillDowns();

// One chart per score: a heatmap chart has a single colour scale, so scores in different units
// cannot share one.
//
// Only one is on screen at a time, picked by the tabs. Stacking them needs a graph-maker fix:
// it mounts every chart into a hardcoded DOM id (`chartSvgContainer`), so a second instance on
// the page lands in the first one's container. Its settings-modal teleport target and miplots4's
// tooltip lookup are shared the same way.
const panels = computed(() => app.model.outputs.landscapePanels ?? []);

// Which score this page shows, from the route. Each score is its own section, so the choice
// lives in the href rather than in `data` — nothing to keep in sync, and a link to one score is
// a link to one page.
//
// Falls back to the first score when the route names none, or names one the last run no longer
// produced. Read-only, so a dropped score costs no write to data.
const activePanel = computed(() => {
  const list = panels.value;
  const wanted = app.queryParams.score;
  const chosen =
    wanted === undefined ? undefined : list.find((p) => p.key === decodeURIComponent(wanted));
  return chosen ?? list[0];
});

// Land on a real landscape page whenever the route is not already on one.
//
// Two ways to end up adrift, both of which left nothing selected in the sidebar. A fresh block
// sits on "/" — the placeholder page — and the first run replaces that single section with one
// per score, so "/" stops being listed. And a route naming a score the latest run no longer
// produced points at a section that is equally gone. In both cases the chart below still
// rendered, via the fallback in `activePanel`, while the sidebar showed no selection at all.
watch(
  [panels, () => app.queryParams.score],
  ([list, wanted]) => {
    if (list.length === 0) return;
    const onAListedPage =
      wanted !== undefined && list.some((p) => p.key === decodeURIComponent(wanted));
    if (onAListedPage) return;
    app.navigateTo(landscapeHref(list[0].key));
  },
  { immediate: true },
);

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
/**
 * Sequence number of the newest enumeration, so only the newest may write.
 *
 * The request is async and the watcher refires whenever a run finishes or the selected parent
 * changes, so two can be in flight at once and the older can resolve last. Its answer would then
 * stand as the browsable set for a landscape it no longer describes: a click either opening a
 * browser holding nothing, or refused on a substitution that does have variants. The synchronous
 * "no data" branch takes a number too — otherwise a request still in flight when the pframe goes
 * away lands afterwards and revives a set for data that is gone.
 */
let browsableRequest = 0;
watch(
  () => ({
    pframe: app.model.outputs.browsableMutationsPf,
    colId: app.model.outputs.browsableMutationsColId,
  }),
  async ({ pframe, colId }) => {
    const request = ++browsableRequest;
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
      if (request !== browsableRequest) return;
      browsable.value = new Set(res.values.map((v) => v.value));
      browsableLoaded.value = true;
    } catch {
      if (request !== browsableRequest) return;
      browsable.value = new Set();
      browsableLoaded.value = false;
    }
  },
  { immediate: true },
);

/**
 * Why the last click opened nothing, or undefined when the last click was fine.
 *
 * Answered on demand rather than announced up front: a cell that cannot be browsed is a fact
 * about that substitution, and standing warnings about the whole dataset nag before the user has
 * asked anything. It also keeps every cell clickable — the ones with nothing to show say so
 * instead of silently ignoring the click, which is what reads as a broken block.
 */
const clickNotice = ref<string | undefined>(undefined);

/** `PlNotificationAlert` drives a boolean; closing it clears the message behind it. */
const noticeOpen = computed({
  get: () => clickNotice.value !== undefined,
  set: (open: boolean) => {
    if (!open) clickNotice.value = undefined;
  },
});

function onCellClick(cell: CellClickData) {
  const position = cell.x.find((s) => s.spec?.name === POSITION_AXIS)?.value;
  const parent = cell.x.find((s) => s.spec?.name === PARENT_RESIDUE)?.value;
  // Y is the state axis, and it is the only source bound there.
  const state = cell.y[0]?.value;
  const scoreKey = activePanel.value?.key;
  // Nothing resolvable to talk about — stay silent rather than invent a reason.
  if (position == null || parent == null || state == null || scoreKey === undefined) return;

  // The outlined cell on every column: the residue the parent already carries, so it names no
  // substitution at all. Worth saying, because it is the one cell a user is most likely to try.
  if (state === parent) {
    clickNotice.value = `${parent}${position} is the parent residue — not a substitution, so there is nothing to browse.`;
    return;
  }

  const mutationId = `${parent}${position}${state}`;
  // Until the enumeration has settled we do not know what is browsable, so claim nothing.
  if (!browsableLoaded.value) return;
  if (!browsable.value.has(mutationId)) {
    clickNotice.value = `${mutationId} is not carried by any variant with more than one mutation, so there are no combinations to browse.`;
    return;
  }

  clickNotice.value = undefined;
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

/** Bound to both the visible hint and its `title`, so an edit cannot leave the two disagreeing. */
const CLICK_HINT = "Click a cell to browse variants carrying that substitution";
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
  <!-- Floated over the chart, not stacked above it: the same fixed bottom-right corner and the
       same component graph-maker uses for its own truncation and export warnings, so the block
       does not invent a second notification style. A full-width banner also displaced the plot. -->
  <div v-if="clickNotice" :class="$style.alerts">
    <PlNotificationAlert v-model="noticeOpen" type="warning" closable>
      {{ clickNotice }}
    </PlNotificationAlert>
  </div>

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
    <!-- A heat map cell reads as a swatch, and nothing about the map says one opens anything.
         Said once in the title line, where the eye already is when the page loads, rather than as
         a notification — that would nag on every visit to say something true only once. Not on the
         placeholder chart below: it has no cells to click. -->
    <template #titleLineSlot>
      <span :class="$style.clickHint" :title="CLICK_HINT">{{ CLICK_HINT }}</span>
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

<style module>
/* graph-maker's title-line slot is `margin-left: auto` in a flex header whose title input is 40px
   tall, so the hint lands at the right end of the title row and needs its own vertical centring.
   It truncates rather than pushing the score name out of the header, and carries the full text as
   a `title` so a clipped hint is still readable on hover. */
.clickHint {
  align-self: center;
  min-width: 0;
  padding-left: 16px;
  color: var(--txt-03);
  font-size: 14px;
  line-height: 20px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* The slot wrapper is graph-maker's own, and a flex item's automatic minimum size is its content
   width — so without this the hint refuses to shrink and overflows the header instead of
   ellipsing. Reaching for another package's class is fragile, but the failure mode if it is ever
   renamed is the behaviour we have today, not a broken page. */
:global(.chart_titleLineSlot) {
  min-width: 0;
}

/* Matches graph-maker's own `.alerts` container so the two stack alike. */
.alerts {
  position: fixed;
  bottom: 12px;
  right: 12px;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  width: 256px;
}
</style>
