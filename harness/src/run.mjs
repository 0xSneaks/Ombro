// run.mjs — LiteSVM forked-mainnet proof: pump.fun create_v2 with a PDA creator + wXMR quote.
// Run from ~/ombro/harness:  node src/run.mjs
import crypto from "node:crypto";
import fs from "node:fs";
import util from "node:util";
import { LiteSVM, FailedTransactionMetadata } from "litesvm";
import {
  pipe,
  createTransactionMessage,
  setTransactionMessageFeePayerSigner,
  appendTransactionMessageInstruction,
  signTransactionMessageWithSigners,
  generateKeyPairSigner,
  createKeyPairSignerFromBytes,
  address,
  lamports,
  AccountRole,
} from "@solana/kit";
import { PublicKey, Keypair } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

// Extract the ELF from a BPFLoaderUpgradeable ProgramData account (45-byte header)
// and trim trailing padding via the ELF section headers.
function elfFromProgramData(data) {
  const elf = data.subarray(45);
  if (elf.length < 64 || elf[0] !== 0x7f || elf[1] !== 0x45) throw new Error("bad ELF magic in programdata");
  const dv = new DataView(elf.buffer, elf.byteOffset, elf.byteLength);
  const shoff = Number(dv.getBigUint64(0x20, true));
  const shentsize = dv.getUint16(0x3a, true);
  const shnum = dv.getUint16(0x3c, true);
  let end = shoff + shentsize * shnum;
  for (let i = 0; i < shnum; i++) {
    const off = shoff + i * shentsize;
    const shSize = Number(dv.getBigUint64(off + 0x20, true));
    const shOffset = Number(dv.getBigUint64(off + 0x18, true));
    if (shOffset + shSize > end) end = shOffset + shSize;
  }
  return new Uint8Array(elf.subarray(0, end));
}

// ---------- constants ----------
const PUMP = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";
const FEE_PROG = "pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ";
const MAYHEM = "MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e";
const WXMR = "WXMRyRZhsa19ety5erZhHg4N3xj3EVN92u94422teJp";
const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN22 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const ATA_PROG = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM = "11111111111111111111111111111111";
const GLOBAL = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf";
const QUOTE_CONTROL = "6z6GDdfb2AjR9ZhJmAUQ5cipJCVxQvLJhB2H8mCwTFBP";
const GLOBAL_VOL = "Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y";
const FEE_CONFIG = "8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt";
const MAYHEM_PARAMS = "13ec7XdrjF3h3YcqBTFDSReRcUFwbCnJaAQspM4j6DDJ";
const SOL_VAULT = "BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s";
const MINT_AUTH = "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM";
const EVENT_AUTH = "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1";
const FEE_RECIPIENT = "7VtfL8fvgNfhz17qKRMjzQEXgbdpnHHHQRh54R9jP2RJ";
const BUYBACK_RECIPIENT = "3BpXnfJaUTiwXnJNe7Ej1rcbzqTTQUvLShZaWazebsVR";
const COMPUTE_BUDGET = "ComputeBudget111111111111111111111111111111";

const PK = (s) => new PublicKey(s);
const S = (pk) => (typeof pk === "string" ? pk : pk.toBase58());

const FIXTURES = [
  "pump_program",
  "pump_programdata",
  "fee_program",
  "feeprog_programdata",
  "mayhem_program",
  "mayhem_programdata",
  "pump_global",
  "pump_quote_control",
  "pump_global_vol_acc",
  "fee_config_live",
  "global_params_mayhem",
  "wxmr_mint",
  "sol_vault_addr",
];

// ---------- helpers ----------
const fmt = (v) =>
  util.inspect(v, { depth: 8, breakLength: 140 });

function disc(name) {
  return crypto.createHash("sha256").update("global:" + name).digest().subarray(0, 8);
}
function u64le(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n));
  return b;
}
function u32le(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0);
  return b;
}
function u8(n) {
  return Buffer.from([n & 0xff]);
}
function borshString(s) {
  const bytes = Buffer.from(s, "utf8");
  return Buffer.concat([u32le(bytes.length), bytes]);
}

