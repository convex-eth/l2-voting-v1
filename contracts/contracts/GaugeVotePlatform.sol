// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;


/*
    Main Gauge Vote Platform contract
*/
contract GaugeVotePlatform{

    address public operator;

    struct UserInfo {
        uint256 baseWeight; //original weight
        int256 adjustedWeight; //signed weight change via delegation change or updated user weight
    }

    struct Proposal {
        address baseWeightMerkleRoot; //merkle root to provide user base weights 
        uint256 epoch; //vlcvx epoch (needed?)
        uint256 startTime; //start timestamp
        uint256 endTime; //end timestamp
    }

    // event VoteCast(address indexed user, address gauge, uint256 weight);
    // event NewProposal(address indexed epoch, address merkle, uint256 start, uint256 end);

    constructor() {
        operator = msg.sender;
    }


}