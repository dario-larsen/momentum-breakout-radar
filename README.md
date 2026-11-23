# Breakout Radar — token-radar-01

A token launch radar that ranks pre-token protocols by the implied value of a token
they have not issued yet. The angle is momentum breakout: a protocol whose TVL is
growing fast right now, while the snapshot records no token, is breaking out, and
the model prices that breakout.

## Model — `momentum-breakout-4`

Every factor comes from the sealed snapshot; no protocol name is special-cased.

```
implied = TVL × 0.22 × momentum × (0.7 + 0.6 × velocity) × patience × sector × spread
```

- `momentum` is 1 + the 7-day TVL change (clamped −50% to +200%).
- `velocity` saturates on the week's new TVL dollars — $5M of weekly inflow scores 0.5.
- `patience` grows with the days listed with no token recorded.
- `sector` is the protocol's category median weekly growth.
- `spread` rewards a multi-chain footprint (up to 1.20x).

The board ranks every protocol that passes the launch test (pre-token, not an
exchange, not a versioned pool, not a wrapped / staked / bridged product of a token
that already trades) — the whole early universe, 198 rows here, covering all 40
watchlist slugs. Protocols whose token already trades are set aside in a separate
live view, priced by the market, never mixed into the ranked board.

## Dashboard

`dashboard/` is a static page (no network, no framework) that reads `data.js`:
a sortable, filterable board, a detail view per protocol with its factor breakdown
and farm plan, a biggest-weekly-inflows ticker, a live-tokens view, and a model
sandbox that re-prices the board from the same snapshot figures.

Hash views: `#detail=<slug>` opens a protocol, `#breakout` shows breakouts only
(7-day growth ≥ +20%), `#cat=<category>` filters by category.

## Run

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
```

`main.ts` (Node 22, standard library only) reads the snapshot, writes
`board.json`, `data.js`, copies `dashboard/` and `screenshots/` to the output,
and writes `dossier.json` with the vendored make.fun library. The run is
deterministic: the same snapshot bytes always write the same output bytes.

## License

MIT — see `LICENSE`.
