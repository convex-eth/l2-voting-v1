// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;


import "./interfaces/IZkEvmBridge.sol";
import "./interfaces/IVotePlatform.sol";
import "./interfaces/IGaugeRegistry.sol";

contract CommitGaugeWeights {

    bytes4 private constant updateSelector = bytes4(keccak256("setWeights(address[],uint256[])"));
    address public constant bridge = address(0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe);
    IVotePlatform public votePlatform;
    IGaugeRegistry public gaugeRegistry;

    constructor(address _votePlatform, address _gaugeRegistry) {
        votePlatform = IVotePlatform(_votePlatform);
        gaugeRegistry = IGaugeRegistry(_gaugeRegistry);
    }

    function commit(
        address _contractAddr
    ) external  {
        // get latest proposal
        uint256 _proposalId = votePlatform.proposalCount() - 1;
        // require proposal is ended
        require(votePlatform.proposals(_proposalId).endTime < block.timestamp, "!ended");
        // get gaugeTotals
        uint256 gaugeLength = gaugeRegistry.gaugeLength();
        address[] memory gauges;
        uint256[] memory gaugeTotals;
        uint256 n = 0;
        for(uint256 i = 0; i < gaugeLength; i++){
            address gauge = gaugeRegistry.activeGauges(i);
            uint256 gaugeTotal = votePlatform.gaugeTotals(_proposalId, gauge);
            if(gaugeTotal > 0){
                gauges[n] = gauge;
                gaugeTotals[n] = gaugeTotal;
                n++;
            }
        }

        //build data
        bytes memory data = abi.encodeWithSelector(updateSelector, gauges, gaugeTotals);

        //submit to L1
        uint32 destinationNetwork = 1;
        bool forceUpdateGlobalExitRoot = true;
        IZkEvmBridge(bridge).bridgeMessage{value:0}(
            destinationNetwork,
            _contractAddr,
            forceUpdateGlobalExitRoot,
            data
        );
    }

}