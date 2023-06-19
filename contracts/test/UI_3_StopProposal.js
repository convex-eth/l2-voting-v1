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


    let chainContracts = getChainContracts();
    let deployer = chainContracts.system.deployer;
    let multisig = chainContracts.system.multisig;
   
    console.log("deployer: " +deployer);
    await unlockAccount(deployer);

    console.log("\n\n >>>> Begin Tests >>>>")

    //system
    var tree = jsonfile.readFileSync('./proofs_2023_5_15.json');

    var gaugeVotePlatform = await GaugeVotePlatform.at(chainContracts.system.gaugeVotePlatform);
    console.log("gaugeVotePlatform: " +gaugeVotePlatform.address)

    var pCnt = Number(await gaugeVotePlatform.proposalCount());
    await gaugeVotePlatform.forceEndProposal({from:deployer});
    console.log("\n\nforce end proposal: " +(pCnt-1) );

    return;
  });

});


