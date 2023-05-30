// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IDelegation{
    function getDelegate(address _user) external view returns (address);
}