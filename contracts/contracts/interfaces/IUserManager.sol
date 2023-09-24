// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IUserManager{
    function userWeightAtEpoch(address _account, uint256 _epoch) external view returns (uint256);
}