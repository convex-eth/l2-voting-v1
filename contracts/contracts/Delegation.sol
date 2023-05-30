// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

contract Delegation {
    struct Registry {
        uint256 start;      // when first registering, there is a delay until the next vlCVX voting epoch starts
        address to;         // forward rewards to alternate address OR 0x0 address for OPT OUT of rewards
        uint256 expiration; // when ending an active registration, expiration is set to the next vlCVX voting epoch
                            // an active registration cannot be changed until after it is expired (one vote round delay when changing active registration)
    }
    mapping(address => Registry) public registry;
    mapping(address => bool) public inDelegateHistory;
    address[] public delegateHistory;

    uint256 public constant epochDuration = 86400 * 7;

    event SetDelegate(address indexed user, address indexed delegate, uint256 indexed start);
    event ExpDelegate(address indexed user, uint256 indexed expiration);

    function setDelegate(address _delegate) public {
        uint256 current = currentEpoch();
        require(registry[msg.sender].expiration <= current,"Delegation is still active");
        registry[msg.sender].start = current+epochDuration;
        registry[msg.sender].to = _delegate;
        registry[msg.sender].expiration = 0xfffffffff;
        if(!inDelegateHistory[msg.sender]) {
            delegateHistory.push(msg.sender);
            inDelegateHistory[msg.sender] = true;
        }
        emit SetDelegate(msg.sender, _delegate, registry[msg.sender].start);
    }

    function setToExpire() public {
        uint256 next = nextEpoch();
        require(registry[msg.sender].expiration > next,"Not delegated or expiration already pending");
        // if not started yet, nullify instead of setting expiration
        if(next == registry[msg.sender].start) {
            registry[msg.sender].start = 0;
            registry[msg.sender].to = msg.sender;
            registry[msg.sender].expiration = 0;
        } else {
            registry[msg.sender].expiration = next;
        }
        emit ExpDelegate(msg.sender, next);
    }

    function getDelegate(address _user) public view returns (address) {
        if(registry[_user].start <= currentEpoch() && registry[_user].start != 0 && registry[_user].expiration > currentEpoch()) {
            return registry[_user].to;
        } else {
            return _user;
        }
    }

    // returns start of current Epoch
    function currentEpoch() public view returns (uint256) {
        return block.timestamp/epochDuration*epochDuration;
    }

    // returns start of next Epoch
    function nextEpoch() public view returns (uint256) {
        return block.timestamp/epochDuration*epochDuration+epochDuration;
    }
}