# Public disclosure policy

**Version:** 2026-11-11.1
**Applies to:** every district-year value in this candidate.

## Rule

A named-district year is suppressed when any of the following holds:

- it has fewer than three active venues;
- it has three to five active venues and the largest venue holds 60% or more of
  district receipts;
- it has six or more active venues and the largest venue holds 70% or more of
  district receipts.

The rule applies to every public surface: the report tables, the map SVGs, the
interactive JSON and JavaScript, tooltips, ranking lists, trend charts, data
tables, the portable HTML, and the PDF.

## What a suppressed cell publishes

- The active-venue count.
- A "Suppressed" label in tables, tooltips and the map legend.

It does **not** publish receipts, city share, level change, percent change, or
any ratio derived from receipts. Suppressed is not replaced with zero.

## States kept separate

| State | Meaning | Display |
|---|---|---|
| Published | Cell passes the policy | Rounded receipts and share |
| Suppressed | Cell could identify a venue | "Suppressed" |
| No assigned row | No district-year row exists | "No assigned venues" |
| Genuine zero | Zero active venues | Zero receipts and share |

## Reconstruction checks

The release test checks that:

1. No suppressed cell carries `receipts` or `share` in the client data.
2. No published cell has fewer than three active venues (zero-venue cells are
   kept as genuine zeros).
3. No published cell exceeds the dominance threshold.
4. No district with any suppressed year appears in the public change comparison
   or change table.
5. Each year has 28 to 37 suppressed cells, mixed with an unpublished remainder
   of venues with no named district or geocode, so no single suppressed cell can
   be isolated by subtraction from the city total.
6. Exact suppressed receipts, and their nearest-thousand rounding, do not appear
   in the public HTML, JSON, JavaScript, SVG, or PDF text.
7. Named venue examples and their amounts are absent from the public edition.

The test is run by `scripts/check_public_release.py`. It is a disclosure test,
not a legal opinion.

## Current result

- 464 published district-year cells; 410 suppressed.
- The suppressed cells of a year sum to 3.6× to 6.2× the largest suppressed
  cell and sit alongside an unpublished unassigned remainder, so subtraction
  cannot isolate one cell.
- No exact suppressed receipt, and no nearest-thousand rounding of it, appears
  in the public HTML, CSS, JavaScript, JSON, SVG, Markdown, text or PDF.
- No named venue-level receipt appears in the public edition.

## Residual risk

The underlying Comptroller records are public. A determined person with the raw
files can identify venues independently. This policy prevents this publication
from doing that work for them; it cannot remove the source records from the
world.

## Change control

Any future public build must use the same policy or a stricter one. A weaker
policy needs a recorded owner decision and a new disclosure test.
