# Phase 0 Gate Check — wXMR pump.fun Launchpad (2026-10-28)

Evidence: provided bundle only; no independent re-verification performed. Labels: **VERIFIED** (bundle fact) / **INFERENCE** (derived from bundle) / **UNKNOWN** (not in bundle).

## GATE 1 — pump.fun accepts wXMR as quote: **PASS**
- **VERIFIED**: Sample coin's BondingCurve PDA decodes with `quote_mint` exactly = wXMR mint; coin graduated (`complete=true`, all reserves 0), `creator_fee_bps=300`.
- **VERIFIED**: wXMR is registered in pump's QuoteControl PDA (entry #38 of 224; initial_virtual_quote_reserves = 5.491268697179 wXMR).
- **VERIFIED**: Create tx (sig `4coi…KSFJ`, slot 451135574, err=null) logs "Instruction: CreateV2" under the pump program, with sample mint + wXMR mint in account keys.

A wXMR-quoted coin was provably launched via create_v2.

## GATE 2 — Bridge usable by a program: **PASS (conditional)**
- **VERIFIED** (client source, from on-chain Anchor IDL): 4 client instructions — `create_deposit_account`, `claim_pending_mint`, `request_withdrawal`, `cancel_withdrawal`.
- **VERIFIED**: Deposit account = PDA seeds `["deposit", owner]`; `create_deposit_account` has user as signer+writable; relayer assigns a Monero subaddress (DepositRecord.xmrAddress).
- **INFERENCE**: A program can be the owner — owner seeds the deposit PDA, and a PDA can satisfy the signer via CPI signer seeds; not live-tested in the bundle.
- **VERIFIED**: `request_withdrawal(user, nonce, amount, xmrAddress: string, exactOut)` burns caller's wXMR and pays real XMR to the **arbitrary string argument**; withdrawal PDA seeds `["withdrawal", user, nonce]`.
- **VERIFIED**: feeBps=10 (0.1%) decoded from BridgeConfig; 0.1 XMR minimum deposit & withdrawal (constants.ts, stated as on-chain minimums — not independently decoded).
- **VERIFIED** risk: single authority `Ds4p…AvpK` ("upgrade authority + relayer"); owner may cancel a Pending withdrawal after 300s.
- **UNKNOWN**: XMR deposit confirmations; rate limits; admin pause (program surface beyond the client's 4 instructions not established).
- **INFERENCE** (derived): totalDeposits 6610.50 − totalWithdrawals 3594.17 ≈ 3016.33 wXMR ≈ reported 3012.69 supply — consistent, active bridge.

## GATE 3 — Jupiter SOL↔wXMR liquidity: **PASS**
**VERIFIED** live quotes (lite-api.jup.ag, slippageBps=50, 2026-10-28):

| SOL in | wXMR out | Impact | Round-trip SOL | RT impact |
|---|---|---|---|---|
| 0.5 | 0.084728457910 | 0 | 0.499068123 | 0.000435% |
| 2 | 0.338913831641 | 0 | 1.997997173 | 0 |
| 10 | 1.694833636537 | 0 | 9.981851051 | 0.000192% |
| 50 | 8.464924292602 | 0.000719% | 49.793479694 | 0.001481% |

**INFERENCE** (derived): ~5.90 SOL/wXMR; round-trip cost 0.19%–0.41%; 50 SOL (~0.28% of the 3012.69 wXMR supply) moves price <0.001% — deep for launchpad sizing.

## GATE 4 — Creator fees on custom pairs: **PASS**
- **VERIFIED** bounds: Global PDA — `create_v2_enabled=true`, `creator_fee_configurable=true`, `max_configurable_creator_fee_bps=300` (legacy default: 95/5 bps split of a 1% fee). Custom-pair creator fee ∈ [0, 300] bps, set at creation; sample coin = 300 (at the max), `can_edit_creator_fee=false` (immutable after creation).
- **VERIFIED** (IDL structure): create_v2's `creator` is a pubkey **argument**, absent from the accounts list; user is the sole signer → any pubkey, including a program PDA, can be creator (structural proof only; no live PDA-creator example in the bundle).
- **VERIFIED** collection: `collect_creator_fee` (no args) sweeps creator_vault → creator; creator is writable and **not** a signer, so claiming requires no creator signature.

## Overall: 4/4 PASS

No evidence-based blockers. Open items before build: bridge confirmations, rate limits, admin-pause surface (**UNKNOWN**); live test of a PDA-owned deposit account and a PDA creator (not in bundle); relayer behavior toward program-owned accounts (**UNKNOWN**).
