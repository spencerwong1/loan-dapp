import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { log } from "./utils/logger";
import { sendWithRetry } from "./utils/sendWithRetry";

dotenv.config();

/* ─── 类型 & 配置读取 ───────────────────────────── */
type ContractConfig = { address: string; abi: string };
type ContractMap = Record<string, ContractConfig>;
const cfgPath = path.resolve(__dirname, "..", "contracts.json");
const configs: ContractMap = JSON.parse(fs.readFileSync(cfgPath, "utf8"));

/* ─── Provider & Signer ────────────────────────── */
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL!);
const PK = process.env.PAYER_PRIVATE_KEY;
const wallet = PK ? new ethers.Wallet(PK, provider) : null;

/* ─── 构建合约实例列表 ─────────────────────────── */
async function buildContracts() {
  const list: {
    name: string;
    ro: ethers.BaseContract;
    rw: ethers.BaseContract | null;
  }[] = [];

  for (const [name, cfg] of Object.entries(configs)) {
    const abiJSON = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, "..", cfg.abi), "utf8")
    );
    const abi = abiJSON.abi ?? abiJSON;
    const ro = new ethers.Contract(cfg.address, abi, provider) as ethers.BaseContract;
    const rw = wallet ? (ro.connect(wallet) as ethers.BaseContract) : null;
    list.push({ name, ro, rw });
  }
  return list;
}

/* ─── 轮询逻辑 ─────────────────────────────────── */
const LOOP_SEC = 30;

(async () => {
  const contracts = await buildContracts();
  log(
    `Cron loop ${LOOP_SEC}s — watching ${contracts.length} contract(s).` +
    ` Signer: ${wallet ? wallet.address : "READ‑ONLY"}`
  );

  setInterval(async () => {
    const now = Math.floor(Date.now() / 1000);

    for (const { name, ro, rw } of contracts) {
      try {
        // 1. 读“总欠款” & “已还金额”
        const totalOwed: bigint = await (ro as any).getTotalOwed();
        const repaidAmt: bigint = await (ro as any).getRepaidAmount();
        const remaining: bigint = totalOwed - repaidAmt;

        // 2. 计算下一期到期
        const dueTs: number = Number(await (ro as any).getDueTimestamp());
        if (dueTs === 0 || dueTs > now) {
          const secsLeft = dueTs > now ? dueTs - now : 0;
          log(`[skip] ${name} | next due in ${secsLeft}s (repaid=${repaidAmt})`);
          continue;
        }

        // 3. 若无 signer，仅提示
        if (!rw) {
          log(`[DUE]  ${name} | INSTALLMENT DUE — signer not configured`);
          continue;
        }

        // 4. 计算“每期金额” & “本次应付”
        const totalInst: bigint    = await (ro as any).totalInstallments();
        const installmentAmt: bigint = totalOwed / totalInst;
        const payNow: bigint        = remaining < installmentAmt ? remaining : installmentAmt;

        // ⭐️ 关键：若已还清或超额（payNow ≤ 0），跳过
        if (payNow <= 0n) {
          log(`[done] ${name} | loan fully repaid`);
          continue;
        }

        // 5. 触发 repay()
        await sendWithRetry(() =>
          (rw as any).repay(payNow, { gasLimit: 300_000 })
        );
      } catch (err: any) {
        log(`[ERR] ${name} | ${err.shortMessage || err.message || err}`);
      }
    }
  }, LOOP_SEC * 1000);
})();
