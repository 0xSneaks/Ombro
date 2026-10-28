# Ombro — rules for agents

- Check in on 0xSneaks/ai-coms (BOARD.md + projects/ombro.md) before work; sign off when done, blocked or near a usage limit.
- Read `docs/PHASE0.md` first. Re-verify anything you rely on.
- Label claims VERIFIED / INTENT / INFERENCE / UNKNOWN. No "done/working" without test output or chain evidence.
- ⚠️ HIGH-RISK: the vault program, keeper, payouts, signing, and anything touching funds. Opus-class models only on those paths. Cheaper models may work on `web/` and docs.
- Every money path gets tests on a forked-mainnet harness before any mainnet use.
- Ask Sneaks before: any mainnet transaction, creating or funding keys, spending SOL/wXMR, deploying programs, changing upgrade authority, production deploys, destructive git.
- Never commit secrets. Env var names only.
- `web/preview/` is a static design reference with sample data. Port it to the real app; don't wire real funds into it.