const M = (a, role) => ({ address: address(S(a)), role });
const MS = (signer) => ({ address: signer.address, role: AccountRole.WRITABLE_SIGNER, signer });
const R = AccountRole.READONLY;
const W = AccountRole.WRITABLE;

function pda(seeds, prog) {
  return PublicKey.findProgramAddressSync(seeds, PK(prog))[0];
}
const bondingCurvePda = (mint) => pda([Buffer.from("bonding-curve"), PK(S(mint)).toBuffer()], PUMP);
const creatorVaultPda = (creator) => pda([Buffer.from("creator-vault"), PK(S(creator)).toBuffer()], PUMP);
const sharingConfigPda = (mint) => pda([Buffer.from("sharing-config"), PK(S(mint)).toBuffer()], FEE_PROG);
const userVolAccPda = (user) => pda([Buffer.from("user_volume_accumulator"), PK(S(user)).toBuffer()], PUMP);
const mayhemStatePda = (mint) => pda([Buffer.from("mayhem-state"), PK(S(mint)).toBuffer()], MAYHEM);
const holderRewardsPda = (mint) => pda([Buffer.from("holder-rewards"), PK(S(mint)).toBuffer()], PUMP);

function ata(owner, mint, tokenProgram) {
  return getAssociatedTokenAddressSync(PK(S(mint)), PK(S(owner)), true, PK(tokenProgram), PK(ATA_PROG));
}

function tokenAmount(svm, ataStr) {
  const acc = svm.getAccount(address(S(ataStr)));
  if (!acc || acc.exists === false || !acc.data || acc.data.length < 72) return null;
  return Buffer.from(acc.data).readBigUInt64LE(64);
}

async function send(svm, payer, ixs) {
  const msg = await pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(payer, m),
    (m) => svm.setTransactionMessageLifetimeUsingLatestBlockhash(m),
    (m) => ixs.reduce((mm, ix) => appendTransactionMessageInstruction(ix, mm), m),
    (m) => signTransactionMessageWithSigners(m),
  );
  return svm.sendTransaction(msg);
}

async function sendReport(svm, payer, ixs, label) {
  svm.expireBlockhash();
  const res = await send(svm, payer, ixs);
  if (res instanceof FailedTransactionMetadata) {
    let err, logs;
    try { err = res.err(); } catch (e) { err = e; }
    try { logs = res.meta ? res.meta().logs() : res.logs(); } catch { try { logs = res.logs(); } catch { logs = []; } }
    console.log(`[${label}] FAIL err=${fmt(err)}`);
    for (const l of logs || []) console.log(`  ${l}`);
    return { ok: false, err, logs: logs || [] };
  }
  let logs = [], cu = null, sig = null;
  try { logs = res.logs(); } catch {}
  try { cu = res.computeUnitsConsumed(); } catch {}
  try { sig = res.signature(); } catch {}
  console.log(`[${label}] PASS cu=${cu} sig=${sig == null ? "?" : String(sig)}`);
  return { ok: true, logs };
}

const computeIx = () => ({
  programAddress: address(COMPUTE_BUDGET),
  accounts: [],
  data: new Uint8Array(Buffer.concat([u8(2), u32le(1_400_000)])),
});

function ataCreateIx(payer, ataPk, owner, mint, tokenProgram) {
  return {
    programAddress: address(ATA_PROG),
    accounts: [MS(payer), M(ataPk, W), M(owner, R), M(mint, R), M(SYSTEM, R), M(tokenProgram, R)],
    data: new Uint8Array([1]),
  };
}

function createV2Ix({ user, mintSigner, mintPk, name, symbol, uri, creator, cashback, feeBps, holderReward }) {
  const bc = bondingCurvePda(mintPk);
  const ms = mayhemStatePda(mintPk);
  const data = Buffer.concat([
    disc("create_v2"),
    borshString(name),
    borshString(symbol),
    borshString(uri),
    PK(S(creator)).toBuffer(),
    u8(0), // is_mayhem_mode
    u8(cashback ? 1 : 0),
    u64le(feeBps),
    u8(holderReward ? 1 : 0),
  ]);
  return {
    programAddress: address(PUMP),
    accounts: [
      MS(mintSigner),
      M(MINT_AUTH, R),
      M(bc, W),
      M(ata(bc, mintPk, TOKEN22), W),
      M(GLOBAL, R),
      MS(user),
      M(SYSTEM, R),
      M(TOKEN22, R),
      M(ATA_PROG, R),
      M(MAYHEM, W),
      M(MAYHEM_PARAMS, R),
      M(SOL_VAULT, W),
      M(ms, W),
      M(ata(ms, mintPk, TOKEN22), W),
      M(EVENT_AUTH, R),
      M(PUMP, R),
      M(WXMR, R),
      M(ata(bc, WXMR, TOKEN), W),
      M(TOKEN, R),
      M(QUOTE_CONTROL, R),
    ],
    data: new Uint8Array(data),
  };
}

