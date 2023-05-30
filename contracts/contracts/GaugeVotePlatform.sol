// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "../node_modules/@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface DelegationInterface {
    function getDelegate(address _user) external view returns (address);
}
/*
    Main Gauge Vote Platform contract
*/
contract GaugeVotePlatform{

    address public operator;

    DelegationInterface public delegation;

    struct UserInfo {
        uint256 baseWeight; //original weight
        int256 adjustedWeight; //signed weight change via delegation change or updated user weight
    }
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    struct Proposal {
        bytes32 baseWeightMerkleRoot; //merkle root to provide user base weights 
        uint256 startTime; //start timestamp
        uint256 endTime; //end timestamp
        uint256 choices; //number of choices
    }

    struct UserVote {
        address[] gauges; //array of gauges to vote on
        uint256[] weights; //array of weights for each choice
    }

    Proposal[] public proposals;
    mapping(uint256 => mapping(address => UserVote)) internal votes; // proposalId => user => Vote

    function getVote(uint256 _proposalId, address _user) public view returns (address[] memory, uint256[] memory) {
        return (votes[_proposalId][_user].gauges, votes[_proposalId][_user].weights);
    }

    function vote(uint256 _proposalId, address[] memory _gauges, uint256[] memory _weights) public {
        require(_weights.length == proposals[_proposalId].choices, "Invalid number of choices");
        require(block.timestamp >= proposals[_proposalId].startTime, "Voting not started");
        require(block.timestamp <= proposals[_proposalId].endTime, "Voting ended");
        require(_gauges.length == _weights.length, "Array length mismatch");

        //update user weights
        delete votes[_proposalId][msg.sender].gauges;
        delete votes[_proposalId][msg.sender].weights;
        for(uint256 i = 0; i < _weights.length; i++) {
            votes[_proposalId][msg.sender].gauges.push(_gauges[i]);
            votes[_proposalId][msg.sender].weights.push(_weights[i]);
        }
        emit VoteCast(_proposalId, msg.sender, _weights);
    }

    function voteWithProofs(uint256 _proposalId, address[] memory _gauges, uint256[] memory _weights, uint256 index, bytes32[] memory proofs, uint256 _baseWeight) public {
        _supplyProofs(_proposalId, index, proofs, _baseWeight);
        vote(_proposalId, _gauges, _weights);
    }

    function _supplyProofs(uint256 _proposalId, uint256 index, bytes32[] memory proofs, uint256 _baseWeight) internal {
        require(userInfo[_proposalId][msg.sender].baseWeight == 0, "Proofs already supplied");
        bytes32 node = keccak256(abi.encodePacked(index, msg.sender, _baseWeight));
        require(MerkleProof.verify(proofs, proposals[_proposalId].baseWeightMerkleRoot, node), 'Invalid proof.');
        userInfo[_proposalId][msg.sender].baseWeight = _baseWeight;
        address delegate = delegation.getDelegate(msg.sender);
        if(delegate != msg.sender) {
            userInfo[_proposalId][delegate].adjustedWeight -= int256(_baseWeight);
        }
    }


    function setOperator(address _operator) public isOperator {
        operator = _operator;
    }

    function setDelegationContract(address _delegation) public isOperator {
        delegation = DelegationInterface(_delegation);
    }

    function createProposal(bytes32 _baseWeightMerkleRoot, uint256 _startTime, uint256 _endTime, uint256 _choices) public isOperator {
        proposals.push(Proposal({
            baseWeightMerkleRoot: _baseWeightMerkleRoot,
            startTime: _startTime,
            endTime: _endTime,
            choices: _choices
        }));
        emit NewProposal(proposals.length-1, _baseWeightMerkleRoot, _startTime, _endTime, _choices);
    }

    modifier isOperator() {
        require(operator == msg.sender, "Unauthorized");
        _;
    }


    event VoteCast(uint256 indexed proposalId, address indexed user, uint256[] weights);
    event NewProposal(uint256 indexed id, bytes32 merkle, uint256 start, uint256 end, uint256 choices);

    constructor(address delegationContract) {
        operator = msg.sender;
        delegation = DelegationInterface(delegationContract);
    }

}