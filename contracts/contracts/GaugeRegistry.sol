// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/IBridgeMessageReceiver.sol";
import "./interfaces/IVotePlatform.sol";

contract GaugeRegistry is IBridgeMessageReceiver {

    address public owner;
    address public pendingowner;
    address public operator;
    address public bridge;

    uint256 public constant epochDuration = 86400 * 7;

    event TransferOwnership(address pendingOwner);
    event AcceptedOwnership(address newOwner);
    event OperatorSet(address _op);
    event BridgeSet(address _bridge);
    event SetGauge(address _gauge, bool _active);

    mapping(address => uint256) public activeGaugeIndex;
    address[] public activeGauges;

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

    modifier onlyOwner() {
        require(owner == msg.sender, "!owner");
        _;
    }

    function gaugeLength() external view returns (uint256){
        return activeGauges.length;
    }

    function onMessageReceived(address originAddress, uint32 originNetwork, bytes calldata data) external payable {
        require(msg.sender == bridge, "!bridge");
        require(operator == originAddress && originNetwork == 0, "!op");

        (bool success, ) = address(this).call(data);
        if (!success) {
            revert('metadata execution failed');
        }
    }

    function setGauge(address _gauge, bool _isActive, uint256 _epoch) public{
        require(msg.sender == address(this) || msg.sender == owner,"!op");
        require(_epoch == currentEpoch(), "!epoch"); //disallow old messages

        uint256 index = activeGaugeIndex[_gauge];
        if(index > 0){
            if(!_isActive){
                //remove from list
                activeGauges[index-1] = activeGauges[activeGauges.length-1];
                activeGauges.pop();
                activeGaugeIndex[_gauge] = 0;
            }
        }else{
            activeGauges.push(_gauge);
            activeGaugeIndex[_gauge] = activeGauges.length; //index is +1 since we use 0 to mark as unregistered
        }

        emit SetGauge(_gauge, _isActive);
    }

    function isGauge(address _gauge) external view returns(bool){
        return activeGaugeIndex[_gauge] > 0;
    }
}