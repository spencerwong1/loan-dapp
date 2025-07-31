import express from "express";
import fs from "fs";
import path from "path";
import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// ----- provider & signer -----
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL!);
const wallet = new ethers.Wallet(process.env.PAYER_PRIVATE_KEY!, provider);

// ----- /status -----
app.get("/status", (_, res) => {
  try {
    const lines = fs.readFileSync("logs/pay.log", "utf8").trim().split("\n");
    const last = lines.slice(-1)[0] || "";

    // 支持两种日志格式
    const matchTxLog = last.match(/confirmed (\S+) \(block (\d+)\) amount=(\d+)/);
    const matchCsv = last.match(/^\d+,(0x[a-fA-F0-9]+),(\d+),(\d+)$/);

    if (matchTxLog) {
      const [_, txHash, block, amount] = matchTxLog;
      res.json({
        lastTxHash: txHash,
        lastBlock: parseInt(block),
        lastAmount: amount
      });
    } else if (matchCsv) {
      const [_, txHash, block, amount] = matchCsv;
      res.json({
        lastTxHash: txHash,
        lastBlock: parseInt(block),
        lastAmount: amount
      });
    } else {
      res.json({
        lastTxHash: null,
        lastBlock: null,
        lastAmount: null
      });
    }
  } catch (err) {
    console.error("[ERR] Failed to read pay.log", err);
    res.status(500).json({ error: "Failed to read log file" });
  }
});

app.post("/trigger/:addr", async (req, res) => {
  try {
    const addr = req.params.addr.toLowerCase();
    const abiPath = path.resolve("abis/LoanAgreement.json");
    const abi = JSON.parse(fs.readFileSync(abiPath, "utf8")).abi;
    const loan = new ethers.Contract(addr, abi, wallet);

    const totalOwed = await loan.getTotalOwed();
    const repaid = await loan.getRepaidAmount();

    if (repaid >= totalOwed) {
      return res.json({ ok: false, error: "Loan already fully repaid" });
    }

    const numInstallments = await loan.totalInstallments();
    const amount = totalOwed / numInstallments;

    try {
      const sentAt = new Date();
      const tx = await loan.repay(amount, { gasLimit: 300_000 });
      const receipt = await tx.wait();

      const iso = sentAt.toISOString();
      const logLines = [
        `${iso} [info] [TX] sent ${tx.hash}`,
        `${iso} [info] [TX] confirmed ${tx.hash} (block ${receipt.blockNumber}) amount=${amount.toString()}`
      ].join("\n");

      fs.mkdirSync("logs", { recursive: true });
      fs.appendFileSync("logs/pay.log", logLines + "\n", "utf8");

      return res.json({
        ok: true,
        message: "Repayment successful",
        txHash: tx.hash,
        block: receipt.blockNumber,
        amount: amount.toString(),
      });

    } catch (e: any) {
      console.error("[ERR] Repayment failed:", e);
      if (e?.error?.message?.includes("ERC20InsufficientAllowance")) {
        return res.json({ ok: false, error: "Repayment exceeds total owed" });
      }
      return res.json({ ok: false, error: "Repayment failed" });
    }

  } catch (err) {
    console.error("[ERR] Unexpected trigger error:", err);
    return res.json({ ok: false, error: "Unexpected server error" });
  }
});



// ----- Start server -----
app.listen(PORT, () => {
  console.log(`API server running at http://localhost:${PORT}`);
});
