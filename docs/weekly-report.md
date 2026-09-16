# Weekly Ad Performance Report

`/weekly-report` — the page to open every week to answer, in two minutes: how did the ads perform, what changed week over week, which platform or campaign drove it, which ads ran and how they did, and what to look at next.

## Sections, in order

1. **Blended performance** — spend, conversions, cost per conversion, impressions, clicks, CTR, reach, frequency, CPC, CPM across every connected platform. Each tile shows this period, the previous period, the change, and a verdict that follows the metric's meaning (a lower cost per conversion is *Improved*; more or less spend is *Changed*, never good or bad by itself).
2. **Performance summary** and **Next focus** — plain-English sentences and a short list of movements worth investigating, generated only from the report's numbers (`lib/reports/weekly-narrative.ts`).
3. **Platform breakdown** — Google Ads and Meta Ads (and LinkedIn when it has spend) with the same metrics and WoW, plus each platform's share of the net spend change. Unconnected platforms say so.
4. **Campaign performance** — every campaign with spend or impressions in either period; sortable columns and quick views (spending more / less, more / fewer conversions, more / less efficient, significant changes).
5. **Ad / creative performance** — the ads that actually ran: the platform's own image or video where a URL was supplied, RSA headlines / descriptions / final URL for Search ads, and an explicit "asset not available" otherwise. Nothing is stood in for.
6. **Week-over-week trends** — four mini charts (spend, conversions, cost per conversion, CTR) and a full chart with a metric switcher; solid = this period, dashed = the same day of the previous period.
7. **Data integrity block** — data source, reporting and comparison periods, last sync, and every known gap.

## Calculations

All rates are computed from summed totals, never averaged from campaign-level rates (`lib/reports/weekly.ts`):

| Metric | Formula |
| --- | --- |
| CTR | clicks ÷ impressions |
| CPC | spend ÷ clicks |
| CPM | spend ÷ impressions × 1,000 |
| Cost per conversion | spend ÷ conversions |
| Frequency | impression-weighted average of the platform's daily frequency |
| Reach | sum of daily reach (impressions ÷ frequency) for the period; not de-duplicated across days |

"Conversions" are the ad platform's primary conversions (Google Ads `metrics.conversions`), stored on the daily rows as `leads`. Reach and frequency exist only for platforms that report frequency (Meta, LinkedIn); Google Search cells show "—".

## Data

The report reads the campaign-day and ad-day rows the scan already stores (`performance_metrics`, entity types `campaign` and `creative`) plus the `creatives` table, so it needs no extra sync. Data runs through the latest complete day; the page states the last scan time. Period: `?window=7d` (default), `14d`, `30d`, or any integer from 2 to 90.
