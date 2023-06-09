// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/IBridgeMessageReceiver.sol";
import "./interfaces/IVotePlatform.sol";

contract GaugeRegistry is IBridgeMessageReceiver {

    address public owner;
    address public pendingowner;
    address public operator;
    address public bridge;

    event TransferOwnership(address pendingOwner);
    event AcceptedOwnership(address newOwner);
    event OperatorSet(address _op);
    event BridgeSet(address _bridge);
    event SetGauge(address _gauge, bool _active);

    mapping(address => bool) public activeGauges;

    constructor() {
        owner = msg.sender;
        bridge = address(0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe);
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

    function onMessageReceived(address originAddress, uint32 originNetwork, bytes calldata data) external payable {
        require(msg.sender == bridge, "!bridge");
        require(operator == originAddress && originNetwork == 0, "!op");

        (bool success, ) = address(this).call(data);
        if (!success) {
            revert('metadata execution failed');
        }
    }

    function setGauge(address _gauge, bool _isActive) public{
        require(msg.sender == address(this) || msg.sender == owner,"!op");
        activeGauges[_gauge] = _isActive;
        emit SetGauge(_gauge, _isActive);
    }

    function isGauge(address _gauge) external view returns(bool){
        return activeGauges[_gauge];
    }
}