---
'@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow': patch
'@platforma-open/milaboratories.repertoire-mutation-heatmap.block': patch
---

Read the parent residue from the profiler instead of guessing it from the state matrix

The parent-residue track was derived here by a majority vote over the state matrix: a matrix cell
defaults to the parent residue, so the state carried by the most distinct variants was taken to be
the parent's. The vote counts variants rather than reads, so it is wrong wherever most distinct
variants are mutated at a position. Ties broke lexicographically, and a deletion is `-`, which sorts
before every letter, so a tie reported a gap as the parent residue.

That mattered well beyond the track itself. The mutation landscape locates a single mutant at the one
position where its state differs from the parent's (`state != parentResidue`). A wrong residue at one
position makes every single mutant differ there too, whatever it actually mutated, so each one is
painted an extra cell and the map smears.

The profiler now exports `pl7.app/repertoire/parentResidue` keyed `[parentId, position]`, taken from
mitool, which builds it from the same object it seeds state-matrix default cells from. This block
reads it off the state-matrix anchor — `parentId` at idx 1, `position` at idx 2, the same key the
region track already uses — scopes it to the selected parent, and collapses it to the position axis.

The old vote stays as a fallback for one release: a project holding a profiler run made before the
column existed resolves the query to empty, and falls back rather than failing. Remove it once those
projects have re-run the profiler.

The emitted column keeps its name and axes, so both pages find the track unchanged.
