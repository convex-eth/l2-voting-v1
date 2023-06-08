// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;


interface IBridgeMessageReceiver {
    function onMessageReceived(
        address originAddress,
        uint32 originNetwork,
        bytes memory data
    ) external payable;
}
