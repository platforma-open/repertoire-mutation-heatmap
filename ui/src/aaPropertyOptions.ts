import type { PredefinedGraphOption } from "@milaboratories/graph-maker";
import type { PColumnSpec } from "@platforma-sdk/model";

/**
 * Orders the residue rows (Y axis) by amino acid property and colours them by group in a track
 * beside the rows. No row groups: graph-maker sorts those by name and takes no custom order.
 * Empty for a nucleotide map, which the workflow gives no property columns.
 */
export function aaPropertyOptions(
  pCols: { spec: PColumnSpec }[] | undefined,
): PredefinedGraphOption<"heatmap">[] {
  const group = pCols?.find((p) => p.spec.name === "pl7.app/repertoire/aaPropertyGroup");
  const rank = pCols?.find((p) => p.spec.name === "pl7.app/repertoire/aaPropertyRank");
  if (!group || !rank) return [];
  return [
    { inputName: "annotationsY", selectedSource: group.spec },
    { inputName: "ySortBy", selectedSource: rank.spec },
  ];
}
