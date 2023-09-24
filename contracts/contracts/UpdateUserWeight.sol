// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/IBridgeMessageReceiver.sol";
import "./interfaces/IVotePlatform.sol";

contract UpdateUserWeight is IBridgeMessageReceiver {

    address public owner;
    address public pendingowner;
    address public operator;
    address public bridge;
    address public gaugePlatform;
    address public daoPlatform;

    uint256 public constant epochDuration = 86400 * 7;

    mapping(address => mapping(uint256 => uint256)) public userWeightAtEpoch;

    event TransferOwnership(address pendingOwner);
    event AcceptedOwnership(address newOwner);
    event OperatorSet(address _op);
    event BridgeSet(address _bridge);
    event SetPlatforms(address _gaugePlatform, address _daoplatform);
    event SetUserWeightAtEpoch(address indexed _user, uint256 indexed _epoch, uint256 _weight);

    constructor() {
        owner = msg.sender;
        bridge = address(0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe);
    }

    function currentEpoch() public view returns (uint256) {
        return block.timestamp/epochDuration*epochDuration;
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

    function setOperator(address _op) external onlyOwner{
        operator = _op;
        emit OperatorSet(_op);
    }

    function setBridge(address _bridge) external onlyOwner{
        bridge = _bridge;
        emit BridgeSet(_bridge);
    }

    function setVotePlatforms(address _gaugePlatform, address _daoplatform) external onlyOwner{
        gaugePlatform = _gaugePlatform;
        daoPlatform = _daoplatform;
        emit SetPlatforms(_gaugePlatform, _daoplatform);
    }

    modifier onlyOwner() {
        require(owner == msg.sender, "!owner");
        _;
    }

    function onMessageReceived(address originAddress, uint32 originNetwork, bytes calldata data) external payable {
        require(msg.sender == bridge, "!bridge");
        require(operator == originAddress && originNetwork == 0, "!op");

        (bool success, ) = address(this).call(data);
        if (!success) {
            revert('metadata execution failed');
        }
    }

    function updateWeight(address _user, uint256 _epoch, uint256 _weight) public {
        require(msg.sender == address(this) || msg.sender == owner,"!self");
        require(_epoch == currentEpoch(), "!epoch");

        //update local
        userWeightAtEpoch[_user][_epoch] = _weight;
        emit SetUserWeightAtEpoch(_user, _epoch, _weight);

        //update each voting platform's user weight for any live proposals
        if(gaugePlatform != address(0)){
            IVotePlatform(gaugePlatform).updateUserWeight(_user, _weight);
        }
        if(daoPlatform != address(0)){
            IVotePlatform(daoPlatform).updateUserWeight(_user, _weight);
        }
    }
}