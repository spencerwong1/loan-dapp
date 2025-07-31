const hre = require("hardhat");

async function main() {
  console.log("⏰ Testing Loan Timing & Due Dates...\n");

  const factoryAddress = "0xe6F3182d08cF2479a8826EA09C14389897459571";
  const LoanFactory = await hre.ethers.getContractFactory("LoanFactory");
  const factory = LoanFactory.attach(factoryAddress);
  const LoanAgreement = await hre.ethers.getContractFactory("LoanAgreement");

  const loans = await factory.getLoans();
  
  for (let i = 0; i < loans.length; i++) {
    const loanAddress = loans[i];
    console.log(`📋 Loan ${i + 1}: ${loanAddress}`);
    
    try {
      const loan = LoanAgreement.attach(loanAddress);

      const [
        principal,
        totalInstallments,
        installmentInterval,
        startTimestamp,
        repaidAmount,
        missedInstallments,
        status
      ] = await Promise.all([
        loan.principal(),
        loan.totalInstallments(),
        loan.installmentInterval(),
        loan.startTimestamp(),
        loan.getRepaidAmount(),
        loan.countMissedInstallments(),
        loan.getStatus()
      ]);

      const principalEther = hre.ethers.formatUnits(principal, 18);
      const repaidEther = hre.ethers.formatUnits(repaidAmount, 18);
      const now = Math.floor(Date.now() / 1000);
      
      console.log(`   💰 Principal: ${principalEther} MTK`);
      console.log(`   📊 Total Installments: ${totalInstallments}`);
      console.log(`   ⏱️  Installment Interval: ${installmentInterval} seconds`);
      console.log(`   📅 Started: ${new Date(parseInt(startTimestamp) * 1000).toLocaleString()}`);
      console.log(`   💸 Repaid: ${repaidEther} MTK`);
      console.log(`   📋 Status: ${["Active", "Repaid", "Defaulted"][status]}`);
      
      // Calculate timing details
      const intervalDays = parseInt(installmentInterval) / (24 * 60 * 60);
      const intervalHours = parseInt(installmentInterval) / (60 * 60);
      const intervalMinutes = parseInt(installmentInterval) / 60;
      
      console.log(`\n   ⏰ TIMING BREAKDOWN:`);
      if (intervalDays >= 1) {
        console.log(`   Installment every: ${intervalDays.toFixed(2)} days`);
      } else if (intervalHours >= 1) {
        console.log(`   Installment every: ${intervalHours.toFixed(2)} hours`);
      } else {
        console.log(`   Installment every: ${intervalMinutes.toFixed(2)} minutes`);
      }
      
      // Calculate due dates
      const firstDue = parseInt(startTimestamp) + parseInt(installmentInterval);
      const secondDue = parseInt(startTimestamp) + (2 * parseInt(installmentInterval));
      const thirdDue = parseInt(startTimestamp) + (3 * parseInt(installmentInterval));
      
      console.log(`   1st payment due: ${new Date(firstDue * 1000).toLocaleString()}`);
      console.log(`   2nd payment due: ${new Date(secondDue * 1000).toLocaleString()}`);
      console.log(`   3rd payment due: ${new Date(thirdDue * 1000).toLocaleString()}`);
      
      // Check what should be overdue
      const timeElapsed = now - parseInt(startTimestamp);
      const expectedPayments = Math.floor(timeElapsed / parseInt(installmentInterval));
      const actualMissed = parseInt(missedInstallments);
      
      console.log(`\n   📊 PAYMENT STATUS:`);
      console.log(`   Time elapsed: ${Math.floor(timeElapsed / 60)} minutes`);
      console.log(`   Expected payments by now: ${expectedPayments}`);
      console.log(`   Contract says missed: ${actualMissed}`);
      
      if (now > firstDue) {
        const overdueTime = now - firstDue;
        console.log(`   🚨 FIRST PAYMENT OVERDUE by: ${Math.floor(overdueTime / 60)} minutes`);
        
        if (actualMissed === 0) {
          console.log(`   ⚠️  CONTRACT BUG: Should show missed payments but shows 0!`);
        }
      } else {
        const timeUntilDue = firstDue - now;
        console.log(`   ⏳ First payment due in: ${Math.floor(timeUntilDue / 60)} minutes`);
      }

    } catch (error) {
      console.log(`   ❌ Error: ${error.message}`);
    }

    console.log(`${'='.repeat(80)}\n`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});