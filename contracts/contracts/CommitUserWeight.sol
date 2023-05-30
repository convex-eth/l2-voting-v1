// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/IZkSync.sol";
import "./interfaces/IvlCVX.sol";

contract CommitUserWeight {

    bytes4 private constant updateSelector = bytes4(keccak256("updateWeight(address,uint256,uint256,uint256)"));
    address public constant vlcvx = address(0x72a19342e8F1838460eBFCCEf09F6585e32db86E);
    uint256 public constant epochDuration = 86400 * 7;

    function currentEpoch() public view returns (uint256) {
        return block.timestamp/epochDuration*epochDuration;
    }

    function commit(
        address userAddress,
        uint256 proposalId,
        address zkSyncAddress,
        address contractAddr,
        // bytes memory data,
        uint256 gasLimit,
        uint256 gasPerPubdataByteLimit
    ) external  {
        //make sure vlcvx is checkpointed
        IvlCVX(vlcvx).checkpointEpoch();

        //get vlcvx balance
        uint256 balance = IvlCVX(vlcvx).balanceOf(userAddress);

        //build data
        bytes memory data = abi.encodeWithSelector(updateSelector, userAddress, currentEpoch(), proposalId, balance);

        //submit to L2
        IZkSync(zkSyncAddress).requestL2Transaction(contractAddr, 0, data, gasLimit, gasPerPubdataByteLimit, new bytes[](0), msg.sender);
    }
}