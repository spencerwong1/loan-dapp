require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    compilers: [
      { version: "0.8.20" }
    ]
  },
  networks: {
    sepolia: {
      url: process.env.INFURA_URL || "https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID",
      accounts: [process.env.PRIVATE_KEY || "YOUR_PRIVATE_KEY"]
    }
  }
};