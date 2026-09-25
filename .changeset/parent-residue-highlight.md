---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.model": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": patch
---

MILAB-6876: outline the parent residue on both heat maps

The unmutated reference every score and fold change is measured against is now marked in the
picture, not only on the annotation track beneath it.

- the workflow emits `pl7.app/repertoire/isParentResidue`, a per-cell subset column present only
  at the parent residue, in both heat maps' frames
- the mutation landscape declares its cell axes dense, because the parent cell is absent there by
  construction: a single mutant differs from its parent, so no variant carries the parent residue
  at its own position. The full position x state grid supplies the cell; uncovered substitutions
  arrive with no value and stay empty
- a `v3` migration pins "Treat NA value as: empty" on landscape charts saved before this, which
  would otherwise paint every uncovered substitution as a real zero

Parent residue also moves from an annotation track to the second part of the X axis label, so each
column reads "32, D" — the position and the residue it started as — rotated 45° to fit. The region
track stays where it is. A `v4` migration angles the labels of charts saved before this, which the
defaults cannot reach: the angle is a chart's own axes setting, seeded once when it is created.

Needs the graph-maker release that adds the heat map Highlight input.
