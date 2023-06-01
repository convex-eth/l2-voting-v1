// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/IVotePlatform.sol";

contract UpdateUserWeight {

    address public owner;
    address public pendingowner;
    address public operator;

    address public immutable votePlatform;

    uint256 public constant epochDuration = 86400 * 7;

    event TransferOwnership(address pendingOwner);
    event AcceptedOwnership(address newOwner);
    event OperatorSet(address _op);

    constructor(address _votePlatform) {
        owner = msg.sender;
        votePlatform = _votePlatform;
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

    modifier onlyOwner() {
        require(owner == msg.sender, "!owner");
        _;
    }

    function updateWeight(address _user, uint256 _epoch, uint256 _proposalId, uint256 _weight) external {
        require(msg.sender == operator, "!op");
        require(_epoch == currentEpoch(), "!epoch");

        //update voting platform's user weight for the specified proposal id
        IVotePlatform(votePlatform).updateUserWeight(_proposalId, _user, _weight);
    }
}