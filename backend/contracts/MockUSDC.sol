// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockUSDC is ERC20 {
    constructor() ERC20("MockUSDC", "mUSDC") {
        _mint(msg.sender, 1_000_000 * 1e6); // 1 000 000 mUSDC 给部署人
    }

    function decimals() public pure override returns (uint8) {
        return 6; // 像 USDC 一样 6 位
    }
}
