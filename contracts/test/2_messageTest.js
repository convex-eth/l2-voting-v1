// const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
const { BN, time } = require('openzeppelin-test-helpers');
var jsonfile = require('jsonfile');
const { assert } = require('chai');
var contractList = jsonfile.readFileSync('./contracts.json');

const GaugeVotePlatform = artifacts.require("GaugeVotePlatform");
const Delegation = artifacts.require("Delegation");
const GaugeRegistry = artifacts.require("GaugeRegistry");
const CommitGaugeStatus = artifacts.require("CommitGaugeStatus");

// const IERC20 = artifacts.require("IERC20");
// const ERC20 = artifacts.require("ERC20");


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
    var userData = {};
    var userDelegation = {};
    userData[userA] = 100;
    userData[userX] = 200;
    userData[userZ] = 300;
    userDelegation[userA] = userX;
    userDelegation[userX] = userX;
    userDelegation[userZ] = userZ;

    let chainContracts = getChainContracts();
    let deployer = chainContracts.system.deployer;
    let multisig = chainContracts.system.multisig;
   
    console.log("deployer: " +deployer);
    // await unlockAccount(deployer);

    console.log("\n\n >>>> Begin Tests >>>>")

    // var gaugecommit = await CommitGaugeStatus.new();
    var gaugecommit = await CommitGaugeStatus.at(chainContracts.system.gaugeCommit);
    console.log("gaugecommit at: " +gaugecommit.address);
    // return;
    var gauge = "0xfb18127c1471131468a1aad4785c19678e521d86";
    var reg = contractList.zkevm.system.gaugeRegistry;
    console.log("sending message to " +reg);
    await gaugecommit.commit(gauge, reg,{from:deployer});
    console.log("commit called");

    // return;

    // var gaugeReg = await GaugeRegistry.new({from:deployer});
    // // var gaugeReg = await GaugeRegistry.at(reg);
    // console.log("gaugeReg: " +gaugeReg.address);
    // await gaugeReg.owner().then(a=>console.log("owner: " +a))
    // await gaugeReg.operator().then(a=>console.log("operator: " +a))
    // await gaugeReg.setOperator(contractList.mainnet.system.gaugeCommit,{from:deployer});
    // await gaugeReg.operator().then(a=>console.log("operator: " +a))

    // var bridge = "0x2a3DD3EB832aF982ec71669E178424b10Dca2EDe";
    // await unlockAccount(bridge);
    // var testcalldata = "0x4f0d36a4000000000000000000000000fb18127c1471131468a1aad4785c19678e521d860000000000000000000000000000000000000000000000000000000000000001";
    // var tx = await gaugeReg.onMessageReceived(contractList.mainnet.system.gaugeCommit,0,testcalldata,{from:bridge,gasPrice:0});
    // console.log(tx.logs[0].args);
    // await gaugeReg.setGauge(gauge,true).catch(a=>console.log("catch: " +a));

    return;
  });

});