function tradeAccounts({ user, mintPk, creator, includeGlobalVol }) {
  const bc = bondingCurvePda(mintPk);
  const cv = creatorVaultPda(creator);
  const uva = userVolAccPda(user.address);
  const accs = [
    M(GLOBAL, R),
    M(mintPk, R),
    M(WXMR, R),
    M(TOKEN22, R),
    M(TOKEN, R),
    M(ATA_PROG, R),
    M(FEE_RECIPIENT, W),
    M(ata(FEE_RECIPIENT, WXMR, TOKEN), W),
    M(BUYBACK_RECIPIENT, W),
    M(ata(BUYBACK_RECIPIENT, WXMR, TOKEN), W),
    M(bc, W),
    M(ata(bc, mintPk, TOKEN22), W),
    M(ata(bc, WXMR, TOKEN), W),
    MS(user),
    M(ata(user.address, mintPk, TOKEN22), W),
    M(ata(user.address, WXMR, TOKEN), W),
    M(cv, W),
    M(ata(cv, WXMR, TOKEN), W),
    M(sharingConfigPda(mintPk), R),
  ];
  if (includeGlobalVol) accs.push(M(GLOBAL_VOL, R));
  accs.push(
    M(uva, W),
    M(ata(uva, WXMR, TOKEN), W),
    M(FEE_CONFIG, R),
    M(FEE_PROG, R),
    M(SYSTEM, R),
    M(EVENT_AUTH, R),
    M(PUMP, R),
  );
  return accs;
}

function buyIx({ user, mintPk, creator, spendable }) {
  return {
    programAddress: address(PUMP),
    accounts: tradeAccounts({ user, mintPk, creator, includeGlobalVol: true }),
    data: new Uint8Array(Buffer.concat([disc("buy_exact_quote_in_v2"), u64le(spendable), u64le(1), u8(0)])),
  };
}

function sellIx({ user, mintPk, creator, amount }) {
  return {
    programAddress: address(PUMP),
    accounts: tradeAccounts({ user, mintPk, creator, includeGlobalVol: false }),
    data: new Uint8Array(Buffer.concat([disc("sell_v2"), u64le(amount), u64le(1)])),
  };
}

function initUserVolIx(payer, user) {
  return {
    programAddress: address(PUMP),
    accounts: [MS(payer), M(user, R), M(userVolAccPda(user), W), M(SYSTEM, R), M(EVENT_AUTH, R), M(PUMP, R)],
    data: new Uint8Array(disc("init_user_volume_accumulator")),
  };
}

function collectIx(creator) {
  const cv = creatorVaultPda(creator);
  return {
    programAddress: address(PUMP),
    accounts: [
      M(creator, W),
      M(ata(creator, WXMR, TOKEN), W),
      M(cv, W),
      M(ata(cv, WXMR, TOKEN), W),
      M(WXMR, R),
      M(TOKEN, R),
      M(ATA_PROG, R),
      M(SYSTEM, R),
      M(EVENT_AUTH, R),
      M(PUMP, R),
    ],
    data: new Uint8Array(disc("collect_creator_fee_v2")),
  };
}

function decodeCurve(svm, curvePk) {
  const acc = svm.getAccount(address(S(curvePk)));
  if (!acc || acc.exists === false) return null;
  const d = Buffer.from(acc.data);
  if (d.length < 125) throw new Error(`bonding curve too short: ${d.length}`);
  return {
    len: d.length,
    vToken: d.readBigUInt64LE(8),
    vQuote: d.readBigUInt64LE(16),
    rToken: d.readBigUInt64LE(24),
    rQuote: d.readBigUInt64LE(32),
    supply: d.readBigUInt64LE(40),
    complete: d[48],
    creator: new PublicKey(d.subarray(49, 81)).toBase58(),
    mayhem: d[81],
    cashback: d[82],
    quoteMint: new PublicKey(d.subarray(83, 115)).toBase58(),
    creatorFeeBps: d.readBigUInt64LE(115),
    canEdit: d[123],
    isHolderReward: d[124],
  };
}

