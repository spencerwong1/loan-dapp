const hre = require("hardhat");

async function main() {
  console.log("🔍 Testing Late Fee Calculations...\n");

  // Contract addresses (update these with your deployed addresses)
  const factoryAddress = "0xe6F3182d08cF2479a8826EA09C14389897459571";
  const tokenAddress = "0xcF5C43658E0Fc02a67fcc3683d2C9BF9a161AD1C";

  // Get contracts
  const LoanFactory = await hre.ethers.getContractFactory("LoanFactory");
  const factory = LoanFactory.attach(factoryAddress);

  const LoanAgreement = await hre.ethers.getContractFactory("LoanAgreement");

  // Get all loans
  const loans = await factory.getLoans();
  console.log(`Found ${loans.length} loans to test\n`);

  for (let i = 0; i < loans.length; i++) {
    const loanAddress = loans[i];
    console.log(`📋 Loan ${i + 1}: ${loanAddress}`);
    
    try {
      const loan = LoanAgreement.attach(loanAddress);

      // Get loan details
      const [
        borrower,
        lender, 
        principal,
        interestPercent,
        lateFeePercent,
        totalInstallments,
        installmentInterval,
        startTimestamp,
        repaidAmount,
        totalOwed,
        missedInstallments,
        status
      ] = await Promise.all([
        loan.borrower(),
        loan.lender(),
        loan.principal(),
        loan.interestPercent(),
        loan.lateFeePercent(),
        loan.totalInstallments(),
        loan.installmentInterval(),
        loan.startTimestamp(),
        loan.getRepaidAmount(),
        loan.getTotalOwed(),
        loan.countMissedInstallments(),
        loan.getStatus()
      ]);

      const principalEther = hre.ethers.formatUnits(principal, 18);
      const repaidEther = hre.ethers.formatUnits(repaidAmount, 18);
      const totalOwedEther = hre.ethers.formatUnits(totalOwed, 18);

      console.log(`   👤 Borrower: ${borrower}`);
      console.log(`   🏦 Lender: ${lender}`);
      console.log(`   💰 Principal: ${principalEther} MTK`);
      console.log(`   📈 Interest: ${interestPercent}%`);
      console.log(`   ⚠️  Late Fee: ${lateFeePercent}%`);
      console.log(`   📊 Installments: ${totalInstallments}`);
      console.log(`   💸 Repaid: ${repaidEther} MTK`);
      console.log(`   📋 Status: ${["Active", "Repaid", "Defaulted"][status]}`);

      // Calculate expected amounts
      const baseAmount = parseFloat(principalEther) * (1 + parseInt(interestPercent) / 100);
      const expectedLateFees = (parseFloat(principalEther) * parseInt(lateFeePercent) * parseInt(missedInstallments)) / (100 * parseInt(totalInstallments));
      const expectedTotal = baseAmount + expectedLateFees;

      console.log(`\n   🧮 CALCULATION BREAKDOWN:`);
      console.log(`   Base (Principal + Interest): ${baseAmount.toFixed(6)} MTK`);
      console.log(`   Missed Installments: ${missedInstallments}`);
      console.log(`   Expected Late Fees: ${expectedLateFees.toFixed(6)} MTK`);
      console.log(`   Expected Total: ${expectedTotal.toFixed(6)} MTk`);
      console.log(`   Actual Total: ${totalOwedEther} MTK`);
      
      const difference = Math.abs(parseFloat(totalOwedEther) - expectedTotal);
      if (difference < 0.000001) {
        console.log(`   ✅ MATCH: Calculation is correct!`);
      } else {
        console.log(`   ❌ MISMATCH: Difference of ${difference.toFixed(6)} MTK`);
      }

      // Check if payment is overdue
      const now = Math.floor(Date.now() / 1000);
      const nextDue = parseInt(startTimestamp) + parseInt(installmentInterval);
      const isOverdue = now > nextDue && parseInt(missedInstallments) > 0;
      
      if (isOverdue) {
        console.log(`   🚨 OVERDUE: Payment was due ${Math.floor((now - nextDue) / 60)} minutes ago`);
        console.log(`   📊 This should have ${expectedLateFees.toFixed(6)} MTK in late fees`);
      }

    } catch (error) {
      console.log(`   ❌ Error reading loan: ${error.message}`);
    }

    console.log(`${'='.repeat(80)}\n`);
  }

  console.log("✅ Late fee testing complete!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});