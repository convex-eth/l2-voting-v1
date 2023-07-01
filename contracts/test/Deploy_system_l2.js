// const { BN, constants, expectEvent, expectRevert, time } = require('openzeppelin-test-helpers');
const { BN, time } = require('openzeppelin-test-helpers');
var jsonfile = require('jsonfile');
const { assert } = require('chai');
const merkle = require('../../scripts/merkle');
var contractList = jsonfile.readFileSync('./contracts.json');

const GaugeVotePlatform = artifacts.require("GaugeVotePlatform");
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
    var gaugeReg = await GaugeRegistry.new({from:deployer});
    console.log("gaugeReg: " +gaugeReg.address);
    await gaugeReg.setOperator(contractList.mainnet.system.commitGaugeStatus,{from:deployer});
    console.log("set operator on gauge reg");

    var userManager = await UpdateUserWeight.new({from:deployer})
    console.log("user manager: " +userManager.address);
    await userManager.setOperator(contractList.mainnet.system.commitUserWeight,{from:deployer});
    console.log("set operator on user weight manager");

    var surrogateReg = await SurrogateRegistry.new({from:deployer})
    console.log("surrogateReg: " +surrogateReg.address);
    await surrogateReg.setOperator(contractList.mainnet.system.commitUserSurrogate,{from:deployer});
    console.log("set operator on user surrogate manager");

    var gaugeVotePlatform = await GaugeVotePlatform.new(gaugeReg.address, surrogateReg.address, userManager.address, {from:deployer});
    console.log("gaugeVotePlatform: " +gaugeVotePlatform.address)

    chainContracts.system.gaugeRegistry= gaugeReg.address;
    chainContracts.system.surrogateRegistry = surrogateReg.address;
    chainContracts.system.userWeightManager = userManager.address;
    chainContracts.system.gaugeVotePlatform = gaugeVotePlatform.address;
    jsonfile.writeFileSync("./contracts.json", contractList, { spaces: 4 });

    //fill some gauges
    // var gaugeA = "0xfb18127c1471131468a1aad4785c19678e521d86";
    // var gaugeB = "0x2932a86df44fe8d2a706d8e9c5d51c24883423f5";
    // var gaugeC = "0xcfc25170633581bf896cb6cdee170e3e3aa59503";
    // var gaugeD = "0x66915f81deafcfba171aeaa914c76a607437dd4a";
    // var currentEpoch = await gaugeReg.currentEpoch();
    // await gaugeReg.setGauge(gaugeA,true,currentEpoch,{from:deployer});
    // await gaugeReg.setGauge(gaugeB,true,currentEpoch,{from:deployer});
    // await gaugeReg.setGauge(gaugeC,true,currentEpoch,{from:deployer});
    // await gaugeReg.setGauge(gaugeD,true,currentEpoch,{from:deployer});

    console.log("\n\n --- deployed ----\n\n")


    var gaugeList = jsonfile.readFileSync('./gauge_list.json');
    gaugeList = gaugeList.gauges;
    var epoch = await gaugeReg.currentEpoch();
    for(var i = 0; i < gaugeList.length; i++){
      console.log("add gauge: " +gaugeList[i]);
      await gaugeReg.setGauge(gaugeList[i],true,epoch,{from:deployer});
    }
    await gaugeReg.gaugeLength().then(a=>console.log("\n\nregistered gauges: " +a));

    return;
  });

});


