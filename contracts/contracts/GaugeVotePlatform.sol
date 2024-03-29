// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/IGaugeRegistry.sol";
import "./interfaces/ISurrogateRegistry.sol";
import "./interfaces/IUserManager.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";


/*
    Gauge Vote Platform
*/
contract GaugeVotePlatform{

    address public owner;
    address public pendingowner;
    mapping(address => bool) public operators;

    address public immutable gaugeRegistry;
    address public immutable surrogateRegistry;
    address public immutable userManager;

    uint256 public constant epochDuration = 86400 * 7;

    enum VoteStatus{
        None,
        VotedViaSurrogate,
        Voted
    }

    struct UserInfo {
        uint256 baseWeight; //original weight
        int256 adjustedWeight; //signed weight change via delegation change or updated user weight
        address delegate;
        uint8 voteStatus;
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

    mapping(uint256 => mapping(address => uint256)) public gaugeTotals; // proposalId => gauge => totalVlCVX
    mapping(uint256 => uint256) public voteTotals; // proposalId => totalVlcvx for all gauges

    Proposal[] public proposals;
    mapping(uint256 => mapping(address => Vote)) internal votes; // proposalId => user => Vote
    uint256 public constant max_weight = 10000;

    mapping(address => bool) public equalizerAccounts;
    uint256 public constant overtime = 10 minutes;

    function currentEpoch() public view returns (uint256) {
        return block.timestamp/epochDuration*epochDuration;
    }

    function proposalCount() external view returns(uint256){
        return proposals.length;
    }

    function getVoterCount(uint256 _proposalId) external view returns(uint256){
        return votedUsers[_proposalId].length;
    }

    function getVoterAtIndex(uint256 _proposalId, uint256 _index) external view returns(address){
        return votedUsers[_proposalId][_index];
    }

    //proof is known to be supplied if the delegate is a non zero address
    function isProofSupplied(uint256 _proposalId, address _account) public view returns(bool){
        return userInfo[_proposalId][_account].delegate != address(0);
    }

    function getVote(uint256 _proposalId, address _user) public view returns (address[] memory gauges, uint256[] memory weights, bool voted, uint256 baseWeight, int256 adjustedWeight) {
        gauges = votes[_proposalId][_user].gauges;
        weights = votes[_proposalId][_user].weights;
        voted = userInfo[_proposalId][_user].voteStatus > 0;
        baseWeight = userInfo[_proposalId][_user].baseWeight;
        adjustedWeight = userInfo[_proposalId][_user].adjustedWeight;
    }

    function _vote(address _account, address[] calldata _gauges, uint256[] calldata _weights) internal {
        uint256 proposalId = proposals.length - 1;
        require(block.timestamp >= proposals[proposalId].startTime, "!start");
        if(equalizerAccounts[_account]){
            require(block.timestamp <= proposals[proposalId].endTime + overtime, "!end");
        }else{
            require(block.timestamp <= proposals[proposalId].endTime, "!end");
        }
        require(_gauges.length == _weights.length, "mismatch");
        require(userInfo[proposalId][_account].delegate != address(0), "!proof");

        //get user base weight now so that delegate update uses proper weight
        int256 userbase = int256(userInfo[proposalId][_account].baseWeight);
        //get total user weight
        int256 userWeight = userbase+userInfo[proposalId][_account].adjustedWeight;

        //remove from gauge totals
        if(userInfo[proposalId][_account].voteStatus > 0){
            for(uint256 i = 0; i < votes[proposalId][_account].gauges.length; i++) {
                _changeGaugeTotal(proposalId, votes[proposalId][_account].gauges[i], -(int256(votes[proposalId][_account].weights[i])*userWeight/int256(max_weight)) );
            }
        }

        //update user vote
        delete votes[proposalId][_account].gauges;
        delete votes[proposalId][_account].weights;
        uint256 totalweight;
        for(uint256 i = 0; i < _weights.length; i++) {
            require(_weights[i] > 0, "!weight");
            require(IGaugeRegistry(gaugeRegistry).isGauge(_gauges[i]),"!gauge");
            votes[proposalId][_account].gauges.push(_gauges[i]);
            votes[proposalId][_account].weights.push(_weights[i]);
            totalweight += _weights[i];
        }
        require(totalweight <= max_weight, "max weight");

        //update user base weight from manager
        uint256 epochWeight = IUserManager(userManager).userWeightAtEpoch(_account, currentEpoch());
        if( epochWeight > uint256(userbase) ){
            //update base weight
            userInfo[proposalId][_account].baseWeight = epochWeight;
            //update total weight
            userWeight = int256(epochWeight) + userInfo[proposalId][_account].adjustedWeight;
            emit UserWeightChange(proposalId, _account,  epochWeight,  userInfo[proposalId][_account].adjustedWeight);
        }

        //update gauge totals
        for(uint256 i = 0; i < _weights.length; i++) {
            _changeGaugeTotal(proposalId,_gauges[i], int256(_weights[i])*userWeight/int256(max_weight) );
        }
        emit VoteCast(proposalId, _account, _gauges, _weights);

        //set user with voting flag and add to voter list
        if(userInfo[proposalId][_account].voteStatus == 0){
            userInfo[proposalId][_account].voteStatus = msg.sender == _account ? uint8(VoteStatus.Voted) : uint8(VoteStatus.VotedViaSurrogate);
            votedUsers[proposalId].push(_account);

            //add to total votes
            voteTotals[proposalId] += uint256(userWeight);

            //since user voted, take weight away from delegate
            address delegate = userInfo[proposalId][_account].delegate;
            if(delegate != _account) {

                //if delegate already voted, update global gauge totals
                if(userInfo[proposalId][delegate].voteStatus > 0){
                    int256 delegateweight = int256(userInfo[proposalId][delegate].baseWeight) + userInfo[proposalId][delegate].adjustedWeight;
                    
                    //remove from gauge totals
                    for(uint256 i = 0; i < votes[proposalId][delegate].gauges.length; i++) {
                        int256 difference = int256(votes[proposalId][delegate].weights[i])*(delegateweight-userbase)/int256(max_weight);
                        difference -= int256(votes[proposalId][delegate].weights[i])*delegateweight/int256(max_weight);
                        _changeGaugeTotal(proposalId,votes[proposalId][delegate].gauges[i],difference);
                    }

                    //remove user base from total votes (as it was included in delegate's adjustedWeight)
                    //only needed if delegate already voted
                    voteTotals[proposalId] -= uint256(userbase);
                }

                //update delegate adjusted weight
                userInfo[proposalId][delegate].adjustedWeight -= userbase;
                emit UserWeightChange(proposalId, delegate,  userInfo[proposalId][delegate].baseWeight,  userInfo[proposalId][delegate].adjustedWeight);
            }
        }
    }

    function _changeGaugeTotal(uint256 _proposalId, address _gauge, int256 _changeValue) internal{

        if(_changeValue > 0){
            //change total
            gaugeTotals[_proposalId][_gauge] += uint256(_changeValue);    
        }else{
            //change total
            gaugeTotals[_proposalId][_gauge] -= uint256(-_changeValue);
        }
        emit GaugeTotalChange(_proposalId, _gauge, gaugeTotals[_proposalId][_gauge]);
    }

    function _canSign(address _account) internal view returns(bool){
        if(msg.sender == _account){
            return true;
        }
        if(ISurrogateRegistry(surrogateRegistry).isSurrogate(msg.sender, _account)){
            return true;
        }
        return false;
    }

    //vote for _account with given gauges. Used after merkle proof recorded
    function vote(address _account, address[] calldata _gauges, uint256[] calldata _weights) external onlyAcceptedSigner(_account){
        uint256 proposalId = proposals.length - 1;
        require(msg.sender == _account || userInfo[proposalId][_account].voteStatus <= uint8(VoteStatus.VotedViaSurrogate), "!voteAuth");

        _vote(_account, _gauges, _weights);

        if(userInfo[proposalId][_account].voteStatus <= uint8(VoteStatus.VotedViaSurrogate) && msg.sender == _account){
            userInfo[proposalId][_account].voteStatus = uint8(VoteStatus.Voted);
        }
    }


    //vote for _account with given gauges. Use for first vote and supply merkle proof
    function voteWithProofs(address _account, address[] calldata _gauges, uint256[] calldata _weights, bytes32[] calldata _proofs, uint256 _baseWeight, int256 _adjustedWeight, address _delegate) external onlyAcceptedSigner(_account){
        uint256 proposalId = proposals.length - 1;
        require(!isProofSupplied(proposalId,_account), "Proofs already supplied");
        _supplyProofs(_account, proposalId, _proofs, _baseWeight, _adjustedWeight, _delegate);
        _vote(_account, _gauges, _weights);
    }

    //supply merkle proof to register user's base weight and adjusted weight
    function _supplyProofs(address _account, uint256 _proposalId, bytes32[] calldata _proofs, uint256 _baseWeight, int256 _adjustedWeight, address _delegate) internal {
        bytes32 node = keccak256(abi.encodePacked(_account, _delegate, _baseWeight, _adjustedWeight));
        require(MerkleProof.verify(_proofs, proposals[_proposalId].baseWeightMerkleRoot, node), 'Invalid proof.');

        //if no delegation then will be equal to self
        if(_delegate == address(0)){
            _delegate = _account;
        }

        //record delegate used for this proposal.
        userInfo[_proposalId][_account].delegate = _delegate;
        userInfo[_proposalId][_account].baseWeight = _baseWeight;
        userInfo[_proposalId][_account].adjustedWeight += _adjustedWeight;
        emit UserWeightChange(_proposalId, _account, userInfo[_proposalId][_account].baseWeight,  userInfo[_proposalId][_account].adjustedWeight);
    }

    //update _account's base weight. must give merkle proof if not supplied already
    //only used if not voted yet.  use normal vote() to update if update weight if already voted
    function updateUserWeight(address _account, bytes32[] calldata _proofs, uint256 _baseWeight, int256 _adjustedWeight, address _delegate) external onlyAcceptedSigner(_account){
        uint256 proposalId = proposals.length - 1;

        //supply proof if not recorded yet
        if(!isProofSupplied(proposalId,_account)){
            _supplyProofs(_account, proposalId, _proofs, _baseWeight, _adjustedWeight, _delegate);
        }

        //update user weight
        _updateUserWeight(_account, proposalId);
    }

    //check if user base weight has been updated
    //if there is user weight difference then adjust delegate' adjustedweight and any votes already registered
    function _updateUserWeight(address _account, uint256 _proposalId) internal {
        //check that user hasnt voted yet
        require(userInfo[_proposalId][_account].voteStatus == 0, "already voted");

        //current user info
        uint256 currentWeight = userInfo[_proposalId][_account].baseWeight;
        address delegate = userInfo[_proposalId][_account].delegate;
        uint256 updatedWeight = currentWeight;

        //get user base weight from manager
        uint256 epochWeight = IUserManager(userManager).userWeightAtEpoch(_account, currentEpoch());
        if( epochWeight > currentWeight ){
            //use updated value
            updatedWeight = epochWeight;
        }

        //get difference of updated weight and the weight that is already recorded
        int256 userDifference = int256(updatedWeight) - int256(currentWeight);

        //if there's a difference in weight, must check if delegated
        if(userDifference > 0 && delegate != _account) {

            // check if delegate has voted
            if(userInfo[_proposalId][delegate].voteStatus > 0) {
                // remove original delegate weight from gauge totals
                int256 delegateweight = int256(userInfo[_proposalId][delegate].baseWeight) + userInfo[_proposalId][delegate].adjustedWeight;
                for(uint256 i = 0; i < votes[_proposalId][delegate].gauges.length; i++) {
                    //get difference in weight
                    int256 difference = int256(votes[_proposalId][delegate].weights[i])*(delegateweight+userDifference)/int256(max_weight);
                    difference -= int256(votes[_proposalId][delegate].weights[i])*delegateweight/int256(max_weight);
                    //change gauge totals to reflect user difference
                    _changeGaugeTotal(_proposalId, votes[_proposalId][delegate].gauges[i], difference );
                }

            }
            //update delegate's recorded adjusted weight by the user's difference
            userInfo[_proposalId][delegate].adjustedWeight += userDifference;
            emit UserWeightChange(_proposalId, delegate,  userInfo[_proposalId][delegate].baseWeight,  userInfo[_proposalId][delegate].adjustedWeight);
        }

        //set user base weight to updated value     
        userInfo[_proposalId][_account].baseWeight = updatedWeight; //use updated based
        emit UserWeightChange(_proposalId, _account, updatedWeight,  userInfo[_proposalId][_account].adjustedWeight);
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
        require(block.timestamp >= proposals[proposalId].startTime, "!start");
        require(block.timestamp <= proposals[proposalId].endTime, "!end");
        
        proposals[proposalId].baseWeightMerkleRoot = 0;
        proposals[proposalId].startTime = 0;
        proposals[proposalId].endTime = 0;
        emit ForceEndProposal(proposalId);
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

    modifier onlyAcceptedSigner(address _account) {
        require(_canSign(_account), "!signer");
        _;
    }

    event VoteCast(uint256 indexed proposalId, address indexed user, address[] gauges, uint256[] weights);
    event NewProposal(uint256 indexed id, bytes32 merkle, uint256 start, uint256 end);
    event ForceEndProposal(uint256 indexed id);
    event UserWeightChange(uint256 indexed pid, address indexed user, uint256 baseWeight, int256 adjustedWeight);
    event GaugeTotalChange(uint256 indexed pid, address indexed gauge, uint256 newWeight);
    event TransferOwnership(address pendingOwner);
    event AcceptedOwnership(address newOwner);
    event OperatorSet(address indexed op, bool active);
    event EqualizerAccountSet(address indexed eq, bool active);

    constructor(address _gaugeRegistry, address _surrogateRegistry, address _userManager) {
        owner = msg.sender;
        operators[msg.sender] = true;
        gaugeRegistry = _gaugeRegistry;
        surrogateRegistry = _surrogateRegistry;
        userManager = _userManager;
    }

}