# Market data — ingest contract

What has to be true for `kbve.asset.v1` to carry a competitive market product.
The schema is in this module; **the ingester is not** — it belongs to
`kbve/kbve`, and as of 2026-08-28 it does not exist.

---

## 1. Current state

`osrs.prices` and `osrs.price_latest` exist in Postgres with
`osrs.service_save_prices(JSONB)` wired to write both. Nothing calls it.
Grepped `apps/`, `packages/npm`, `packages/python` — zero callers, no cron, no
workflow. The history table has never been written to.

The only live price path is [`prices.ts`][p], which fetches the wiki `/latest`
endpoint once per Astro build so crawlers see numbers in static HTML. That is
a rendering fix, not a data pipeline: it keeps nothing.

[p]: ../../../apps/kbve/astro-kbve/src/data/osrs/prices.ts

## 2. Endpoints

`https://prices.runescape.wiki/api/v1/osrs/`, `User-Agent` identifying the app.

| Endpoint | Carries | Used today |
|---|---|---|
| `/mapping` | item id, name, examine, members, buy limit, alch values | yes |
| `/latest` | last instant-buy and instant-sell, each with its own epoch | yes |
| `/5m` | **prices plus `highPriceVolume` / `lowPriceVolume`** | no |
| `/1h` | same at hourly resolution | no |
| `/timeseries?id=&timestep=` | the history itself, 365 points per call | no |

Volume is the missing half. `/latest` has none, and a margin without volume
ranks a table by how wide each spread is — which is to say, by how few people
are trading each item.

## 3. Cadence

- `/5m` every 5 minutes → `Quote` + `Liquidity`, appended to history
- `/1h` hourly → `Candle` at `CANDLE_INTERVAL_HOUR_1`
- `/mapping` daily → `Asset` upsert
- `/timeseries` once per item as a backfill, then never again

Backfill is worth doing before launch. Otherwise the product ships with no
history and accumulates it in real time, which means no charts for months.

## 4. Two traps that produce wrong numbers silently

**The untraded sentinel.** The wiki reports items that have never traded as
`2147483647` — int32 max — rather than omitting them or sending null.
[`prices.ts`][p] already guards this. Anything new must too: the sentinel
survives into `Decimal.units` as a real 2.1-billion-gp price, and since it
lands at the top of every margin sort, it appears at the top of the page.

**`high` and `low` are not bid and ask.** They are the last *completed* trade
at each end, whenever it happened. One can be minutes old and the other hours.
That is why `Quote` carries `bid_at` and `ask_at` separately and why
`Liquidity` carries `bid_age_seconds` / `ask_age_seconds` apart from the volume
counts — a five-minute window can show healthy volume while the specific price
quoted is stale.

## 5. The tax

Grand Exchange tax, in force since December 2021, modelled by `FeeSchedule` on
`Venue`:

```
rate_bps  200          two percent
side      SELLER       charged on the sale only
rounding  DOWN         floored to whole gp
cap       5_000_000    per item
```

Three consequences, all verified against the generated code:

| | |
|---|---|
| A whip bought at 1.48m and sold at 1.52m nets **9,600**, not 40,000 | ignoring tax overstates it 4.2× |
| A twisted bow at 1.65b is taxed 5m, not 33m | **0.303 %** effective — the cap makes expensive items *better*, and a scan without it under-ranks them |
| An item selling at 49 gp is taxed **0** | 2 % of 49 floors to zero; rounding to nearest invents a fee across the whole low end |

Exempt assets (tools, bonds) set `TradingRules.fee_exempt`. Exemption is a
property of the asset, not of the schedule, so it does not live on the venue.

## 6. Storage shape

Postgres for the catalog and per-user state; a column store for the tape.
`osrs.prices` as it stands is a row per item per poll — roughly 4.1k rows every
5 minutes, ~430M rows a year — which Postgres will hold and will not serve
charts from quickly. The `jedi.clickhouse` protos already in the legacy tree
are the obvious home for candles.

Columns `osrs.prices` is missing for any of this: `buy_volume`, `sell_volume`,
`total_volume`.

## 7. What is still absent after this module

Schema is necessary and not sufficient. Still unbuilt:

- the poller and its schedule
- the `/timeseries` backfill
- volume columns on `osrs.prices`
- the alert evaluator — `PriceAlert.last_observed` exists so a *crossing* can
  be distinguished from a condition that was already true, but nothing writes it
- delivery for `ALERT_CHANNEL_DISCORD` / `_WEBHOOK`
- anything that writes a `Fill`
