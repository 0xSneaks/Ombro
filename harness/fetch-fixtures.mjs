// fetch-fixtures.mjs — download the mainnet accounts the harness clones into LiteSVM.
// Usage:  SOLANA_RPC_URL=<any mainnet RPC url> node fetch-fixtures.mjs
// Read-only. The RPC URL comes from the environment only — never hardcode a key.
// Writes fixtures/<label>.json = {pubkey, lamports, owner, executable, data(base64)}.
import { Connection, PublicKey } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const url = process.env.SOLANA_RPC_URL;
if (!url) { console.error("Set SOLANA_RPC_URL to a mainnet RPC endpoint first."); process.exit(1); }
console.log("RPC host:", new URL(url).hostname);
const conn = new Connection(url, "confirmed");

const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
const FEE_PROG = new PublicKey("pfeeUxB6jkeY1Hxd7CsFCAjcbHA9rWtchMGdZ6VojVZ");
const MAYHEM = new PublicKey("MAyhSmzXzV1pTf7LsNkrNwkWKTo4ougAJ1PPg47MD4e");
const LOADER_V3 = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const pda = (seeds, prog) => PublicKey.findProgramAddressSync(seeds, prog)[0];
const S = (s) => Buffer.from(s);

const targets = new Map();
const add = (label, pk) => targets.set(label, pk);
add("pump_program", PUMP);
add("fee_program", FEE_PROG);
add("mayhem_program", MAYHEM);
add("pump_global", pda([S("global")], PUMP));
add("pump_quote_control", pda([S("quote-control")], PUMP));
add("pump_global_vol_acc", pda([S("global_volume_accumulator")], PUMP));
add("fee_config_live", new PublicKey("8Wf5TiAheLUqBrKXeYg2JtAFFMWtKdG2BSFgqUcPVwTt")); // the fee_config live buy/sell txs pass
add("global_params_mayhem", pda([S("global-params")], MAYHEM));
add("wxmr_mint", new PublicKey("WXMRyRZhsa19ety5erZhHg4N3xj3EVN92u94422teJp"));
add("sol_vault_addr", new PublicKey("BwWK17cbHxwWBKZkUYvzxLcNQ1YVyaFezduWbtm2de6s")); // Global.whitelist_pda
for (const [label, prog] of [["pump", PUMP], ["feeprog", FEE_PROG], ["mayhem", MAYHEM]]) {
  targets.set(label + "_programdata", pda([prog.toBuffer()], LOADER_V3));
}

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
fs.mkdirSync(outDir, { recursive: true });
const infos = await conn.getMultipleAccountsInfo([...targets.values()], "confirmed");
console.log("slot:", await conn.getSlot("confirmed"));
[...targets.entries()].forEach(([label, pk], i) => {
  const info = infos[i];
  if (!info) { console.log(label, pk.toBase58(), "NOT FOUND"); return; }
  fs.writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify({
    pubkey: pk.toBase58(), lamports: info.lamports, owner: info.owner.toBase58(),
    executable: info.executable, data: info.data.toString("base64"),
  }));
  console.log(label, pk.toBase58(), `len=${info.data.length}`);
});
console.log("fixtures written to", outDir);
