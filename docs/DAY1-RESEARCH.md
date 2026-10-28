# Day-1 research — pump custom-pair fee cap, holder rewards, bridge config

Run by Blue-1 (muse) 2026-10-28. All values pulled **fresh from mainnet** via read-only RPC at slot **462375943** (Helius) and decoded locally against the pump IDL in the Phase 0 evidence bundle. Labels: **VERIFIED** (decoded from chain / observed in a live tx) / **INFERENCE** / **UNKNOWN**.

Programs: pump `6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P` · pump fees `pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ` · mayhem `MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e` · wxmr bridge `EzBkC8P5wxab9kwrtV5hRdynHAfB5w3UPcPXNgMseVA8` · wXMR mint `WXMRyRZhsa19ety5erZhHg4N3xj3EVN92u94422teJp` (12 decimals).

## R1 — Creator-fee cap for custom (non-SOL) quote pairs

**Answer: the cap is 300 bps (3%), set at creation, immutable. VERIFIED.**

Evidence:
- pump **Global** account `4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf` (1088 bytes, decoded in full, consumed exactly 1088):
  - `creator_fee_configurable = true`
  - `max_configurable_creator_fee_bps = 300`
  - `create_v2_enabled = true`
- Live custom-pair coin at the cap: the graduated wXMR sample coin `CeVVQMZx8QcVNZ5PJ4YgF8Sz4FqfudCKABMAYN3RGxmr`, bonding curve `7WK2Vm7hfJZicAnhyVQLYjhescDVwD2bwkH92QVKwbAs`: `creator_fee_bps = 300`, `can_edit_creator_fee = false`, `quote_mint = wXMR`. **VERIFIED**
- `create_v2` takes `creator_fee_bps` as an `OptionU64` arg (bundle IDL): unset → the default schedule below applies. **VERIFIED (IDL)**

Reconciliation of the three conflicting numbers:
- **pump FAQ "0.05%–1%"** describes the *default* fee schedule, not the configurable cap. Global's legacy defaults are `fee_basis_points = 95` + `creator_fee_basis_points = 5` (= 1% total, 0.05% to creator). **INFERENCE** (matches the FAQ range exactly).
- **Current default schedule** — FeeConfig account `8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt` (owned by the pump fee program; flat fees, the single market-cap tier, stable tiers and exotic flat fees all identical): `lp_fee_bps = 0`, `protocol_fee_bps = 95`, `creator_fee_bps = 30` → a default coin pays 125 bps total per curve trade, 30 bps to the creator. **VERIFIED**
- **xmrpad "up to 3%"** = the `max_configurable_creator_fee_bps = 300` cap. **VERIFIED** — both were describing different layers; the on-chain cap wins.

Implication for Ombro (INTENT input for Sneaks, no split logic written): a wXMR coin can be created with `creator_fee_bps` anywhere in [0, 300]; the choice is locked at creation (`can_edit_creator_fee = false` on both live examples decoded).

## R2 — `is_holder_reward` on non-SOL quotes

**Answer: yes — holder rewards are denominated and paid in the coin's quote mint, natively by pump. No Ombro rewards keeper is needed for the curve phase. VERIFIED (structure + a live FARTCOIN-quoted coin).**

