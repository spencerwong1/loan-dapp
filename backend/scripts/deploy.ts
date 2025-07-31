import { ethers } from "hardhat";

async function main() {
  /* ── 0. 获取默认 signer ───────────────────────── */
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  /* ── 1. 部署 MockUSDC 并给 deployer 铸币 ──────── */
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  console.log("MockUSDC:", await usdc.getAddress());

  /* ── 2. LoanAgreement 参数（可按需调整） ──────── */
  const principal       = ethers.parseUnits("100", 6); // 100 USDC，6 decimals
  const interestPercent = 10;   // 10 %
  const lateFeePercent  = 5;    // 5 %
  const duration        = 90;   // 90 秒总期限
  const installments    = 5;    // 5 期 ⇒ 每期 18 秒
  const tokenAddress    = await usdc.getAddress();
  const factoryAddress  = deployer.address;            // 临时充当 LoanFactory

  /* ── 3. 部署 LoanAgreement ────────────────────── */
  const LoanAgreement = await ethers.getContractFactory("LoanAgreement");
  const loan = await LoanAgreement.deploy(
    deployer.address,  // _lender
    deployer.address,  // _borrower
    principal,         // _amount
    tokenAddress,      // _token
    duration,          // _duration
    interestPercent,   // _interestPercent
    lateFeePercent,    // _lateFeePercent
    installments,      // _installments
    factoryAddress     // _factory
  );
  await loan.waitForDeployment();
  console.log("LoanAgreement deployed to:", await loan.getAddress());

  /* ── 4. 一次性批足额度（MaxUint256） ───────────── */
  await usdc.approve(
    await loan.getAddress(),
    ethers.MaxUint256            // 无限额授权，省去后续重复 approve
    // 若想改回“只批本金”可写 principal
    // 若想精确批“本金+利息”可写：
    // principal + (principal * BigInt(interestPercent) / 100n)
  );
  console.log("Borrower approved LoanAgreement to spend tokens (MaxUint256)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
