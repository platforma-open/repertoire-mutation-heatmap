---
'@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow': patch
---

Show the finer region band when the profiler subdivides a region

The profiler can now annotate a graft inside a canonical region — an insert sitting
inside CDR2 — and exports two readings of the per-position membership: the widest region
containing each position, and the narrowest.

The heat map's region band now prefers the narrow reading where it exists, so a graft
reads as itself instead of disappearing into the region around it. It stays one band,
not a stack: the narrow names already carry their framework, since CDR2_N, Graft and
CDR2_C read as parts of CDR2.

A run without grafts is unaffected. The narrow column is absent there, so the band falls
through to the reading it has always used.
