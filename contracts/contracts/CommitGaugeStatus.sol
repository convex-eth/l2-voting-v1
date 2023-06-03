// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "./interfaces/ICurveGauge.sol";
import "./interfaces/IGaugeController.sol";
import "./interfaces/IZkSync.sol";

contract CommitGaugeStatus {

    bytes4 private constant updateSelector = bytes4(keccak256("setGauge(address,bool)"));
    address public constant gaugeController = address(0x2F50D538606Fa9EDD2B11E2446BEb18C9D5846bB);


    function commit(
        address _gauge,
        address zkSyncAddress,
        address contractAddr,
        uint256 gasLimit,
        uint256 gasPerPubdataByteLimit
    ) external  {
        //get weight for valid gauge
        require(IGaugeController(gaugeController).get_gauge_weight(_gauge) > 0, "must have weight");

        //check killed for status
        bool active = ICurveGauge(_gauge).is_killed();

        //build data
        bytes memory data = abi.encodeWithSelector(updateSelector, _gauge, active);

        //submit to L2
        IZkSync(zkSyncAddress).requestL2Transaction(contractAddr, 0, data, gasLimit, gasPerPubdataByteLimit, new bytes[](0), msg.sender);
    }
}