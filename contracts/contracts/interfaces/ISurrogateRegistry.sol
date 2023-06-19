// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

interface ISurrogateRegistry{
    function isSurrogate(address _surrogate, address _account) external view returns(bool);
}