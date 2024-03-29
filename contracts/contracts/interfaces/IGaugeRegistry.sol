// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface IGaugeRegistry{
    function isGauge(address _gauge) external returns(bool);
    function activeGauges(uint256 _index) external returns(address);
    function gaugeLength() external returns(uint256);
}