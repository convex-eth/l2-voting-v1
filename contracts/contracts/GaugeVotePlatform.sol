// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/IDelegation.sol";
import "../node_modules/@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";


/*
    Main Gauge Vote Platform contract
*/
contract GaugeVotePlatform{

    address public owner;
    address public pendingowner;
    mapping(address => bool) public operators;

    IDelegation public delegation;

    struct UserInfo {
        uint256 baseWeight; //original weight
        int256 adjustedWeight; //signed weight change via delegation change or updated user weight
    }
    mapping(uint256 => mapping(address => UserInfo)) public userInfo;

    struct Proposal {
        bytes32 baseWeightMerkleRoot; //merkle root to provide user base weights 
        uint256 startTime; //start timestamp
        uint256 endTime; //end timestamp
    }

    struct Vote {
        address[] gauges; //array of gauges to vote on
        uint256[] weights; //array of weights for each choice
    }

    Proposal[] public proposals;
    mapping(uint256 => mapping(address => Vote)) internal votes; // proposalId => user => Vote

    function getVote(uint256 _proposalId, address _user) public view returns (address[] memory, uint256[] memory) {
        return (votes[_proposalId][_user].gauges, votes[_proposalId][_user].weights);
    }

    function vote(uint256 _proposalId, address[] calldata _gauges, uint256[] calldata _weights) public {
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
        emit VoteCast(_proposalId, msg.sender, _gauges, _weights);
    }

    function voteWithProofs(uint256 _proposalId, address[] calldata _gauges, uint256[] calldata _weights, uint256 index, bytes32[] calldata proofs, uint256 _baseWeight) public {
        _supplyProofs(_proposalId, index, proofs, _baseWeight);
        vote(_proposalId, _gauges, _weights);
    }

    function _supplyProofs(uint256 _proposalId, uint256 index, bytes32[] calldata proofs, uint256 _baseWeight) internal {
        require(userInfo[_proposalId][msg.sender].baseWeight == 0, "Proofs already supplied");
        bytes32 node = keccak256(abi.encodePacked(index, msg.sender, _baseWeight));
        require(MerkleProof.verify(proofs, proposals[_proposalId].baseWeightMerkleRoot, node), 'Invalid proof.');
        userInfo[_proposalId][msg.sender].baseWeight = _baseWeight;
        emit UserWeightChange(_proposalId, msg.sender, _baseWeight,  userInfo[_proposalId][msg.sender].adjustedWeight);


        address delegate = delegation.getDelegate(msg.sender);
        if(delegate != msg.sender) {
            userInfo[_proposalId][delegate].adjustedWeight -= int256(_baseWeight);
            emit UserWeightChange(_proposalId, delegate,  userInfo[_proposalId][delegate].baseWeight,  userInfo[_proposalId][delegate].adjustedWeight);
        }
    }


    function setDelegationContract(address _delegation) public onlyOwner {
        delegation = IDelegation(_delegation);
        emit DelegationChange(_delegation);
    }

    function createProposal(bytes32 _baseWeightMerkleRoot, uint256 _startTime, uint256 _endTime) public onlyOperator {
        proposals.push(Proposal({
            baseWeightMerkleRoot: _baseWeightMerkleRoot,
            startTime: _startTime,
            endTime: _endTime
        }));
        emit NewProposal(proposals.length-1, _baseWeightMerkleRoot, _startTime, _endTime);
    }

    function transferOwnership(address _owner) external onlyOwner{
        pendingowner = _owner;
        emit TransferOwnership(_owner);
    }

    function acceptOwnership() external {
        require(pendingowner == msg.sender, "!pendingowner");
        owner = pendingowner;
        pendingowner = address(0);
        emit AcceptedOwnership(owner);
    }

    function setOperator(address _op, bool _active) external onlyOwner{
        operators[_op] = _active;
        emit OperatorSet(_op, _active);
    }

    modifier onlyOwner() {
        require(owner == msg.sender, "!owner");
        _;
    }

    modifier onlyOperator() {
        require(operators[msg.sender] || owner == msg.sender, "!operator");
        _;
    }


    event VoteCast(uint256 indexed proposalId, address indexed user, address[] gauges, uint256[] weights);
    event NewProposal(uint256 indexed id, bytes32 merkle, uint256 start, uint256 end);
    event UserWeightChange(uint256 indexed pid, address indexed user, uint256 baseWeight, int256 adjustedWeight);
    event TransferOwnership(address pendingOwner);
    event AcceptedOwnership(address newOwner);
    event OperatorSet(address indexed _op, bool _active);
    event DelegationChange(address delgationContract);

    constructor(address delegationContract) {
        owner = msg.sender;
        operators[msg.sender] = true;
        delegation = IDelegation(delegationContract);
        emit DelegationChange(delegationContract);
    }

}