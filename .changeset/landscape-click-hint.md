---
"@platforma-open/milaboratories.repertoire-mutation-heatmap.block": patch
"@platforma-open/milaboratories.repertoire-mutation-heatmap.ui": patch
---

MILAB-6876: say that landscape cells are clickable

A heat map cell reads as a swatch, and nothing about the map said one opens anything — the feature
was there to be stumbled into. The landscape's title line now carries the hint, in grey beside the
score name: *Click a cell to browse variants carrying that substitution*.

In the title line rather than as a notification: it is true of the page always, not of anything the
user just did, and a banner saying it on every visit is a banner that gets dismissed unread. It
truncates with an ellipsis on a narrow window rather than pushing the score name out of the header,
and carries the full text as a `title`, so a clipped hint is still readable on hover.

Not shown on the placeholder chart, which has no cells to click.
