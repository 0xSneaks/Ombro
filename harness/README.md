# Ombro day-1 harness — PDA-creator wXMR coin on a forked mainnet

A LiteSVM harness that clones the live pump.fun state from Solana mainnet into a local SVM and proves the exact flow Ombro needs — **no mainnet transaction is ever sent**; mainnet is only read (fixtures).

## What it proves (all steps PASS, 2026-10-28 run)

1. **create_v2** a new coin quoted in **wXMR** with `creator` = a **PDA** (an address that cannot sign), `creator_fee_bps = 300` (the on-chain cap), `is_holder_reward = false`. The curve reads back: `quote_mint = wXMR`, `creator = <the PDA>`, `creator_fee_bps = 300`, `virtual_quote_reserves = 5,371,916,821,623` (the QuoteControl wXMR entry).
2. **buy_exact_quote_in_v2** spending exactly 1 wXMR (1,000,000,000,000 piconero) → user received 162,968,176,646,375 base tokens.
3. **sell_v2** of half the position → user wXMR balance 9,000,000,000,001 → 9,499,968,811,783.
4. **collect_creator_fee_v2** (permissionless, no creator signature): creator-vault wXMR ATA held **44,475,920,952** piconero (≈0.044476 wXMR = 300 bps of the buy + sell quote volume) before the call and **0** after; the creator PDA's wXMR ATA went **0 → 44,475,920,952**. Fees on a custom pair accrue in the quote mint and are collectable by/to a PDA creator.
5. **Coin B** — create_v2 with `is_holder_reward = true`: the program **ignores the `creator` argument** and stores `creator = PDA(["holder-rewards", mint])` (harness printed `COIN_B_CREATOR_IS_HOLDER_REWARDS_PDA: true`, `COIN_B_CREATOR_IS_ARG: false`). Holder-reward coins route creator fees to that PDA's vault in the quote mint, for distribution by pump's `holder_reward_claim_authority`.

Full run log: `output/run-2026-10-28.log` (exit code 0; a re-run reproduces it — addresses of generated keypairs differ per run).

## Run it

```bash
cd ~/ombro/harness
npm install
node src/run.mjs        # or: npm start
```

Fixtures are already in `fixtures/` (mainnet slot 462375943). To refresh them from any mainnet RPC:

```bash
SOLANA_RPC_URL=<mainnet rpc url> npm run fetch
```

The RPC URL is read from the environment only; no key is stored in this repo.

## How it works

- **Fixtures** (`fixtures/*.json`, gitignored): `{pubkey, lamports, owner, executable, data(base64)}` for the pump / pump-fees / mayhem program accounts **and their programdata accounts**, pump Global, QuoteControl, GlobalVolumeAccumulator, the live FeeConfig, mayhem global-params, the wXMR mint, and the sol-vault/whitelist account.
- **Program registration gotcha:** `setAccount` on a loader-v3 program + programdata pair is *not* enough — LiteSVM answers "Program is not deployed / Unsupported program id". `src/run.mjs` additionally extracts each ELF (programdata minus its 45-byte header) and registers it via `addProgramWithLoader(programId, elf, BPFLoaderUpgradeable)`.
- **The test user** is an ephemeral in-process keypair, airdropped inside the fork. Its wXMR is a fabricated SPL token account written with `setAccount` (10 wXMR) — fork-local state only, never a real transfer. All other ATAs are created with the ATA program's create-idempotent instruction in a setup tx.
- **Transactions** are built with `@solana/kit` and signed by in-process keypairs (user + mint). Nothing persists: no key files are written.

## Encoding notes (verified against live mainnet txs)

- Instruction discriminators: `sha256("global:<snake_case_name>")[0..8]`.
- pump's `OptionBool` args encode as a **single byte** (0/1), and `creator_fee_bps` (`OptionU64`) encodes as a **raw u64 with no presence tag** — confirmed by decoding the live create_v2 txs of the xmrpad sample coin (300 bps → `2c01000000000000`) and of MUSEINU v2 (30 bps, holder_reward byte = 1).
- The bundle IDL's `create_v2` account list is missing the last 4 accounts the live program requires: `quote_mint`, `associated_quote_bonding_curve` (quote ATA of the curve), quote token program, `quote_control`. The harness uses the live 20-account list.
- `fee_config` passed to buy/sell is the live account `8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt` (owned by the pump fee program). The address in the wild does not match a naive PDA derivation from the bundle IDL — the harness passes the address real transactions use.
- `buy_v2`/`sell_v2` name their quote-side args `max_sol_cost` / `min_sol_output`, but for a custom pair they are denominated in the **quote mint**.

## Passed-but-nonexistent accounts (mirrors live mainnet txs)

Live pump txs pass several accounts that do not exist on mainnet, and the program tolerates them; the harness does the same: `mayhem_state` (per-mint PDA under the mayhem program), `mayhem_token_vault` (harness passes the mayhem-state ATA; its exact derivation on mainnet is unidentified and the account is inert with mayhem mode off), and `sharing_config` (PDA under the fee program — MUSEINU v2's live buy/sell txs pass it nonexistent).

## Known limitations

- Fork state is a snapshot (slot 462375943); reserves/fees can drift on mainnet. Re-fetch fixtures before drawing new conclusions.
- Holder-reward *distribution* to individual holders (`distribute_fee_to_holders`, signed by pump's claim authority) is out of scope — the harness proves accrual + collection, not distribution.
- Nothing here touches the wxmr.io bridge; bridge behavior for program-owned accounts remains a Phase-1 open item (see `docs/PHASE0.md`).
