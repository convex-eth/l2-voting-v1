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
    mapping(address => bool) public inGauges;
    address[] gaugesLast;
    uint256[] gaugeTotalsLast;
    mapping(address => bool) public inGaugesLast;

    struct GaugeSet {
        address[] gauges;
        uint256[] weights;
        bytes proof;
    }

    mapping(uint256 => mapping(uint256 => GaugeSet)) public gaugeSet; // epoch => index => GaugeSet
    mapping(uint256 => uint256) public gaugeSetCount; // epoch => count

    address public constant bridge = address(0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe);
    IVotePlatform public votePlatform;
    IGaugeRegistry public gaugeRegistry;
    uint256 public constant weightDenominator = 10000;
    uint256 public minWeight = 100;
    uint256 public constant minAllowed = 500;
    uint256 public constant epochDuration = 86400 * 7;
    uint256 public lastEpoch;


    constructor(address _votePlatform, address _gaugeRegistry) {
        votePlatform = IVotePlatform(_votePlatform);
        gaugeRegistry = IGaugeRegistry(_gaugeRegistry); // left here in case we want to check if a gauge is active again before building arrays
        owner = msg.sender;
    }


    function currentEpoch() public view returns (uint256) {
        return block.timestamp/epochDuration*epochDuration;
    }

    function commit() external  {
        uint256 ce = currentEpoch();
        require(ce > lastEpoch, "!epoch"); // prevent multiple relays in same epoch (2?)
        lastEpoch = ce;
        // get latest proposal
        uint256 _proposalId = votePlatform.proposalCount() - 1;
        // require proposal is ended
        require(votePlatform.proposals(_proposalId).endTime < block.timestamp, "!ended");

        // delete inGaugesLast
        for(uint256 i = 0; i< gaugesLast.length; i++){
            inGaugesLast[gaugesLast[i]] = false;
        }
        // build last epoch arrays
        gaugesLast = gauges;
        gaugeTotalsLast = gaugeTotals;

        // remove gauges with 0 weight from last epoch
        for(uint256 i = 0; i< gaugesLast.length; i++){
            if(gaugeTotalsLast[i] == 0){
                gaugesLast[i] = gaugesLast[gaugesLast.length - 1];
                gaugeTotalsLast[i] = gaugeTotalsLast[gaugeTotalsLast.length - 1];
                gaugesLast.pop();
                gaugeTotalsLast.pop();
                i--;
            } else {
                inGaugesLast[gaugesLast[i]] = true;
            }
        }

        // delete inGauges
        for(uint256 i = 0; i< gauges.length; i++){
            inGauges[gauges[i]] = false;
        }

        delete gauges;
        delete gaugeTotals;

        // build new epoch arrays
        uint256 totalWeight = 0;
        // start with gauges that decreased in weight
        for(uint256 i = 0; i< gaugesLast.length; i++){
            uint256 gaugeTotal = votePlatform.gaugeTotals(_proposalId, gaugesLast[i]);
            if(gaugeTotal < gaugeTotalsLast[i]){
                gauges.push(gaugesLast[i]);
                gaugeTotals.push(gaugeTotal);
                inGauges[gaugesLast[i]] = true;
                totalWeight += gaugeTotal;
            }
        }
        
        // add gauges that increased in weight
        uint256 gaugeLength = votePlatform.gaugesWithVotesCount(_proposalId);
        for(uint256 i = 0; i < gaugeLength; i++){
            address gauge = votePlatform.gaugesWithVotes(_proposalId, i);
            if(inGauges[gauge]){
                continue;
            }
            uint256 gaugeTotal = votePlatform.gaugeTotals(_proposalId, gauge);
            gauges.push(gauge);
            inGauges[gauge] = true;
            gaugeTotals.push(gaugeTotal);
            totalWeight += gaugeTotal;
        }

        // zero-out or remove gauges with less than minWeight
        uint256 unusedWeight = 0;
        for(uint256 i = 0; i < gaugeLength; i++){
            gaugeTotals[i] = gaugeTotals[i] / totalWeight * weightDenominator;
            if(gaugeTotals[i] < minWeight){
                unusedWeight += gaugeTotals[i];
                if(inGaugesLast[gauges[i]]) { // keep gauges that were active last epoch
                    gaugeTotals[i] = 0;
                } else {                // remove gauges that were not active last epoch
                    gauges[i] = gauges[gaugeLength-1];
                    gaugeTotals[i] = gaugeTotals[gaugeLength-1];
                    gaugeLength--;
                    gauges.pop();
                    gaugeTotals.pop();
                }
            }
        }
        // bring weights up to 10000
        for(uint256 i = 0; i < gaugeLength; i++){
            gaugeTotals[i] = gaugeTotals[i]/(weightDenominator-unusedWeight)*weightDenominator;
        }

        // build in sets of 20  gauges
        uint256 s = 0;
        for(uint256 i = 0; i<gauges.length; i++) {
            //build gaugeSet
            if(i+25 < gauges.length){ // build sets of 20, unless there are fewer than 25 remaining
                for(uint256 n = 0; n<20; n++){
                    gaugeSet[ce][s].gauges.push(gauges[i]);
                    gaugeSet[ce][s].weights.push(gaugeTotals[i]);
                    i++;
                }
                gaugeSet[ce][s].proof = abi.encodePacked(gaugeSet[ce][s].gauges, gaugeSet[ce][s].weights);
                s++;
                i--;
            } else { // build final set
                gaugeSet[ce][s].gauges.push(gauges[i]);
                gaugeSet[ce][s].weights.push(gaugeTotals[i]);
            }
        }
        gaugeSet[ce][s].proof = abi.encodePacked(gaugeSet[ce][s].gauges, gaugeSet[ce][s].weights);
        gaugeSetCount[ce] = s+1;

        /*

        Leave off until tested

        //submit to L1
        uint32 destinationNetwork = 0;
        bool forceUpdateGlobalExitRoot = true;
        IZkEvmBridge(bridge).bridgeMessage{value:0}(
            destinationNetwork,
            _contractAddr,
            forceUpdateGlobalExitRoot,
            data
        );
        */
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