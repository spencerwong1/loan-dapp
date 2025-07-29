// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @title Enforces loan terms such as repayment logic, timestamps, status, and trust interactions
/// @author Ethan Wong, Tony Wang

contract LoanAgreement {

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
    bool public markedDefault;

    // events
    event Repaid(address indexed payer, uint256 amount, uint256 totalRepaid);
    event FullyRepaid(address indexed loan);
    event DefaultMarked(address indexed loan, address indexed lender);

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
        dueTimestamp = startTimestamp + _duration;

        // Transfer tokens from lender to borrower
        IERC20 token = IERC20(_token);
        require(token.transferFrom(_lender, _borrower, _amount), "Token transfer failed");
    }

    /// @notice         called by borrower to repay loan
    /// @param amount   amount to be repaid
    function repay(uint256 amount) external {
        // ensure user authorised
        require(msg.sender == borrower, "Only borrower can repay");

        // Reject the transaction if overpaying
        uint256 totalOwed = getTotalOwed();
        require(repaidAmount + amount <= totalOwed, "Repayment exceeds total owed");

        // ensure token transfer success
        IERC20 token = IERC20(tokenAddress);
        require(token.transferFrom(msg.sender, lender, amount), "Token transfer failed");

        // update contract state and emit event
        repaidAmount += amount;
        emit Repaid(msg.sender, amount, repaidAmount);

        // check if loan fully paid
        if (getStatus() == LoanStatus.Repaid) {
            // emit event and update borrower trust score
            emit FullyRepaid(address(this));
            // penalize if any missed installments, reward if all on time
            if (countMissedInstallments() > 0) {
                _updateTrustScore(-1);
            } else {
                _updateTrustScore(1);
            }
        }
    }

    /// @notice mark a loan as defaulted (by lender) after final due date
    function markDefault() external {
        // ensure user is authorised and loan is valid and overdue
        require(msg.sender == lender, "Only lender can mark default");
        require(getStatus() == LoanStatus.Active, "Loan not active or already handled");
        require(block.timestamp > startTimestamp + (totalInstallments * installmentInterval), "Loan is not overdue yet");

        // update contract state and emit event
        markedDefault = true;
        emit DefaultMarked(address(this), lender);

        // update borrower trust score
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

    /// @dev        internal helper to update trust score via the factory
    /// @param x    score change amount
    function _updateTrustScore(int256 x) internal {
        (bool success, ) = factory.call(
            abi.encodeWithSignature("updateTrustScore(address,int256)", borrower, x)
        );
        require(success, "Trust score update failed");
    }

    /// @notice calculates total amount owed including interest and late fees
    /// @return totalOwed total amount due
    function getTotalOwed() public view returns (uint256 totalOwed) {
        totalOwed = principal + (principal * interestPercent) / 100;

        uint256 missed = countMissedInstallments();
        totalOwed += (principal * lateFeePercent * missed) / (100 * totalInstallments);
    }

    /// @notice calculates how many installment deadlines have passed but remain unpaid
    /// @return missed count of missed installments
    function countMissedInstallments() public view returns (uint256 missed) {
        uint256 expectedPayments = (block.timestamp - startTimestamp) / installmentInterval;
        if (expectedPayments > totalInstallments) expectedPayments = totalInstallments;

        uint256 expectedAmount = (principal + (principal * interestPercent) / 100)
            * expectedPayments / totalInstallments;

        if (expectedAmount > repaidAmount) {
            missed = expectedPayments - (repaidAmount * totalInstallments)
                / (principal + (principal * interestPercent) / 100);
        }
    }

    function getDueTimestamp() public view returns (uint256) {
        return dueTimestamp;
    }

    function getRepaidAmount() public view returns (uint256) {
        return repaidAmount;
    }
}