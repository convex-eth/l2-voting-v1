// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;


import "./interfaces/IZkEvmBridge.sol";
import "./interfaces/IVotePlatform.sol";
import "./interfaces/IGaugeRegistry.sol";

contract CommitGaugeWeights {

    address public owner;
    address public pendingowner;

    address[] gauges;
    uint256[] gaugeTotals;

    bytes4 private constant updateSelector = bytes4(keccak256("setWeights(address[],uint256[])"));
    address public constant bridge = address(0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe);
    IVotePlatform public votePlatform;
    IGaugeRegistry public gaugeRegistry;
    uint256 public constant weightDenominator = 10000;
    uint256 public minWeight = 100;
    uint256 public constant minAllowed = 500;

    constructor(address _votePlatform, address _gaugeRegistry) {
        votePlatform = IVotePlatform(_votePlatform);
        gaugeRegistry = IGaugeRegistry(_gaugeRegistry);
        owner = msg.sender;
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
        delete gauges;
        delete gaugeTotals;
        uint256 totalWeight = 0;
        uint256 n = 0;
        for(uint256 i = 0; i < gaugeLength; i++){
            address gauge = gaugeRegistry.activeGauges(i);
            uint256 gaugeTotal = votePlatform.gaugeTotals(_proposalId, gauge);
            if(gaugeTotal > 0){
                gauges[n] = gauge;
                gaugeTotals[n] = gaugeTotal;
                totalWeight += gaugeTotal;
                n++;
            }
        }
        // remove gauges with less than minWeight
        uint256 unusedWeight = 0;
        for(uint256 i = 0; i < n; i++){
            gaugeTotals[i] = gaugeTotals[i] / totalWeight * weightDenominator;
            if(gaugeTotals[i] < minWeight){
                unusedWeight += gaugeTotals[i];
                gauges[i] = gauges[n-1];
                gaugeTotals[i] = gaugeTotals[n-1];
                n--;
                gauges.pop();
                gaugeTotals.pop();
            }
        }
        // bring weights up to 10000
        for(uint256 i = 0; i < n; i++){
            gaugeTotals[i] = gaugeTotals[i]/(weightDenominator-unusedWeight)*weightDenominator;
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

    function setMinWeight(uint256 _minWeight) external onlyOwner{
        require(_minWeight < minAllowed, "!minWeight");
        minWeight = _minWeight;
    }

    modifier onlyOwner() {
        require(owner == msg.sender, "!owner");
        _;
    }

    event TransferOwnership(address pendingOwner);
    event AcceptedOwnership(address newOwner);
}