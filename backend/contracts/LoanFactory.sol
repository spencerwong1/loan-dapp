/// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.0;

import "./LoanAgreement.sol";

/// @title Central manager to deploy loan contracts and keep track of them
/// @author Ethan Wong, Tony Wang

contract LoanFactory {

    // Storage ///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
    
    address[] public loans;                                                                     // deployed loan tracker
    mapping(address => bool) public isValidLoan;                                                // map loan to validity
    mapping(address => address[]) public loansByBorrower;                                       // map borrower to their loans
    mapping(address => address[]) public loansByLender;                                         // map lender to their loans
    mapping(address => int256) public trustScores;                                              // map user to their trust score
    event LoanCreated(address indexed borrower, address indexed lender, address loanAddress);   // event emitted whenever loan created

    // Loan Agreement Functions //////////////////////////////////////////////////////////////////////////////////////////////////////

    /// @notice                 deploys and records a new LoanAgreement contract
    /// @param _borrower        address of borrower
    /// @param _amount          token value of loan
    /// @param _token           address of erc-20 token
    /// @param _duration        second duration of loan
    /// @param _interestPercent interest percentage
    /// @return loanAddress     address of deployed contract
    function createLoan(        
        address _borrower,
        uint256 _amount,
        address _token,
        uint256 _duration,
        uint256 _interestPercent,
        uint256 _lateFeePercent,
        uint256 _installments
    ) external returns (address loanAddress) {
        // create new instance
        LoanAgreement loan = new LoanAgreement(
            msg.sender,
            _borrower,
            _amount,
            _token,
            _duration,
            _interestPercent,
            _lateFeePercent,
            _installments,
            address(this)
        );

        // validate loan and append to tracking vars
        loanAddress = address(loan);
        loans.push(loanAddress);
        loansByBorrower[_borrower].push(loanAddress);
        loansByLender[msg.sender].push(loanAddress);
        isValidLoan[loanAddress] = true;

        // emit event for frontend to listen for
        emit LoanCreated(_borrower, msg.sender, loanAddress);
    }

    function getLoans() external view returns (address[] memory) {
        return loans;
    }

    function getLoansCount() external view returns (uint256) {
        return loans.length;
    }

    function getBorrowerLoansCount(address user) external view returns (uint256) {
        return loansByBorrower[user].length;
    }

    function getLenderLoansCount(address user) external view returns (uint256) {
        return loansByLender[user].length;
    }

    function getBorrowerLoans(address user) external view returns (address[] memory) {
        return loansByBorrower[user];
    }

    function getLenderLoans(address user) external view returns (address[] memory) {
        return loansByLender[user];
    }

    /// @notice         helper function to filter loans by status
    /// @param loansArr array of loan addresses (borrower or lender)
    /// @param status   loan status to match
    /// @return         filtered list of loan contract addresses
    function getUserLoansByStatus(address[] memory loansArr, LoanAgreement.LoanStatus status) internal view returns (address[] memory) {
        // first pass: count matching loans to synthetically malloc space
        uint256 count = 0;
        for (uint256 i = 0; i < loansArr.length; i++) {
            if (LoanAgreement(loansArr[i]).getStatus() == status) {
                count++;
            }
        }

        // second pass: collect matching loans to populate synthetically mallocd space
        address[] memory res = new address[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < loansArr.length; i++) {
            if (LoanAgreement(loansArr[i]).getStatus() == status) {
                res[j++] = loansArr[i];
            }
        }

        return res;
    }

    /// @notice         filter borrower loans by specific status
    /// @param borrower address of borrower
    /// @param status   loan status to filter for
    /// @return         filtered list of loan contract addresses
    function getBorrowerLoansByStatus(address borrower, LoanAgreement.LoanStatus status) external view returns (address[] memory) {
        return getUserLoansByStatus(loansByBorrower[borrower], status);
    }

    /// @notice         filter lender loans by specific status
    /// @param lender   address of lender
    /// @param status   loan status to filter for
    /// @return         filtered list of loan contract addresses
    function getLenderLoansByStatus(address lender, LoanAgreement.LoanStatus status) external view returns (address[] memory) {
        return getUserLoansByStatus(loansByLender[lender], status);
    }


    // Trust Score Functions /////////////////////////////////////////////////////////////////////

    /// @notice             update a borrower's trust score
    /// @dev                this function can only be called by registered loanAgreement contracts
    /// @param _borrower    address of borrow
    /// @param _val         value to be added to trust score (can be negative)
    function updateTrustScore(address _borrower, int256 _val) external {
        require(isValidLoan[msg.sender], "Only a registered loan can call this function!");
        trustScores[_borrower] += _val;
    }

    /// @notice Get a borrower's trust score
    function getTrustScore(address _user) external view returns (int256) {
        return trustScores[_user];
    }

}