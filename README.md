# Ombro

Monero-native launchpad on Solana. Every coin is a pump.fun coin quoted in wXMR. Pay from a Monero wallet, get paid back to one. Holder rewards in XMR. Part of every trade buys and burns $OMBRO and deepens one shared $OMBRO/wXMR pool with burned LP.

Reference model: sapling.cash (same mechanics on ZEC). Own name, brand and copy; nothing copied from Sapling.

**Status:** Phase 0 gates cleared (2026-10-28). Phase 1 (program + fork tests) not started.

## What's here

| Path | What |
|---|---|
| `web/preview/index.html` | Static design preview: coins, coin page, launch, proofs, docs. Sample data only. Open it in a browser. |
| `docs/PHASE0.md` | Gate-check results and the open items Phase 1 starts with. |
| `CLAUDE.md` | Rules for agents working in this repo. |

## Fee model (INTENT, pending the creator-fee cap check)

2% creator fee per trade, split on chain by Ombro's program (the coin's pump.fun creator is a program PDA):

| Share of trade | To |
|---|---|
| 0.50% | $OMBRO/wXMR liquidity, LP burned |
| 0.50% | Buy and burn $OMBRO |
| 0.20% | Treasury |
| 0.80% | Creator's choice: me · another wallet · a Monero address · holders (permanent) · Monero General Fund (permanent) |

If pump.fun caps custom-pair creator fees at 1%, halve each share.

## Key addresses (third party, VERIFIED in Phase 0)

- wXMR mint: `WXMRyRZhsa19ety5erZhHg4N3xj3EVN92u94422teJp` (12 decimals)
- wXMR bridge program: `EzBkC8P5wxab9kwrtV5hRdynHAfB5w3UPcPXNgMseVA8`
- pump.fun program: `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P`

Independent project. Not affiliated with the Monero Project, the wXMR bridge, or pump.fun.
