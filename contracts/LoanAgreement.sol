// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


/// @title Enforces loan terms such as repayment logic, timestamps, status, and trust interactions
/// @author Ethan Wong, Tony Wang

contract LoanAgreement {
    using SafeERC20 for IERC20;

    // Storage //////////////////////////////////////////////////////////////

    // loan status
    enum LoanStatus { Active, Repaid, Defaulted }

    // loan vars
    address public lender;
    address public borrower;
    uint256 public principal;
    uint256 public interestPercent;
    uint256 public dueTimestamp; // legacy use, not relied upon with installments
    uint256 public lateFeePercent;
    address public tokenAddress;
    address public factory;

    // installment-specific vars
    uint256 public totalInstallments;
    uint256 public installmentInterval;
    uint256 public startTimestamp;

    // contract state vars
    uint256 public repaidAmount;
    uint256 public accumulatedLateFees; // PERMANENT storage for late fees
    bool public markedDefault;
    mapping(uint256 => bool) public latePenaltyApplied; // tracks which installment periods have been penalized

    // events
    event Repaid(address indexed payer, uint256 amount, uint256 totalRepaid);
    event FullyRepaid(address indexed loan);
    event DefaultMarked(address indexed loan, address indexed lender);
    event LatePaymentPenalty(address indexed borrower, uint256 installmentNumber, int256 trustScoreChange);
    event LateFeeAccumulated(address indexed borrower, uint256 installmentNumber, uint256 lateFeeAmount, uint256 totalAccumulatedFees);
    event RefundIssued(address indexed borrower, uint256 refundAmount);

    event DebugRepayment(uint256 allowance, uint256 borrowerBalance, uint256 totalOwed); // TESTING REPAYMENTS

    // Functions ///////////////////////////////////////////////////////////////////////

    /// @notice                 constructor for loan agreement
    /// @param _lender          lender address
    /// @param _borrower        borrower address
    /// @param _amount          principal loan
    /// @param _token           ERC-20 token address
    /// @param _duration        loan second duration
    /// @param _interestPercent interest rate
    /// @param _lateFeePercent  penalty interest for late payment
    /// @param _installments    number of repayments expected
    /// @param _factory         factory contract address
    constructor(
        address _lender,
        address _borrower,
        uint256 _amount,
        address _token,
        uint256 _duration,
        uint256 _interestPercent,
        uint256 _lateFeePercent,
        uint256 _installments,
        address _factory
    ) {
        lender = _lender;
        borrower = _borrower;
        principal = _amount;
        tokenAddress = _token;
        interestPercent = _interestPercent;
        lateFeePercent = _lateFeePercent;
        totalInstallments = _installments;
        installmentInterval = _duration / _installments;
        factory = _factory;
        startTimestamp = block.timestamp;
        dueTimestamp = startTimestamp + _duration; // optional legacy usage
    }

    /// @notice         called by borrower to repay loan (accepts overpayments and refunds excess)
    /// @param amount   amount to be repaid
    function repay(uint256 amount) external {
        // ensure user authorised
        require(msg.sender == borrower, "Only borrower can repay");

        // Check for any late payment penalties FIRST (this updates accumulatedLateFees)
        checkAndPenalizeLatePayments();

        // Get current total owed (includes any newly accumulated late fees)
        uint256 currentTotalOwed = getTotalOwed();
        uint256 remainingOwed = currentTotalOwed - repaidAmount;

        // cap payment amount to avoid overpayment instead of sending excess and refunding
        uint256 actualPayment = amount > remainingOwed ? remainingOwed : amount;
        require(actualPayment > 0, "No amount due or invalid payment");

        // ensure token transfer success
        IERC20 token = IERC20(tokenAddress);

        // debug event: check balances and allowance before transfer
        emit DebugRepayment(
            token.allowance(msg.sender, address(this)),
            token.balanceOf(msg.sender),
            currentTotalOwed
        );

        // transfer only the capped amount
        token.safeTransferFrom(msg.sender, lender, actualPayment);
            
        // update contract state and emit event
        repaidAmount += actualPayment;
        emit Repaid(msg.sender, actualPayment, repaidAmount);

        // check if loan fully paid
        if (getStatus() == LoanStatus.Repaid) {
            // emit event and update borrower trust score
            emit FullyRepaid(address(this));
            // Only give positive reward if no late penalties were applied
            bool hadLatePenalties = false;
            for (uint256 i = 1; i <= totalInstallments; i++) {
                if (latePenaltyApplied[i]) {
                    hadLatePenalties = true;
                    break;
                }
            }
            
            if (!hadLatePenalties) {
                _updateTrustScore(1); // Reward for perfect payment history
            }
            // Note: No additional penalty here since late payments were already penalized individually
        }
    }

    /// @notice mark a loan as defaulted (by lender) after final due date
    function markDefault() external {
        // ensure user is authorised and loan is valid and overdue
        require(msg.sender == lender, "Only lender can mark default");
        require(getStatus() == LoanStatus.Active, "Loan not active or already handled");
        require(block.timestamp > startTimestamp + (totalInstallments * installmentInterval), "Loan is not overdue yet");

        // Check for any remaining late payment penalties before default
        checkAndPenalizeLatePayments();

        // update contract state and emit event
        markedDefault = true;
        emit DefaultMarked(address(this), lender);

        // update borrower trust score with default penalty
        _updateTrustScore(-2);
    }

    /// @notice         get loan status
    /// @return status  current loan status
    function getStatus() public view returns (LoanStatus) {
        // defaulted check
        if (markedDefault) return LoanStatus.Defaulted;

        // repaid check
        if (repaidAmount >= getTotalOwed()) return LoanStatus.Repaid;

        // otherwise active
        return LoanStatus.Active;
    }

    /// @notice View-only function to see which payments would be penalized (no state changes)
    function getUnpenalizedLatePayments() public view returns (uint256[] memory lateInstallments, uint256 potentialPenalties) {
        uint256 currentTime = block.timestamp;
        uint256 elapsedPeriods = (currentTime - startTimestamp) / installmentInterval;
        
        if (elapsedPeriods > totalInstallments) {
            elapsedPeriods = totalInstallments;
        }
        
        // Count potential penalties
        uint256 count = 0;
        for (uint256 i = 1; i <= elapsedPeriods; i++) {
            uint256 dueTime = startTimestamp + (i * installmentInterval);
            
            if (currentTime > dueTime && !latePenaltyApplied[i]) {
                uint256 totalAmountWithInterest = principal + (principal * interestPercent) / 100;
                uint256 expectedAmountByPeriod = (totalAmountWithInterest * i) / totalInstallments;
                
                if (repaidAmount < expectedAmountByPeriod) {
                    count++;
                }
            }
        }
        
        // Build array of late installments
        lateInstallments = new uint256[](count);
        uint256 index = 0;
        
        for (uint256 i = 1; i <= elapsedPeriods; i++) {
            uint256 dueTime = startTimestamp + (i * installmentInterval);
            
            if (currentTime > dueTime && !latePenaltyApplied[i]) {
                uint256 totalAmountWithInterest = principal + (principal * interestPercent) / 100;
                uint256 expectedAmountByPeriod = (totalAmountWithInterest * i) / totalInstallments;
                
                if (repaidAmount < expectedAmountByPeriod) {
                    lateInstallments[index] = i;
                    index++;
                }
            }
        }
        
        potentialPenalties = count;
    }

    /// @notice Check for late payments and apply penalties (PERMANENTLY accumulates late fees)
    function checkAndPenalizeLatePayments() public {
        uint256 currentTime = block.timestamp;
        uint256 elapsedPeriods = (currentTime - startTimestamp) / installmentInterval;
        
        // Cap at total installments
        if (elapsedPeriods > totalInstallments) {
            elapsedPeriods = totalInstallments;
        }
        
        // Check each elapsed period for late payment penalty
        for (uint256 i = 1; i <= elapsedPeriods; i++) {
            uint256 dueTime = startTimestamp + (i * installmentInterval);
            
            // If this period is overdue and hasn't been penalized yet
            if (currentTime > dueTime && !latePenaltyApplied[i]) {
                // Check if payment for this period is actually missing
                uint256 totalAmountWithInterest = principal + (principal * interestPercent) / 100;
                uint256 expectedAmountByPeriod = (totalAmountWithInterest * i) / totalInstallments;
                
                if (repaidAmount < expectedAmountByPeriod) {
                    // Calculate late fee for this specific installment
                    uint256 installmentAmount = totalAmountWithInterest / totalInstallments;
                    uint256 lateFeeForThisInstallment = (installmentAmount * lateFeePercent) / 100;
                    
                    // PERMANENTLY add late fee to accumulated total
                    accumulatedLateFees += lateFeeForThisInstallment;
                    
                    // Apply late payment penalty
                    latePenaltyApplied[i] = true;
                    _updateTrustScore(-1);
                    
                    // Emit events
                    emit LatePaymentPenalty(borrower, i, -1);
                    emit LateFeeAccumulated(borrower, i, lateFeeForThisInstallment, accumulatedLateFees);
                }
            }
        }
    }

    /// @dev        internal helper to update trust score via the factory
    /// @param x    score change amount
    function _updateTrustScore(int256 x) internal {
        (bool success, ) = factory.call(
            abi.encodeWithSignature("updateTrustScore(address,int256)", borrower, x)
        );
        require(success, "Trust score update failed");
    }

    /// @notice calculates total amount owed including interest and ACCUMULATED late fees
    /// @return totalOwed total amount due (includes permanently accumulated late fees)
    function getTotalOwed() public view returns (uint256 totalOwed) {
        // Base amount with interest
        totalOwed = principal + (principal * interestPercent) / 100;
        
        // Add permanently accumulated late fees (these don't disappear when you catch up!)
        totalOwed += accumulatedLateFees;
    }

    /// @notice calculates how many installment deadlines have passed but remain unpaid
    /// @return missed count of missed installments
    function countMissedInstallments() public view returns (uint256 missed) {
        // Calculate how many installment periods have elapsed
        uint256 elapsedPeriods = (block.timestamp - startTimestamp) / installmentInterval;
        if (elapsedPeriods > totalInstallments) elapsedPeriods = totalInstallments;
        
        // Calculate total amount that should have been paid (with interest)
        uint256 totalAmountWithInterest = principal + (principal * interestPercent) / 100;
        uint256 expectedAmountPaid = (totalAmountWithInterest * elapsedPeriods) / totalInstallments;
        
        // If we haven't received the expected amount, calculate missed installments
        if (expectedAmountPaid > repaidAmount) {
            uint256 shortfall = expectedAmountPaid - repaidAmount;
            uint256 installmentAmount = totalAmountWithInterest / totalInstallments;
            
            // Calculate missed installments (rounded up)
            missed = (shortfall + installmentAmount - 1) / installmentAmount;
        }
    }

    function getDueTimestamp() public view returns (uint256) {
        return dueTimestamp;
    }

    function getRepaidAmount() public view returns (uint256) {
        return repaidAmount;
    }
}
