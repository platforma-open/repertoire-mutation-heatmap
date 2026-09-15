---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": patch
---

MILAB-6876: outline the parent residue on the composition heat map

The workflow emits `pl7.app/repertoire/isParentResidue`, a per-cell subset column present only at
the parent residue of each position, and the composition page presets it as GraphMaker's Highlight
input — so the unmutated reference every fold change is measured against is marked in the picture
rather than only on the annotation track.

Needs the graph-maker release that adds the heatmap Highlight input.
