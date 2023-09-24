// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IVotePlatform{
    struct Proposal {
        bytes32 baseWeightMerkleRoot; //merkle root to provide user base weights 
        uint256 startTime; //start timestamp
        uint256 endTime; //end timestamp
    }
    function updateUserWeight(address _user, uint256 _newWeight) external;
    function gaugeTotals(uint256 _proposalId, address _gauge) external view returns (uint256);
    function proposals(uint256 _proposalId) external view returns (Proposal memory);
    function proposalCount() external view returns (uint256);
    function gaugesWithVotes(uint256 _proposalId, uint256 _index) external view returns (address);
    function gaugesWithVotesCount(uint256 _proposalId) external view returns (uint256);
}