// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/IBridgeMessageReceiver.sol";
import "./interfaces/ISurrogateRegistry.sol";

contract SurrogateRegistry is IBridgeMessageReceiver, ISurrogateRegistry {

    address public owner;
    address public pendingowner;
    address public operator;
    address public bridge;

    struct Info {
        address surrogate; //address set to allow to vote on a user's behalf
        uint256 timestamp; //timestamp this info was updated
    }

    mapping(address => Info) public surrogateInfo; 

    event TransferOwnership(address pendingOwner);
    event AcceptedOwnership(address newOwner);
    event OperatorSet(address _op);
    event BridgeSet(address _bridge);
    event SurrogateSet(address _account, address _surrogate);

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

    function isSurrogate(address _surrogate, address _account) external view returns(bool){
        return surrogateInfo[_account].surrogate == _surrogate;
    }

    function setSurrogate(address _surrogate) external{
        surrogateInfo[msg.sender].surrogate = _surrogate;
        surrogateInfo[msg.sender].timestamp = block.timestamp;
        emit SurrogateSet(msg.sender, _surrogate);
    }

    function onMessageReceived(address originAddress, uint32 originNetwork, bytes calldata data) external payable {
        require(msg.sender == bridge, "!bridge");
        require(operator == originAddress && originNetwork == 0, "!op");

        (bool success, ) = address(this).call(data);
        if (!success) {
            revert('metadata execution failed');
        }
    }

    function updateUserSurrogate(address _user, address _surrogate, uint256 _timestamp) public {
        require(msg.sender == address(this) || msg.sender == owner,"!self");
        require(_timestamp > surrogateInfo[_user].timestamp , "!time");

        surrogateInfo[_user].surrogate = _surrogate;
        surrogateInfo[_user].timestamp = _timestamp;
        emit SurrogateSet(_user, _surrogate);
    }
}