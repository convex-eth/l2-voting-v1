// const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
const { BN, time } = require('openzeppelin-test-helpers');
var jsonfile = require('jsonfile');
const { assert } = require('chai');
const merkle = require('../../scripts/merkle');
var contractList = jsonfile.readFileSync('./contracts.json');
var votereplay = jsonfile.readFileSync('./votereplay.json');

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

contract("Replay sampling of votes", async accounts => {
  it("should deploy contracts and test various functions", async () => {

    
    let addressZero = "0x0000000000000000000000000000000000000000"

    let userA = accounts[0];
    let userB = accounts[1];
    let userC = accounts[2];
    let userD = accounts[3];
    let userE = accounts[4];
    let userX = "0xAdE9e51C9E23d64E538A7A38656B78aB6Bcc349e";
    let userZ = "0xAAc0aa431c237C2C0B5f041c8e59B3f1a43aC78F";
    let userR = "0xdc7c7f0bea8444c12ec98ec626ff071c6fa27a19";

    var userNames = {};
    userNames[userA] = "A";
    userNames[userB] = "B";
    userNames[userC] = "C";
    userNames[userD] = "D";
    userNames[userZ] = "Z";

    let chainContracts = getChainContracts();
    let deployer = chainContracts.system.deployer;
    let multisig = chainContracts.system.multisig;
   
    console.log("deployer: " +deployer);
    await unlockAccount(deployer);
    await unlockAccount(userX);
    await unlockAccount(userZ);
    await unlockAccount(userR);

    console.log("\n\n >>>> Begin Tests >>>>")


    // var gaugeVotePlatform = await GaugeVotePlatform.at("0x6d024fa49de64a975980cddd4c3212492d189e57")
    var userManager = await UpdateUserWeight.new();
    var gaugeVotePlatform = await GaugeVotePlatform.new(chainContracts.system.gaugeRegistry, chainContracts.system.surrogateRegistry, userManager.address, {from:deployer});
    // var surrogateRegistry = await SurrogateRegistry.at("0x8E42b11Ba9458592816B44896CE3fd40eEc0B2Bf")

    console.log("\n\n --- deployed ----")

    var merkledata = jsonfile.readFileSync("./proofs_" +votereplay.root +".json");

    var _baseWeightMerkleRoot = votereplay.root;
    var _startTime = await currentTime();
    var _endTime = _startTime + 4*day;
    await gaugeVotePlatform.createProposal(_baseWeightMerkleRoot, _startTime, _endTime, {from:deployer});
    console.log("proposal created");
    var proposalid = Number(await gaugeVotePlatform.proposalCount()) - 1;

    // var votium = "0xde1E6A7ED0ad3F61D531a8a78E83CcDdbd6E0c49";

    for(var i in votereplay.votes){
      var data = votereplay.votes[i];
      var mdata = merkledata.users[data.account];

      await unlockAccount(data.from);
      
      console.log("voting for " +data.account +"...");
      if(data.type == "voteWithProofs"){
        await gaugeVotePlatform.voteWithProofs(data.account, data.gauges, data.weights, mdata.proof, mdata.base_amount, mdata.adjusted_amount, mdata.delegate,{from:data.from,gasPrice:0});
      }else{
        await gaugeVotePlatform.vote(data.account, data.gauges, data.weights,{from:data.from,gasPrice:0});
      }
      console.log("vote " +i +" submitted, account:" +data.account);
      await gaugeVotePlatform.voteTotals(proposalid).then(a=>console.log("total vlcvx: " +a))
    }

    return;
  });

});


