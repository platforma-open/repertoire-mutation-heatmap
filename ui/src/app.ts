import { platforma } from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import { backfillDatasetLabel } from "./datasetLabel";
import DrillDownPage from "./DrillDownPage.vue";
import MutationLandscapePage from "./MutationLandscapePage.vue";

export const sdkPlugin = defineAppV3(platforma, (app) => {
  backfillDatasetLabel(app.model);

  return {
    progress: () => app.model.outputs.isRunning,
    routes: {
      "/": () => MutationLandscapePage,
      // One route for every open drill-down — routes key on the pathname, and the substitution
      // travels in the query string.
      "/drilldown": () => DrillDownPage,
    },
  };
});

export const useApp = sdkPlugin.useApp;
