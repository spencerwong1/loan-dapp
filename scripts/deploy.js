const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy MockToken
  const MockToken = await hre.ethers.getContractFactory("MockToken");
  const mockToken = await MockToken.deploy();
  await mockToken.waitForDeployment();
  console.log("MockToken deployed to:", mockToken.target);

  // Deploy LoanFactory
  const LoanFactory = await hre.ethers.getContractFactory("LoanFactory");
  const loanFactory = await LoanFactory.deploy();
  await loanFactory.waitForDeployment();
  console.log("LoanFactory deployed to:", loanFactory.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});