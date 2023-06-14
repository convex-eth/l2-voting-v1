// const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
const { BN, time } = require('openzeppelin-test-helpers');
var jsonfile = require('jsonfile');
const { assert } = require('chai');
const merkle = require('../../scripts/merkle');
var contractList = jsonfile.readFileSync('./contracts.json');

const GaugeVotePlatform = artifacts.require("GaugeVotePlatform");
const Delegation = artifacts.require("Delegation");
const GaugeRegistry = artifacts.require("GaugeRegistry");
const UpdateUserWeight = artifacts.require("UpdateUserWeight");

// const IERC20 = artifacts.require("IERC20");
// const ERC20 = artifacts.require("ERC20");


// const unlockAccount = async (address) => {
//   return new Promise((resolve, reject) => {
//     web3.currentProvider.send(
//       {
//         jsonrpc: "2.0",
//         method: "evm_unlockUnknownAccount",
//         params: [address],
//         id: new Date().getTime(),
//       },
//       (err, result) => {
//         if (err) {
//           return reject(err);
//         }
//         return resolve(result);
//       }
//     );
//   });
// };

const addAccount = async (address) => {
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "evm_addAccount",
        params: [address, "passphrase"],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

const unlockAccount = async (address) => {
  await addAccount(address);
  return new Promise((resolve, reject) => {
    web3.currentProvider.send(
      {
        jsonrpc: "2.0",
        method: "personal_unlockAccount",
        params: [address, "passphrase"],
        id: new Date().getTime(),
      },
      (err, result) => {
        if (err) {
          return reject(err);
        }
        return resolve(result);
      }
    );
  });
};

const send = payload => {
  if (!payload.jsonrpc) payload.jsonrpc = '2.0';
  if (!payload.id) payload.id = new Date().getTime();

  return new Promise((resolve, reject) => {
    web3.currentProvider.send(payload, (error, result) => {
      if (error) return reject(error);

      return resolve(result);
    });
  });
};

/**
 *  Mines a single block in Ganache (evm_mine is non-standard)
 */
const mineBlock = () => send({ method: 'evm_mine' });
const mineMultiBlock = (blockCnt) => send({ method: 'evm_mine', options:{blocks:blockCnt } });
/**
 *  Gets the time of the last block.
 */
const currentTime = async () => {
  const { timestamp } = await web3.eth.getBlock('latest');
  return timestamp;
};

/**
 *  Increases the time in the EVM.
 *  @param seconds Number of seconds to increase the time by
 */
const fastForward = async seconds => {
  // It's handy to be able to be able to pass big numbers in as we can just
  // query them from the contract, then send them back. If not changed to
  // a number, this causes much larger fast forwards than expected without error.
  if (BN.isBN(seconds)) seconds = seconds.toNumber();

  // And same with strings.
  if (typeof seconds === 'string') seconds = parseFloat(seconds);

  await send({
    method: 'evm_increaseTime',
    params: [seconds],
  });

  // await mineBlock();
  await mineMultiBlock(1000);
};


const getChainContracts = () => {
  let NETWORK = config.network;//process.env.NETWORK;
  console.log("network: " +NETWORK);
  var contracts = {};

  if(NETWORK == "debugZkevm" || NETWORK == "mainnetZkevm"){
    contracts = contractList.zkevm;
  }else if(NETWORK == "debug" || NETWORK == "mainnet"){
    contracts = contractList.mainnet;
  }

  return contracts;
}

const advanceTime = async (secondsElaspse) => {
  await time.increase(secondsElaspse);
  await time.advanceBlock();
  console.log("\n  >>>>  advance time " +(secondsElaspse/86400) +" days  >>>>\n");
}
const day = 86400;

contract("Deploy System and test", async accounts => {
  it("should deploy contracts and test various functions", async () => {

    
    let addressZero = "0x0000000000000000000000000000000000000000"

    let userA = accounts[0];
    let userB = accounts[1];
    let userC = accounts[2];
    let userD = accounts[3];
    let userX = "0xAdE9e51C9E23d64E538A7A38656B78aB6Bcc349e";
    let userZ = "0xAAc0aa431c237C2C0B5f041c8e59B3f1a43aC78F";
    var userNames = {};
    userNames[userA] = "A";
    userNames[userB] = "B";
    userNames[userC] = "C";
    userNames[userD] = "D";
    userNames[userZ] = "Z";

    // merkle data
    var userBase = {};
    var userAdjusted = {};
    var userDelegation = {};
    userBase[userA] = 100;
    userBase[userX] = 200;
    userBase[userZ] = 300;
    userAdjusted[userA] = 0;
    userAdjusted[userX] = userBase[userA];
    userAdjusted[userZ] = 0;
    userDelegation[userA] = userX;
    userDelegation[userX] = userX;
    userDelegation[userZ] = userZ;

    tree = await merkle.createTree(userBase, userAdjusted, userDelegation);
    console.log(JSON.stringify(tree, null, 2));

    let chainContracts = getChainContracts();
    let deployer = chainContracts.system.deployer;
    let multisig = chainContracts.system.multisig;
   
    console.log("deployer: " +deployer);
    await unlockAccount(deployer);
    await unlockAccount(userX);
    await unlockAccount(userZ);

    console.log("\n\n >>>> Begin Tests >>>>")

    //system
    var delegation = await Delegation.new({from:deployer});
    console.log("delegation: " +delegation.address)

    var gaugeReg = await GaugeRegistry.new({from:deployer});
    console.log("gaugeReg: " +gaugeReg.address);
    await gaugeReg.setOperator(contractList.mainnet.system.gaugeCommit,{from:deployer});
    console.log("set operator on gauge reg");

    var userManager = await UpdateUserWeight.new({from:deployer})
    console.log("user manager: " +userManager.address);

    var gaugeVotePlatform = await GaugeVotePlatform.new(gaugeReg.address, userManager.address, {from:deployer});
    console.log("gaugeVotePlatform: " +gaugeVotePlatform.address)

    console.log("\n\n --- deployed ----")

    // test delegation
    // console.log("delegate userA to userX")
    // await delegation.setDelegate(userX, {from:userA});
    // cdelegate = await delegation.registry(userA, {from:userA});
    // assert.equal(cdelegate.to, userX, "delegate to userX");

    // cdelegate = await delegation.getDelegate(userA, {from:userA});
    // console.log("UserA delegate current:"+cdelegate);
    // assert.equal(cdelegate, userA, "delegation current");
    // // advance time 1 week
    // await advanceTime(7*day);
    // cdelegate = await delegation.getDelegate(userA, {from:userA});
    // console.log("UserA delegate next epoch:"+cdelegate);
    // assert.equal(cdelegate, userX, "delegation next epoch");



    console.log("Create proposal");
    //fill some gauges
    var gaugeA = "0xfb18127c1471131468a1aad4785c19678e521d86";
    var gaugeB = "0x2932a86df44fe8d2a706d8e9c5d51c24883423f5";
    var currentEpoch = await gaugeReg.currentEpoch();
    await gaugeReg.setGauge(gaugeA,true,currentEpoch,{from:deployer});
    await gaugeReg.setGauge(gaugeB,true,currentEpoch,{from:deployer});
    var _baseWeightMerkleRoot = tree.root;
    var _startTime = await currentTime();
    var _endTime = _startTime + 4*day;
    await gaugeVotePlatform.createProposal(_baseWeightMerkleRoot, _startTime, _endTime, {from:deployer});
    
    var proposal = await gaugeVotePlatform.proposals(0);
    console.log(JSON.stringify(proposal));

    await gaugeVotePlatform.forceEndProposal({from:deployer});
    console.log("force end");

    var proposal = await gaugeVotePlatform.proposals(0);
    console.log(JSON.stringify(proposal));

    await gaugeVotePlatform.createProposal(_baseWeightMerkleRoot, _endTime, _startTime, {from:deployer}).catch(a=>console.log("catch: " +a));
    await gaugeVotePlatform.createProposal(_baseWeightMerkleRoot, _startTime, _endTime-(2*day), {from:deployer}).catch(a=>console.log("catch: " +a));
    await gaugeVotePlatform.createProposal(_baseWeightMerkleRoot, _startTime, _endTime+(3*day), {from:deployer}).catch(a=>console.log("catch: " +a));
    await gaugeVotePlatform.createProposal(_baseWeightMerkleRoot, _startTime, _endTime, {from:deployer});

    var pcnt = Number(await gaugeVotePlatform.proposalCount());
    console.log("proposal count: " +pcnt);
    var proposal = await gaugeVotePlatform.proposals(pcnt-1);
    console.log(JSON.stringify(proposal));

    console.log("Vote with proofs");
    //    function voteWithProofs(uint256 _proposalId, address[] calldata _gauges, uint256[] calldata _weights, bytes32[] calldata proofs, uint256 _baseWeight, address _delegate) public {
    var _proposalId = 0;
    var _gauges = [gaugeA, gaugeB];
    var _weights = [4000, 6000];
    // var _proofs = tree.users[userA].proof;
    // var _baseWeight = userBase[userA];
    // var _adjustedWeight = userAdjusted[userA];
    // var _delegate = userX;

  
    await gaugeVotePlatform.voteWithProofs(_gauges, _weights, tree.users[userX].proof, userBase[userX], userAdjusted[userX], userDelegation[userX], {from:userX,gasPrice:0});
    console.log("\nvote user X ("+userX+")");
    await gaugeVotePlatform.getVote(pcnt-1, userX).then(a=>console.log(JSON.stringify(a)))

    await gaugeVotePlatform.voteWithProofs(_gauges, _weights, tree.users[userA].proof, userBase[userA], userAdjusted[userA], userDelegation[userA], {from:userA});
    console.log("\nvote user A (" +userA +")")
    await gaugeVotePlatform.getVote(pcnt-1, userA).then(a=>console.log(JSON.stringify(a)))
    console.log("\ncheck x's delegated weight")
    await gaugeVotePlatform.getVote(pcnt-1, userX).then(a=>console.log(JSON.stringify(a)))


    console.log("\nupdate A's weight...");
    await userManager.updateWeight(gaugeVotePlatform.address, userA, currentEpoch, pcnt-1, 5000,{from:deployer});
    console.log("updated A (update pattern: already voted user update)");

    await gaugeVotePlatform.getVote(pcnt-1, userA).then(a=>console.log(JSON.stringify(a)))

    return;
  });

});