// ---------- main ----------
async function main() {
  const steps = { createA: "FAIL", buy: "FAIL", sell: "FAIL", collect: "FAIL", createB: "FAIL" };
  const nums = { vaultBefore: null, creatorBefore: null, creatorAfter: null };

  const finish = () => {
    console.log("\n===== SUMMARY =====");
    for (const [k, v] of Object.entries(steps)) console.log(`STEP ${k}: ${v}`);
    console.log(`vaultBefore=${nums.vaultBefore}`);
    console.log(`creatorBefore=${nums.creatorBefore}`);
    console.log(`creatorAfter=${nums.creatorAfter}`);
    const all = Object.values(steps).every((v) => v === "PASS");
    process.exit(all ? 0 : 1);
  };

  const svm = new LiteSVM();

  // 1. fixtures
  const fixDir = new URL("../fixtures/", import.meta.url);
  for (const name of FIXTURES) {
    const j = JSON.parse(fs.readFileSync(new URL(`${name}.json`, fixDir), "utf8"));
    const buf = Buffer.from(j.data, "base64");
    svm.setAccount({
      address: address(j.pubkey),
      lamports: BigInt(j.lamports),
      data: new Uint8Array(buf),
      executable: !!j.executable,
      programAddress: address(j.owner),
      space: BigInt(buf.length),
    });
    console.log(`  loaded ${name} ${j.pubkey} (${buf.length} bytes, exec=${!!j.executable})`);
  }
  console.log("fixtures loaded");

  // 1b. register the three upgradeable programs from their programdata ELFs
  // (setAccount alone does not make loader-v3 programs executable in LiteSVM)
  const LOADER_V3 = "BPFLoaderUpgradeab1e11111111111111111111111";
  for (const [label, prog] of [["pump_programdata", PUMP], ["feeprog_programdata", FEE_PROG], ["mayhem_programdata", MAYHEM]]) {
    const j = JSON.parse(fs.readFileSync(new URL(`${label}.json`, fixDir), "utf8"));
    const elf = elfFromProgramData(Buffer.from(j.data, "base64"));
    try {
      svm.addProgramWithLoader(address(prog), elf, address(LOADER_V3));
    } catch (e) {
      console.log(`  addProgramWithLoader(${label}) threw ${e}; falling back to addProgram`);
      svm.addProgram(address(prog), elf);
    }
    console.log(`  registered program ${prog} from ${label} (ELF ${elf.length} bytes)`);
  }

  // 2. user + mint A
  const user = await generateKeyPairSigner();
  svm.airdrop(user.address, lamports(10_000_000_000n));
  const mintA = Keypair.generate();
  const mintASigner = await createKeyPairSignerFromBytes(mintA.secretKey);
  const mintAPk = mintA.publicKey;
  console.log(`user=${user.address}`);
  console.log(`mintA=${mintAPk.toBase58()}`);

  // 3. creator PDA
  const throwawayProgram = Keypair.generate().publicKey;
  const creatorPda = PublicKey.findProgramAddressSync([Buffer.from("ombro-creator")], throwawayProgram)[0];
  console.log(`creatorPda=${creatorPda.toBase58()} (program ${throwawayProgram.toBase58()}, onCurve=${PublicKey.isOnCurve(creatorPda.toBytes())})`);

  // 4. fabricate user wXMR ATA
  const userWxmrAta = ata(user.address, WXMR, TOKEN);
  {
    const d = Buffer.alloc(165);
    PK(WXMR).toBuffer().copy(d, 0);
    PK(user.address).toBuffer().copy(d, 32);
    d.writeBigUInt64LE(10_000_000_000_000n, 64);
    d[108] = 1;
    svm.setAccount({
      address: address(userWxmrAta.toBase58()),
      lamports: 2039280n,
      data: new Uint8Array(d),
      executable: false,
      programAddress: address(TOKEN),
      space: 165n,
    });
  }
  console.log(`user wXMR ATA=${userWxmrAta.toBase58()} balance=${tokenAmount(svm, userWxmrAta)}`);

  // 5. setup ATAs
  const creatorVaultA = creatorVaultPda(creatorPda);
  const uva = userVolAccPda(user.address);
  console.log(`creatorVaultA=${creatorVaultA.toBase58()} userVolAcc=${uva.toBase58()}`);
  {
    const ixs = [
      ataCreateIx(user, ata(FEE_RECIPIENT, WXMR, TOKEN), FEE_RECIPIENT, WXMR, TOKEN),
      ataCreateIx(user, ata(BUYBACK_RECIPIENT, WXMR, TOKEN), BUYBACK_RECIPIENT, WXMR, TOKEN),
      ataCreateIx(user, ata(creatorVaultA, WXMR, TOKEN), creatorVaultA, WXMR, TOKEN),
      ataCreateIx(user, ata(creatorPda, WXMR, TOKEN), creatorPda, WXMR, TOKEN),
      ataCreateIx(user, ata(user.address, mintAPk, TOKEN22), user.address, mintAPk, TOKEN22),
      ataCreateIx(user, ata(uva, WXMR, TOKEN), uva, WXMR, TOKEN),
    ];
    // NOTE: ATA(user,mintA,TOKEN22) needs mintA to exist; split it out to after create if setup fails on that.
    const pre = ixs.filter((_, i) => i !== 4);
    const r = await sendReport(svm, user, pre, "setup-atas");
    if (!r.ok) {
      const joined = (r.logs || []).join("\n") + fmt(r.err);
      if (!/already in use/i.test(joined)) throw new Error("setup tx failed (not already-in-use)");
      console.log("setup failure was already-in-use style; continuing");
    }
  }

  // 6. create coin A
  const rA = await sendReport(
    svm,
    user,
    [
      computeIx(),
      createV2Ix({
        user,
        mintSigner: mintASigner,
        mintPk: mintAPk,
        name: "Ombro Test",
        symbol: "OMBROTEST",
        uri: "https://example.invalid/ombro-test.json",
        creator: creatorPda,
        cashback: 0,
        feeBps: 300n,
        holderReward: 0,
      }),
    ],
    "createA",
  );
  if (!rA.ok) return finish();

  // 7. verify curve A
  const curveA = decodeCurve(svm, bondingCurvePda(mintAPk));
  console.log("curveA:", fmt(curveA));
  console.log(`  quote_mint=${curveA.quoteMint}`);
  console.log(`  creator=${curveA.creator}`);
  console.log(`  creator_fee_bps=${curveA.creatorFeeBps}`);
  console.log(`  is_holder_reward=${curveA.isHolderReward}`);
  const aOk = curveA.quoteMint === WXMR && curveA.creator === creatorPda.toBase58() && curveA.creatorFeeBps === 300n;
  console.log(`curveA assertions (quote==WXMR, creator==creatorPda, bps==300): ${aOk ? "PASS" : "FAIL"}`);
  steps.createA = aOk ? "PASS" : "FAIL";
  if (!aOk) return finish();

  // user's base-token ATA (mint now exists)
  {
    const r = await sendReport(
      svm,
      user,
      [ataCreateIx(user, ata(user.address, mintAPk, TOKEN22), user.address, mintAPk, TOKEN22)],
      "user-baseA-ata",
    );
    if (!r.ok) throw new Error("failed to create user base-token ATA");
  }

  // 8. buy
  const buy = () =>
    sendReport(svm, user, [computeIx(), buyIx({ user, mintPk: mintAPk, creator: creatorPda, spendable: 1_000_000_000_000n })], "buy");
  let rBuy = await buy();
  if (!rBuy.ok) {
    const joined = (rBuy.logs || []).join("\n") + "\n" + fmt(rBuy.err);
    if (/user_volume_accumulator|AccountNotFound|AccountNotInitialized|3012/i.test(joined)) {
      console.log("buy failed on user_volume_accumulator-ish error; initializing and retrying");
      const rInit = await sendReport(svm, user, [computeIx(), initUserVolIx(user, user.address)], "init_user_volume_accumulator");
      if (rInit.ok) {
        // ensure uva wXMR ATA exists (idempotent)
        await sendReport(svm, user, [ataCreateIx(user, ata(uva, WXMR, TOKEN), uva, WXMR, TOKEN)], "uva-wxmr-ata");
        rBuy = await buy();
      }
    }
  }
  steps.buy = rBuy.ok ? "PASS" : "FAIL";
  const baseBal = tokenAmount(svm, ata(user.address, mintAPk, TOKEN22));
  console.log(`after buy: user base balance=${baseBal} user wXMR=${tokenAmount(svm, userWxmrAta)}`);
  if (!rBuy.ok) return finish();

  // 9. sell half
  const sellAmt = (baseBal ?? 0n) / 2n;
  console.log(`selling ${sellAmt}`);
  const rSell = await sendReport(svm, user, [computeIx(), sellIx({ user, mintPk: mintAPk, creator: creatorPda, amount: sellAmt })], "sell");
  steps.sell = rSell.ok ? "PASS" : "FAIL";
  console.log(`after sell: user base balance=${tokenAmount(svm, ata(user.address, mintAPk, TOKEN22))} user wXMR=${tokenAmount(svm, userWxmrAta)}`);

  // 10. balances before collect
  const vaultAtaA = ata(creatorVaultA, WXMR, TOKEN);
  const creatorAtaA = ata(creatorPda, WXMR, TOKEN);
  nums.vaultBefore = tokenAmount(svm, vaultAtaA);
  nums.creatorBefore = tokenAmount(svm, creatorAtaA);
  console.log(`vaultBefore=${nums.vaultBefore} creatorBefore=${nums.creatorBefore}`);

  // 11. collect
  const rCol = await sendReport(svm, user, [computeIx(), collectIx(creatorPda)], "collect");
  nums.creatorAfter = tokenAmount(svm, creatorAtaA);
  const vaultAfter = tokenAmount(svm, vaultAtaA);
  console.log(`creatorAfter=${nums.creatorAfter} vaultAfter=${vaultAfter}`);
  const colOk =
    rCol.ok &&
    nums.vaultBefore != null &&
    nums.creatorBefore != null &&
    nums.creatorAfter != null &&
    nums.vaultBefore > 0n &&
    nums.creatorAfter - nums.creatorBefore === nums.vaultBefore;
  steps.collect = colOk ? "PASS" : "FAIL";

  // 12. coin B with holder reward
  const mintB = Keypair.generate();
  const mintBSigner = await createKeyPairSignerFromBytes(mintB.secretKey);
  const mintBPk = mintB.publicKey;
  const creatorB = (await generateKeyPairSigner()).address;
  console.log(`mintB=${mintBPk.toBase58()} creatorB(arg)=${creatorB}`);
  const rB = await sendReport(
    svm,
    user,
    [
      computeIx(),
      createV2Ix({
        user,
        mintSigner: mintBSigner,
        mintPk: mintBPk,
        name: "Ombro Test B",
        symbol: "OMBROB",
        uri: "https://example.invalid/ombro-test-b.json",
        creator: creatorB,
        cashback: 0,
        feeBps: 30n,
        holderReward: 1,
      }),
    ],
    "createB",
  );
  if (rB.ok) {
    const curveB = decodeCurve(svm, bondingCurvePda(mintBPk));
    const hr = holderRewardsPda(mintBPk).toBase58();
    console.log("curveB:", fmt(curveB));
    console.log(`curveB.creator=${curveB.creator}`);
    console.log(`holderRewardsPda=${hr}`);
    console.log(`creator arg passed=${creatorB}`);
    console.log(`COIN_B_CREATOR_IS_HOLDER_REWARDS_PDA: ${curveB.creator === hr}`);
    console.log(`COIN_B_CREATOR_IS_ARG: ${curveB.creator === String(creatorB)}`);
    console.log(`curveB.is_holder_reward=${curveB.isHolderReward}`);
    steps.createB = "PASS";
  }

  // 13. summary
  finish();
}

try {
  await main();
} catch (e) {
  console.error("FATAL:", e && e.stack ? e.stack : e);
  process.exit(2);
}
