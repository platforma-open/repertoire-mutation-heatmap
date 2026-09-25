---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": patch
---

MILAB-6876: let only the newest browsable-mutation enumeration win

The landscape enumerates which substitutions are worth browsing into, asynchronously, and reruns it
whenever a run finishes or the selected parent changes. Two requests could be in flight at once,
and the older resolving last left its answer standing for a landscape it no longer described — a
click either opening a browser holding nothing, or refused on a substitution that does have
variants. Each request now takes a sequence number and writes only while it is still the newest.
