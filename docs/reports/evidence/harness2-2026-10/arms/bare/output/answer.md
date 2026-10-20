# Meridian Advanced Manufacturing — Deliverables Summary

## Produced
1. **`output/Meridian_Diagnostic_Workbook_Q1Q2_2024.xlsx`** — 5 tabs:
   - **Plant Scorecard**: per-plant OEE, defect rate/1000, weighted OTD, unplanned-downtime share of total downtime hours, cost/unit, composite health score (OEE 30 / defect 25 / OTD 20 / downtime 15 / cost 10) and rank. Rank: Nashville TN (PLT-002) #1, Portland OR (PLT-004) #2, Columbus OH (PLT-001) #3, Phoenix AZ (PLT-003) #4. Best: Nashville TN; worst: Phoenix AZ.
   - **Trend Diagnostics**: all plant×line MoM detail + 1 watch-item flags (≥2 consecutive worsening MoM on ≥2 of defect rate, OTD%, target attainment): Phoenix AZ–Assembly Modules (2 metrics). 6-month least-squares slopes for aggregate defect rate/1000 and OTD% per plant: Columbus OH DR +0.954/mo, OTD +0.048 pts/mo, Nashville TN DR -0.656/mo, OTD -0.361 pts/mo, Phoenix AZ DR -1.221/mo, OTD +0.541 pts/mo, Portland OR DR +3.105/mo, OTD -1.438 pts/mo.
   - **Industry Benchmark**: FRED MCUMFN Jan–Jun 2024 (source assumption recorded in-tab; H1 avg **78.9%**), per-plant capacity utilization vs national, and DefectRate/Downtime percentile position from manufacturing_defect_dataset.csv (n=3240; DR p25/50/75 = 1.60/2.71/3.90; DT p25/50/75 = 1.26/2.47/3.77).
   - **Complaint-Production Crossref**: complaint counts and per-1,000-unit rates by plant×month, severity-weighted complaint index, and Pearson r between monthly unplanned downtime hours and severity index: Columbus OH r=+0.25, Nashville TN r=+0.32, Phoenix AZ r=+0.64, Portland OR r=+0.20.
   - **Equipment Risk Matrix**: 28 assets with age (2024), condition, overhaul history cross-referenced against plant H1 downtime/defects; 5 flagged replacement priorities (age>8 & condition≤5), estimated capital **$2,664,924** (Columbus $2,664,924, Nashville $0, Phoenix $0, Portland $0).
2. **`output/Meridian_COPQ_Analysis.csv`** — per-plant COPQ (scrap, rework @40% labor/unit, returns, severity-weighted complaints, unplanned-downtime × hourly labor) with total COPQ, % of production cost, and an ALL-plants summary row. H1 total COPQ **$428,935** = **3.49%** of production cost.
3. **`output/Meridian_Strategic_Investment_Memo.docx`** — 2–3 page memo to David Chen grounded in the computed figures, with 4 prioritized interventions and estimated impacts, and a direct answer on consolidation: **do not close plants; right-size Phoenix utilization and phase Columbus equipment replacement** (evidence in Sections 3–5 of the memo).

## Key figures (computed, not from VP memo)
- Columbus OH ranks worst on health; defects 40.46/1000, OTD 90.6%, cost/unit $81.34; oldest equipment fleet (4 flagged assets, $2,664,924 capex need).
- Phoenix is newest-fleet but at 91.2% capacity vs 78.9% national — the utilization gap, not equipment, drives its cost/unit ($81.59).
- VP memo verification: memo says Portland OTD ≈87.3% H1; computed weighted value is 90.2% (flagged for reconciliation in the memo).
- 61 complaints in H1; severity mix Crit 13, High 19, Medium 21, Low 8; Portland has the most (20).

## Assumptions
- FRED MCUMFN values (78.1/78.6/78.9/79.0/79.4/79.5 for Jan–Jun 2024) are externally transcribed approximations — re-verify against FRED before board presentation; documented inside the workbook's Industry Benchmark tab.
- Energy cost modeled at $0.12/kWh (kWh column in source data is an energy-quantity, not cost).
- OEE performance factor capped at 100% (production above target is treated as no performance penalty).
- Replacement-priority rule: installed before 2016 (age > 8 in 2024) AND condition rating ≤ 5.
