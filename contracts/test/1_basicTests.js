// const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
const { BN, time } = require('openzeppelin-test-helpers');
var jsonfile = require('jsonfile');
const { assert } = require('chai');
const merkle = require('../../scripts/merkle');
var contractList = jsonfile.readFileSync('./contracts.json');

const GaugeVotePlatform = artifacts.require("GaugeVotePlatform");
const Delegation = artifacts.require("Delegation");
const GaugeRegistry = artifacts.require("GaugeRegistry");
const SurrogateRegistry = artifacts.require("SurrogateRegistry");
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
    let userE = accounts[4];
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
    userBase[userB] = 200;
    userBase[userC] = 300;
    userBase[userD] = 500;
    userBase[userE] = 0;
    userAdjusted[userA] = 0;
    userAdjusted[userB] = userBase[userA];
    userAdjusted[userC] = 0;
    userAdjusted[userD] = 0;
    userAdjusted[userE] = userBase[userD];
    userDelegation[userA] = userB;
    userDelegation[userB] = userB;
    userDelegation[userC] = userC;
    userDelegation[userD] = userE;
    userDelegation[userE] = userE;

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
    await gaugeReg.setOperator(contractList.mainnet.system.commitGaugeStatus,{from:deployer});
    console.log("set operator on gauge reg");

    var userManager = await UpdateUserWeight.new({from:deployer})
    console.log("user manager: " +userManager.address);

    var surrogateReg = await SurrogateRegistry.new({from:deployer})
    console.log("surrogateReg: " +surrogateReg.address);

    var gaugeVotePlatform = await GaugeVotePlatform.new(gaugeReg.address, surrogateReg.address, userManager.address, {from:deployer});
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
    var gaugeC = "0xcfc25170633581bf896cb6cdee170e3e3aa59503";
    var gaugeD = "0x66915f81deafcfba171aeaa914c76a607437dd4a";
    var currentEpoch = await gaugeReg.currentEpoch();
    await gaugeReg.setGauge(gaugeA,true,currentEpoch,{from:deployer});
    await gaugeReg.setGauge(gaugeB,true,currentEpoch,{from:deployer});
    await gaugeReg.setGauge(gaugeC,true,currentEpoch,{from:deployer});
    await gaugeReg.setGauge(gaugeD,true,currentEpoch,{from:deployer});
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
    var _gaugesB = [gaugeB, gaugeC];
    var _gaugesC = [gaugeD];
    var allgauges = [gaugeA, gaugeB, gaugeC, gaugeD];
    var _weights = [5000, 5000];
    var _weightsB = [9000, 1000];
    var _weightsC = [10000];
    // var _proofs = tree.users[userA].proof;
    // var _baseWeight = userBase[userA];
    // var _adjustedWeight = userAdjusted[userA];
    // var _delegate = userX;

  
    var tx = await gaugeVotePlatform.voteWithProofs(userB, _gauges, _weights, tree.users[userB].proof, userBase[userB], userAdjusted[userB], userDelegation[userB], {from:userB});
    console.log("\nvote user B ("+userB+"), gas: " +tx.receipt.gasUsed);
    await gaugeVotePlatform.getVote(pcnt-1, userB).then(a=>console.log(JSON.stringify(a)))

    const showVotedGauges = async (_proposalId) => {
      for(var i=0; i <allgauges.length; i++){
        var votedgauge = allgauges[i];
        var gaugeTotal = await gaugeVotePlatform.gaugeTotals(_proposalId,votedgauge);
        console.log("gauge " +i +": " +votedgauge +" -> " +gaugeTotal);
      }
      console.log("--------\n");
    }
    await showVotedGauges(pcnt-1);

    var tx = await gaugeVotePlatform.voteWithProofs(userA, _gauges, _weights, tree.users[userA].proof, userBase[userA], userAdjusted[userA], userDelegation[userA], {from:userA});
    console.log("\nvote user A (" +userA +"), gas: " +tx.receipt.gasUsed)
    await gaugeVotePlatform.getVote(pcnt-1, userA).then(a=>console.log(JSON.stringify(a)))
    console.log("\ncheck B's delegated weight")
    await gaugeVotePlatform.getVote(pcnt-1, userB).then(a=>console.log(JSON.stringify(a)))
    await showVotedGauges(pcnt-1);

    console.log("\nupdate A's weight...");
    await userManager.updateWeight(userA, currentEpoch, 5000,{from:deployer});
    console.log("updated A (update pattern: already voted user update)");

    await gaugeVotePlatform.getVote(pcnt-1, userA).then(a=>console.log(JSON.stringify(a)))
    await showVotedGauges(pcnt-1);

    console.log("\n\ntry vote as surrogate for C from A")
    await gaugeVotePlatform.voteWithProofs(userC, _gauges, _weights, tree.users[userC].proof, userBase[userC], userAdjusted[userC], userDelegation[userC], {from:userA}).catch(a=>console.log("catch (no surrogate): " +a));
    await surrogateReg.setSurrogate(userA,{from:userC});
    console.log("C set A as surrogate");
    await surrogateReg.isSurrogate(userA, userC).then(a=>console.log("is A surrogate for C? " +a))

    console.log("try vote as surrogate again")
    var tx = await gaugeVotePlatform.voteWithProofs(userC, _gauges, _weights, tree.users[userC].proof, userBase[userC], userAdjusted[userC], userDelegation[userC], {from:userA})
    console.log("A voted for C, user vote status should be 1, gas: " +tx.receipt.gasUsed);
    await gaugeVotePlatform.getVote(pcnt-1, userC).then(a=>console.log(JSON.stringify(a)))
    await gaugeVotePlatform.userInfo(pcnt-1, userC).then(a=>console.log(JSON.stringify(a)))
    await showVotedGauges(pcnt-1);

    console.log("let C vote for self...")
    var tx = await gaugeVotePlatform.vote(userC, _gaugesB, _weightsB, {from:userC});
    console.log("C voted for self to override surrogate, user vote status should be 2, gas: " +tx.receipt.gasUsed);

    await gaugeVotePlatform.getVote(pcnt-1, userC).then(a=>console.log(JSON.stringify(a)))
    await gaugeVotePlatform.userInfo(pcnt-1, userC).then(a=>console.log(JSON.stringify(a)))
    await showVotedGauges(pcnt-1);

    console.log("try to vote for Z from A again...");
    await gaugeVotePlatform.vote(userC, _gauges, _weights, {from:userA}).catch(a=>console.log("catch (surrogate cant vote after user votes): " +a))


    console.log("vote with A on different gauge")
    var tx = await gaugeVotePlatform.vote(userA, _gaugesC, _weightsC, {from:userA})
    console.log("voted, gas: " +tx.receipt.gasUsed);
    await gaugeVotePlatform.getVote(pcnt-1, userA).then(a=>console.log(JSON.stringify(a)))
    await showVotedGauges(pcnt-1);

    console.log("move vote of A gauge D, removing C from list..")
    var tx = await gaugeVotePlatform.vote(userA, [gaugeD], [10000], {from:userA})
    console.log("voted, gas: " +tx.receipt.gasUsed);
    await gaugeVotePlatform.getVote(pcnt-1, userA).then(a=>console.log(JSON.stringify(a)))
    var tx = await gaugeVotePlatform.vote(userC,  [gaugeD], [10000], {from:userC});
    await gaugeVotePlatform.getVote(pcnt-1, userC).then(a=>console.log(JSON.stringify(a)))
    await showVotedGauges(pcnt-1);

    return;
  });

});


