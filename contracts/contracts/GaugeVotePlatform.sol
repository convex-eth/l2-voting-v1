// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/IGaugeRegistry.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";


/*
    Main Gauge Vote Platform contract
*/
contract GaugeVotePlatform{

    address public owner;
    address public pendingowner;
    mapping(address => bool) public operators;

    address public immutable gaugeRegistry;
    address public immutable userManager;

    struct UserInfo {
        uint256 baseWeight; //original weight
        int256 adjustedWeight; //signed weight change via delegation change or updated user weight
        uint256 pendingWeight; //weight updated but awaiting proof
        address delegate;
        bool voted;
    }
    mapping(uint256 => mapping(address => UserInfo)) public userInfo; // proposalId => user => UserInfo
    mapping(uint256 => address[]) public votedUsers; // proposalId => votedUsers[]

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
    uint256 public constant max_weight = 10000;

    mapping(address => bool) equalizerAccounts;
    uint256 public constant overtime = 10 minutes;

    function proposalCount() external view returns(uint256){
        return proposals.length;
    }

    function getVoterCount(uint256 _proposalId) external view returns(uint256){
        return votedUsers[_proposalId].length;
    }

    function getVoterAtIndex(uint256 _proposalId, uint256 _index) external view returns(address){
        return votedUsers[_proposalId][_index];
    }

    function getVote(uint256 _proposalId, address _user) public view returns (address[] memory gauges, uint256[] memory weights, bool voted, uint256 baseWeight, int256 adjustedWeight) {
        gauges = votes[_proposalId][_user].gauges;
        weights = votes[_proposalId][_user].weights;
        voted = userInfo[_proposalId][_user].voted;
        baseWeight = userInfo[_proposalId][_user].baseWeight;
        adjustedWeight = userInfo[_proposalId][_user].adjustedWeight;
    }

    function vote(address[] calldata _gauges, uint256[] calldata _weights) public {
        uint256 proposalId = proposals.length - 1;
        require(block.timestamp >= proposals[proposalId].startTime, "!start");
        if(equalizerAccounts[msg.sender]){
            require(block.timestamp <= proposals[proposalId].endTime + overtime, "!end");
        }else{
            require(block.timestamp <= proposals[proposalId].endTime, "!end");
        }
        require(_gauges.length == _weights.length, "mismatch");
        require(userInfo[proposalId][msg.sender].delegate != address(0), "!proof");

        //update user vote
        delete votes[proposalId][msg.sender].gauges;
        delete votes[proposalId][msg.sender].weights;
        uint256 totalweight;
        for(uint256 i = 0; i < _weights.length; i++) {
            require(_weights[i] > 0, "!weight");
            require(IGaugeRegistry(gaugeRegistry).isGauge(_gauges[i]),"!gauge");
            votes[proposalId][msg.sender].gauges.push(_gauges[i]);
            votes[proposalId][msg.sender].weights.push(_weights[i]);
            totalweight += _weights[i];
        }
        require(totalweight <= max_weight, "max weight");
        emit VoteCast(proposalId, msg.sender, _gauges, _weights);

        //set user with voting flag and add to voter list
        if(!userInfo[proposalId][msg.sender].voted){
            userInfo[proposalId][msg.sender].voted = true;
            votedUsers[proposalId].push(msg.sender);

            //since user voted, take weight away from delegate
            address delegate = userInfo[proposalId][msg.sender].delegate;
            if(delegate != msg.sender) {
                userInfo[proposalId][delegate].adjustedWeight -= int256(userInfo[proposalId][delegate].baseWeight);
                emit UserWeightChange(proposalId, delegate,  userInfo[proposalId][delegate].baseWeight,  userInfo[proposalId][delegate].adjustedWeight);
            }
        }
    }

    function voteWithProofs(address[] calldata _gauges, uint256[] calldata _weights, bytes32[] calldata proofs, uint256 _baseWeight, int256 _adjustedWeight, address _delegate) public {
        uint256 proposalId = proposals.length - 1;
        require(userInfo[proposalId][msg.sender].delegate == address(0), "Proofs already supplied");
        _supplyProofs( proposalId, proofs, _baseWeight, _adjustedWeight, _delegate);
        vote(_gauges, _weights);
    }

    function supplyProofs(bytes32[] calldata proofs, uint256 _baseWeight, int256 _adjustedWeight, address _delegate) public {
        uint256 proposalId = proposals.length - 1;
        require(userInfo[proposalId][msg.sender].delegate == address(0), "Proofs already supplied");
        _supplyProofs(proposalId, proofs, _baseWeight, _adjustedWeight, _delegate);
    }


    //supply merkle proof to register user's base weight and adjusted weight
    //pending weight update can be written to base weight now that proof is done
    //if there is pending weight change then adjust delegate weight by the difference
    function _supplyProofs(uint256 _proposalId, bytes32[] calldata proofs, uint256 _baseWeight, int256 _adjustedWeight, address _delegate) internal {
        bytes32 node = keccak256(abi.encodePacked(msg.sender, _delegate, _baseWeight, _adjustedWeight));
        require(MerkleProof.verify(proofs, proposals[_proposalId].baseWeightMerkleRoot, node), 'Invalid proof.');

        //if no delegation then will be equal to self
        if(_delegate == address(0)){
            _delegate = msg.sender;
        }
        //record delegate used for this proposal.
        userInfo[_proposalId][msg.sender].delegate = _delegate;

        if(userInfo[_proposalId][msg.sender].pendingWeight > 0){
            userInfo[_proposalId][msg.sender].baseWeight = userInfo[_proposalId][msg.sender].pendingWeight;
            
            //add the pending weight onto the delegation weight
            if(_delegate != msg.sender) {
                //merkle info has base weight already attributed to the user so add the difference
                userInfo[_proposalId][_delegate].adjustedWeight += (int256(_baseWeight) - int256(userInfo[_proposalId][msg.sender].pendingWeight));
                emit UserWeightChange(_proposalId, _delegate,  userInfo[_proposalId][_delegate].baseWeight,  userInfo[_proposalId][_delegate].adjustedWeight);
            }
            userInfo[_proposalId][msg.sender].pendingWeight = 0;
        }else{
            userInfo[_proposalId][msg.sender].baseWeight = _baseWeight; 
        }
        
        userInfo[_proposalId][msg.sender].adjustedWeight += _adjustedWeight;
        emit UserWeightChange(_proposalId, msg.sender, userInfo[_proposalId][msg.sender].baseWeight,  userInfo[_proposalId][msg.sender].adjustedWeight);
    }

    function createProposal(bytes32 _baseWeightMerkleRoot, uint256 _startTime, uint256 _endTime) public onlyOperator {
        require(_baseWeightMerkleRoot != bytes32(0),"!root");

        //only create if no other proposal is live
        uint256 pCnt = proposals.length;
        if(pCnt > 0){
            require(block.timestamp > proposals[pCnt-1].endTime + overtime, "!prev_end");
        }

        require(_endTime > _startTime, "!time");
        require(_endTime - _startTime >= 3 days, "!time");
        require(_endTime - _startTime <= 6 days, "!time");

        proposals.push(Proposal({
            baseWeightMerkleRoot: _baseWeightMerkleRoot,
            startTime: _startTime,
            endTime: _endTime
        }));
        emit NewProposal(proposals.length-1, _baseWeightMerkleRoot, _startTime, _endTime);
    }

    function forceEndProposal() public onlyOperator {
        uint256 proposalId = proposals.length - 1;
        proposals[proposalId].baseWeightMerkleRoot = 0;
        proposals[proposalId].startTime = 0;
        proposals[proposalId].endTime = 0;
        emit ForceEndProposal(proposalId);
    }


    //update a user's weight
    //if already voted, just update self
    //if proofs supplied, user is still delegating so adjust delegate's weight
    //if no proofs yet, set weight as pending to be processed later
    function updateUserWeight(uint256 _proposalId, address _user, uint256 _newWeight) external onlyUserManager{
        require(block.timestamp >= proposals[_proposalId].startTime, "!start");
        require(block.timestamp <= proposals[_proposalId].endTime, "!end");

        //if voted, delegation weight has already been adjusted so just adjust the user's base
        if(userInfo[_proposalId][_user].voted){
            userInfo[_proposalId][_user].baseWeight = _newWeight;

            emit UserWeightChange(_proposalId, _user, _newWeight,  userInfo[_proposalId][_user].adjustedWeight);
        }else if(userInfo[_proposalId][_user].delegate != address(0)){

            //delegate being non zero means proof has been supplied and thus delegate is known. modify delegate's adjusted weight and user's base
            
            //adjust delegate first
            address delegate = userInfo[_proposalId][_user].delegate;
            if(delegate != _user) {
                userInfo[_proposalId][delegate].adjustedWeight += (int256(userInfo[_proposalId][_user].baseWeight) - int256(_newWeight));
                emit UserWeightChange(_proposalId, delegate,  userInfo[_proposalId][delegate].baseWeight,  userInfo[_proposalId][delegate].adjustedWeight);
            }

            //set base weight last
            userInfo[_proposalId][_user].baseWeight = _newWeight;
            emit UserWeightChange(_proposalId, _user, _newWeight,  userInfo[_proposalId][_user].adjustedWeight);
        }else{
            //if no proof supplied yet, save to a pending weight. supply proofs to apply
            userInfo[_proposalId][_user].pendingWeight = _newWeight;
        }
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

    function setOvertimeAccount(address _eq, bool _active) external onlyOwner{
        equalizerAccounts[_eq] = _active;
        emit EqualizerAccountSet(_eq, _active);
    }


    modifier onlyOwner() {
        require(owner == msg.sender, "!owner");
        _;
    }

    modifier onlyOperator() {
        require(operators[msg.sender] || owner == msg.sender, "!operator");
        _;
    }

    modifier onlyUserManager() {
        require(userManager == msg.sender, "!userManager");
        _;
    }


    event VoteCast(uint256 indexed proposalId, address indexed user, address[] gauges, uint256[] weights);
    event NewProposal(uint256 indexed id, bytes32 merkle, uint256 start, uint256 end);
    event ForceEndProposal(uint256 indexed id);
    event UserWeightChange(uint256 indexed pid, address indexed user, uint256 baseWeight, int256 adjustedWeight);
    event TransferOwnership(address pendingOwner);
    event AcceptedOwnership(address newOwner);
    event OperatorSet(address indexed op, bool active);
    event EqualizerAccountSet(address indexed eq, bool active);

    constructor(address _guageRegistry, address _userManager) {
        owner = msg.sender;
        operators[msg.sender] = true;
        gaugeRegistry = _guageRegistry;
        userManager = _userManager;
    }

}