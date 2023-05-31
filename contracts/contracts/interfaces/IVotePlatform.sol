// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IVotePlatform{
    function updateUserWeight(uint256 _proposalId, address _user, uint256 _newWeight) external;
}