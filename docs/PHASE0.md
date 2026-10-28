# Phase 0 — gate check

Run by GLM-5.2 (OpenCode, on Seeker) 2026-10-28, read-only. Full report with evidence lives on Seeker at `~/wxmr-gate/REPORT.md` (copy it into this folder as `REPORT-glm.md`). Reviewed by claude 2026-10-28 (logic and numbers only; claude could not re-pull chain data).

## Result: GO

| Gate | Result | Basis |
|---|---|---|
| 1. pump.fun accepts wXMR as quote | PASS · VERIFIED | xmrpad coin `CeVVQMZx8QcVNZ5PJ4YgF8Sz4FqfudCKABMAYN3RGxmr`: bonding curve `quote_mint` = wXMR; graduated (tx `4coiKKxf3n7nX7k3dqi4wEZ4it1DsPFgFVaYP5rZgoE2c6ogjPEVJDRQoYEHEFRKrfzADxrAkcks4Fj8T6vJKSFJ`); Global `create_v2_enabled = true` |
| 2. Bridge usable | PASS · VERIFIED (logic) | `create_deposit_account` gives a subaddress; `request_withdrawal` burns wXMR to any XMR address; `WithdrawCompleted` carries tx hash + tx key; cancel after 300 s pending. Min 0.1 XMR both ways |
| 3. Liquidity | PASS · VERIFIED (2026-10-28 04:54Z quotes) | SOL↔wXMR round trip ≤ 0.24% up to 50 SOL; 3.19% at 500 SOL; 6 venues |
| 4. PDA creator + fees in wXMR | PASS · VERIFIED (docs/IDL) + INFERENCE | `create_v2` takes `creator` as a pubkey arg; `collect_creator_fee_v2` and PumpSwap `collect_coin_creator_fee` are permissionless; non-SOL fees paid in quote mint. Sapling runs the same PDA-creator design live on ZEC |

## Open items (Phase 1, day 1)

1. **Creator fee cap for custom pairs — UNKNOWN.** pump.fun FAQ says 0.05%–1%; xmrpad claims up to 3%. Read the limit from pump Global/config. Decides the split.
2. **`is_holder_reward` on non-SOL quotes — UNKNOWN.** If pump pays holders in wXMR natively, Ombro may not need its own rewards keeper.
3. **Bridge fee.** wxmr.io publishes 0.1% each way; confirm from `BridgeConfig`.
4. **No live execution yet.** First live milestone: forked-mainnet test (surfpool/litesvm), then a tiny mainnet smoke test (~0.05 SOL) — needs Sneaks's approval.

## Risks carried

- ⚠️ Bridge: one operator key `Ds4prSZNwyxTz4PZmHXoHDXFzLZ1c8MkfhUwGtqvAvpK` is upgrade authority and relayer. wXMR is custodial.
- Exits under ~0.6 SOL can't reach the 0.1 XMR bridge minimum.
- Liquidity quotes are point-in-time; re-pull before launch.
- Competitor: xmrpad.app already launches wXMR-quoted pump coins.
