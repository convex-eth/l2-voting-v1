// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/IVotePlatform.sol";

contract GaugeRegistry {

    address public owner;
    address public pendingowner;
    address public operator;
    address private caller;

    event TransferOwnership(address pendingOwner);
    event AcceptedOwnership(address newOwner);
    event OperatorSet(address _op);
    event SetGauge(address _gauge, bool _active);

    mapping(address => bool) public activeGauges;

    constructor() {
        owner = msg.sender;
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

    modifier onlyOwner() {
        require(owner == msg.sender, "!owner");
        _;
    }

    function onMessageReceived(address originAddress, uint32 originNetwork, bytes memory data) external payable {
        require(operator == originAddress, "!op");
        require(originNetwork == 0);
        caller = originAddress;
        (bool success, ) = address(this).call(data);
        if (!success) {
            revert('metadata execution failed');
        }
        caller = address(0);
    }

    function setGauge(address _gauge, bool _isActive) external{
        require( (caller != address(0) && caller == operator) || owner == msg.sender, "!op");
        activeGauges[_gauge] = _isActive;
        emit SetGauge(_gauge, _isActive);
    }

    function isGauge(address _gauge) external view returns(bool){
        return activeGauges[_gauge];
    }
}