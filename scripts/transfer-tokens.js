const hre = require("hardhat");

async function main() {
  // Get the deployer account (has all the MTK tokens)
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deployer account:", deployer.address);

  // Token contract address (update this with your deployed address)
  const tokenAddress = "0xE20F9c547C09f6259003c127765865F5c55dB40C"; // Final fixed contract with overpayment refunds and late fee fixes
  
  // Get token contract
  const MockToken = await hre.ethers.getContractFactory("MockToken");
  const token = MockToken.attach(tokenAddress);

  // Check deployer balance
  const deployerBalance = await token.balanceOf(deployer.address);
  console.log("Deployer MTK balance:", hre.ethers.formatUnits(deployerBalance, 18));

  // Target address to send tokens to (change this to your address)
  const targetAddress = process.env.TARGET_ADDRESS || "YOUR_ADDRESS_HERE";
  
  if (targetAddress === "YOUR_ADDRESS_HERE") {
    console.log("❌ Please set TARGET_ADDRESS environment variable or update the script");
    console.log("Example: TARGET_ADDRESS=0x123... npx hardhat run scripts/transfer-tokens.js --network sepolia");
    return;
  }

  // Amount to transfer (10,000 MTK tokens)
  const transferAmount = hre.ethers.parseUnits("10000", 18);

  console.log(`Transferring ${hre.ethers.formatUnits(transferAmount, 18)} MTK to ${targetAddress}...`);

  // Transfer tokens
  const tx = await token.transfer(targetAddress, transferAmount);
  await tx.wait();

  console.log("✅ Transfer successful!");
  console.log("Transaction hash:", tx.hash);

  // Check balances after transfer
  const newDeployerBalance = await token.balanceOf(deployer.address);
  const targetBalance = await token.balanceOf(targetAddress);
  
  console.log("\n📊 Updated Balances:");
  console.log("Deployer balance:", hre.ethers.formatUnits(newDeployerBalance, 18), "MTK");
  console.log("Target balance:", hre.ethers.formatUnits(targetBalance, 18), "MTK");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});