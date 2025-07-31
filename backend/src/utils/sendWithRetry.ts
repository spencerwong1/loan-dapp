import { ContractTransactionResponse } from "ethers";
import { log } from "./logger";

/**
 * 发送交易并自动重试（默认 3 次）。
 * - nonce 冲突、gas fee too low 等常见错误会重试
 */
export async function sendWithRetry(
  txFn: () => Promise<ContractTransactionResponse>,
  retries = 3
) {
  let lastErr: any;

  for (let i = 0; i < retries; i++) {
    try {
      const tx = await txFn();
      log(`[TX]  sent ${tx.hash}`);
      const rec = await tx.wait();               // rec 可能为 null; 日志里做非空断言
      log(`[TX]  confirmed ${tx.hash} (block ${rec!.blockNumber})`);
      return rec;
    } catch (err: any) {
      lastErr = err;
      const msg = err.shortMessage || err.message || err.toString();
      log(`[WARN] send tx failed (try ${i + 1}/${retries}): ${msg}`);

      // 简易可重试判定
      const retryable =
        /nonce/i.test(msg) ||
        /replacement fee/i.test(msg) ||
        /fee too low/i.test(msg);
      if (i < retries - 1 && retryable) {
        log("[INFO] retrying…");
        continue;
      }
      break;
    }
  }
  throw lastErr;
}
