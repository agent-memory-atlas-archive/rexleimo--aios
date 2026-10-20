# Engagement Output Summary — Meridian Advanced Manufacturing, Q1/Q2 2024 Efficiency Review

## Deliverables produced (in `output/`)

| File | Format | Contents |
|---|---|---|
| `Meridian_Efficiency_Workbook.xlsx` | Excel, 6 tabs | **Source Assumptions** (data provenance + FRED MCUMFN assumption), **Plant Scorecard** (per-plant OEE, defect rate /1,000, avg OTD, unplanned-downtime share, cost/unit, composite health rank + VP-memo verification section), **Trend Diagnostics** (12 watch items; 6-month OLS slopes for defect rate and OTD per plant), **Industry Benchmark** (FRED MCUMFN Jan–Jun 2024, P25/P50/P75 of the defect dataset for DefectRate and DowntimePercentage, per-plant positioning), **Complaint-Production Crossref** (complaints /1,000 units per plant, monthly complaint/downtime joint table with Pearson r, category mix), **Equipment Risk Matrix** (plant-level asset exposure; 5 Columbus assets flagged as replacement priority under the age > 8 yrs AND condition ≤ 5 rule, est. capital $2.66M; watch items; context notes) |
| `Meridian_COPQ_Analysis.csv` | CSV, 5 rows | Per-plant COPQ: scrap cost (scrap × avg material cost/unit), rework cost (reworked × 40% avg labor cost/unit), return cost (returns × avg material cost/unit), severity-weighted complaint cost (Critical $5,000 / High $2,500 / Medium $1,000 / Low $250), downtime cost (unplanned hours × hourly labor rate), total COPQ, COPQ % of total production cost, plus an ALL-PLANTS summary row |
| `Meridian_Strategic_Investment_Memo.docx` | Word, ~3 pages | To David Chen. Sections: Executive Summary; What the data shows (scorecard, trends, benchmarking, complaints, equipment risk); COPQ table; direct answer to the Board's consolidation question (4 evidence-based reasons the data do not support consolidation); 4 prioritized interventions (P1–P4) with estimated impact; data caveats |
| `answer.md` | Markdown | This file |

## Key computed figures

- **Composite health rank:** Nashville TN #1 (81.2), Portland OR #2 (37.5), Columbus OH #3 (31.2), Phoenix AZ #4 (25.0).
- **COPQ (H1 2024):** Columbus $120,613 (3.6% of production cost); Nashville $40,936 (1.4%); Phoenix $136,106 (4.6%); Portland $131,279 (4.3%); **all plants $428,935 (3.5% company-wide)**.
- **Fastest-deteriorating plant:** Portland — defect rate slope +3.10/1,000 per month (Jan 35.2 → Jun 49.6), OTD slope −1.32 pts/month (92.7 → 86.4, below the 92% SLA from May onward).
- **Equipment:** 5 Columbus assets meet the replacement-priority rule; estimated capital need $2,664,924. No other plant has any asset meeting both criteria.
- **Complaints:** 61 total; Portland highest count (20; 0.51/1,000 units), Phoenix highest severity-weighted cost per complaint (~$2,764 avg). Only Phoenix shows a strong monthly downtime–complaint correlation (r = +0.59).
- **FRED MCUMFN assumption (documented in the workbook's Source Assumptions tab):** the FRED file was not in the engagement package, so published H.15 values were used separately — Jan 77.7, Feb 77.8, Mar 77.6, Apr 77.5, May 77.4, Jun 77.3 (6-mo avg 77.5%). All four Meridian plants' schedule-attainment utilization (91.2–99.6%) sits above this index; a definition-mismatch caveat is flagged.

## VP memo claims verified against data (flagged in workbook Plant Scorecard tab)

- Columbus/Portland defect increase: **direction confirmed** (Phoenix actually leads at 54.7/1,000, not Columbus/Portland).
- Portland OTD "≈87.3%": computed H1 average is **90.0%**; the ~87% level is real but only in May–Jun (Jun = 86.4%), so the memo overstates the average slightly.
- Columbus downtime "+18% YoY": **unverifiable** — no FY2023 data in the package.
- Phoenix "58% utilization": computed schedule attainment is **91.2%**; the memo's figure appears to use a different (design-capacity) basis — flagged as a re-baselining item, not reconcilable from provided data.

## Consolidation answer (memo Section 4)

The evidence does **not** support closing or consolidating any plant on H1-2024 data:
1. **Capacity:** no plant is below the national FRED utilization index; Nashville is already at 99.6% of schedule — absorbing more volume there creates overtime/second-shift cost, not margin.
2. **Cost structure:** the $15–17/unit cost gap between the best and weakest plants is driven by downtime/defects/labor efficiency, not fixed-plant overhead — the problem travels with the volume, so consolidation does not remove it.
3. **Equipment:** only Columbus has assets past the replacement threshold, and the capital need is bounded (~$2.66M, sequencable) — a manageable capex program, not a structural defect only closure resolves.
4. **Workforce:** any closure carries 80–190 FTE transition exposure per plant, against 2.8–10 yr tenure and 8–26% turnover, unpriced in any consolidation case provided.

The memo recommends a 4-quarter, plant-specific intervention program (P1–P4) instead, with consolidation re-visited only if Phoenix/Portland defect rates do not move into the benchmark bottom quartile by the end of that period.

## Files not touched / out of scope

- The VP memo also requests an executive PowerPoint and EPA lean-manufacturing case-study analysis — these are **not** part of this task instruction's three deliverables and were not produced.
- No data files were modified; all outputs are new files under `output/`.
