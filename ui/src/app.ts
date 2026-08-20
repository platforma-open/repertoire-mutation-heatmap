import { platforma } from "@platforma-open/milaboratories.repertoire-mutation-heatmap.model";
import { defineAppV3 } from "@platforma-sdk/ui-vue";
import CompositionHeatmapPage from "./CompositionHeatmapPage.vue";
import MutationLandscapePage from "./MutationLandscapePage.vue";

export const sdkPlugin = defineAppV3(platforma, (app) => ({
  progress: () => app.model.outputs.isRunning,
  routes: {
    "/": () => MutationLandscapePage,
    "/composition": () => CompositionHeatmapPage,
  },
}));

export const useApp = sdkPlugin.useApp;