Evidence:
- Global: `is_holder_reward_enabled = true`, `holder_reward_claim_authority = HckQ93Xqjjo8mwt5pNPWvyCTZXQZ858rvzmm7ZRrZg9t` (only this authority may sign `distribute_fee_to_holders`). **VERIFIED**
- Our own MUSEINU v2 `BEeEy5TMCK32fqtM6BJYJdxn8zhUnmp5YHYbNtxovJWM` (FARTCOIN-quoted), bonding curve `FD2y8aNZ1XUvVbbrZnLb8L8dX4w75PFaTgU3dQ2gJPAQ`: `is_holder_reward = true`, `quote_mint = 9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump` (FARTCOIN), `creator_fee_bps = 30`, `creator = 7FZkVessCSqtmwPr7cAdcWhmpN1CX6iSkdzyXicsLTmK` — which is exactly the PDA `["holder-rewards", mint]` under the pump program. **VERIFIED**
- The fees actually accrued in the quote mint: creator vault PDA `WDXyfoxc2GXRand2bNDZj6MxegeN64XQ1yzm7dDn3xs` (`["creator-vault", creator]`), its FARTCOIN ATA `FEjdAZ8zCuAJLKmRYXfeXNaVKnZLQ7CPeYUEaZ4fN25m` holds **1,502,104 raw = 1.502104 FARTCOIN** — consistent with 30 bps on the coin's one buy (~253.48 FART) plus one sell (~247.22 FART), never collected. **VERIFIED**
- Mechanism (bundle IDL): in `buy_v2`/`sell_v2` every fee destination is a **quote-mint ATA** (`associated_creator_vault` = ATA of the creator vault for `quote_mint`, etc.), so fees are quote-denominated by construction; `distribute_fee_to_holders(amounts[])` is signed by `holder_reward_claim_authority` and pays holders out of the `["holder-rewards", mint]` account's quote token account. **VERIFIED (IDL)**
- **Fork confirmation (2026-10-28, `harness/` run, exit 0):** a fork coin created with `is_holder_reward = true` and a normal wallet as the `creator` argument stored `creator = PDA(["holder-rewards", mint])` — the harness printed `COIN_B_CREATOR_IS_HOLDER_REWARDS_PDA: true`, `COIN_B_CREATOR_IS_ARG: false`. So on a wXMR quote the same substitution holds: with holder rewards on, creator fees accrue to the holder-rewards PDA's vault in wXMR. **VERIFIED (fork)**
- Caveat: the one live wXMR coin (the sample) has `is_holder_reward = false`, so a *live mainnet* wXMR holder-reward coin has not been observed; distribution to individual holders (`distribute_fee_to_holders`, signed by pump's claim authority) is not exercised by this harness.

## R3 — wxmr.io bridge BridgeConfig

**Answer: fee = 10 bps (0.1%), confirmed on-chain. The 0.1 XMR minimums are program constants, not config fields. VERIFIED.**

Evidence — BridgeConfig account `2yy692W8JX511d63i5BdKHqULJCnQyBYrfnkavnzjZuE` (91 bytes, owned by the bridge program, decoded to the exact end of the account):
- `authority = Ds4prSZNwyxTz4PZmHXoHDXFzLZ1c8MkfhUwGtqvAvpK` (the single operator key — custody risk stands)
- `mint = WXMRyRZhsa19ety5erZhHg4N3xj3EVN92u94422teJp`
- `totalDeposits = 6,610,497,121,872,898` piconero ≈ 6610.50 XMR
- `totalWithdrawals = 3,596,390,069,247,754` piconero ≈ 3596.39 XMR
- one further byte `0xFF` (field semantics not in the client source; Nero's own decoder skips it identically)
- `feeBps = 10` → **0.1%**, matching wxmr.io's published fee. **VERIFIED**
- Minimums: the 91-byte config has **no min fields**. The bridge's published client source (`nero_constants.ts`, Phase 0 bundle) states `MIN_XMR_WITHDRAWAL` / `MIN_XMR_DEPOSIT` are constants **in the bridge program**, both `100_000_000_000` piconero = **0.1 XMR**. **VERIFIED (program-source constants)** — not independently decodable from the config account because they don't live there.

## Supporting values pulled for the harness

- QuoteControl `6z6GDdfb2AjR9ZhJmAUQ5cipJCVxQvLJhB2H8mCwTFBP`: 224 registered quote mints (decode consumed the account exactly: 8 + 32 + 32 + 32 + 4 + 224×40 = 9068). wXMR entry `initial_virtual_quote_reserves = 5,371,916,821,623` piconero ≈ 5.3719 wXMR at slot 462375943. (Phase 0 bundle read 5.491268697179 wXMR at an earlier slot; the value is set by `reserves_admin = 9D6H6Yp65TtwUUW7h5xwPDRzD3USvG9n3qjusYCLgz5h` and can change — **the fresh value is the one to build on**.) FARTCOIN entry: 24,885,984,888 raw (6 dp).
- Global defaults for new curves: `initial_virtual_token_reserves = 1,073,000,000,000,000`, `token_total_supply = 1,000,000,000,000,000`, `initial_virtual_quote_reserves = 4,292,000,000` (per-quote overrides come from QuoteControl).
- Live-tx ground truth captured for harness account lists: create_v2 tx `4coiKKxf…KSFJ` (bundle), buy_v2 tx `FK9yPbZ8GiVp4ca4dqdPnVQtCAoLMhswe3vqaDBYos5CPU3zPJNBsiekQFGnpxrhLPkP3pWGeLRWHTr679LLwhr` and sell_v2 tx `59jVZR8C…mgAj7r` on MUSEINU v2 — account lists match the bundle IDL exactly for buy/sell (27/26 accounts); create_v2 carries 4 accounts beyond the bundle IDL (quote_mint, associated_quote_bonding_curve for the quote, quote token program, quote_control). Notable: live txs pass a **nonexistent** `sharing_config` PDA and nonexistent `mayhem_state`/`mayhem_token_vault` accounts and the program tolerates them.
