---
'@platforma-open/milaboratories.repertoire-mutation-heatmap.workflow': patch
---

Read input PColumns directly instead of round-tripping them through TSV

Every input column went through `pframes.tsvFileBuilder`, whose `build()` calls
`xsv.exportFrame` to write the WHOLE column out as a TSV that this workflow then
reads back. Both halves stream, so it was never a memory problem — but the state
matrix is `distinctVariants x parentLength` rows, so on a DMS-scale run that round
trip costs tens of GB of scratch and two extra full passes for no gain.

`pt.p.column` emits a `read_frame` step instead: a lazy parquet scan through
pframes-rs, and the one read path ptabler gives a spill directory. Axes are then
referenced by spec via `pt.axis` and aliased to the names the body already used, so
resolution is identical to the `setAxisHeader` calls it replaces.

Also drops the hardcoded `.mem()`/`.cpu()` requests. pt sizes both from input volume
when neither is set (`ram = between(2 GiB + 4 x size, 2 GiB, 64 GiB)`); an explicit
request suppresses that formula, and the old fixed 16 GiB neither grew for a large
run nor gave memory back on a small one.

The score and round-frequency loops now carry the loop index in their frame header,
since each iteration adds its own frame to the same pt workflow.
