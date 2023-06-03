// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/IVotePlatform.sol";

contract GaugeRegistry {

    address public owner;
    address public pendingowner;
    address public operator;

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

    modifier onlyOperator() {
        require(operator == msg.sender || owner == msg.sender, "!op");
        _;
    }

    function setGauge(address _gauge, bool _isActive) external onlyOperator{
        activeGauges[_gauge] = _isActive;
        emit SetGauge(_gauge, _isActive);
    }

    function isGauge(address _gauge) external view returns(bool){
        return activeGauges[_gauge];
    }
}