import { Wallet, utils } from "zksync-web3";
import * as ethers from "ethers";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
var jsonfile = require('jsonfile');
var api_keys = jsonfile.readFileSync('./.api_keys');

// load env file
// import dotenv from "dotenv";
// dotenv.config();

// load wallet private key from env file
const PRIVATE_KEY = api_keys.mnemonic;

if (!PRIVATE_KEY)
  throw "⛔️ Private key not detected! Add it to the .api_keys file!";

// An example of a deploy script that will deploy and call a simple contract.
export default async function (hre: HardhatRuntimeEnvironment) {
  console.log(`Running deploy script for the GaugeRegistry contract`);

  // Initialize the wallet.
  const wallet = new Wallet(PRIVATE_KEY);

  // Create deployer object and load the artifact of the contract you want to deploy.
  const deployer = new Deployer(hre, wallet);
  const artifact = await deployer.loadArtifact("GaugeRegistry");

  // Estimate contract deployment fee
  // const arg0 = "Hi there!";
  const deploymentFee = await deployer.estimateDeployFee(artifact, []);

  // ⚠️ OPTIONAL: You can skip this block if your account already has funds in L2
  // const depositHandle = await deployer.zkWallet.deposit({
  //   to: deployer.zkWallet.address,
  //   token: utils.ETH_ADDRESS,
  //   amount: deploymentFee.mul(2),
  // });
  // // Wait until the deposit is processed on zkSync
  // await depositHandle.wait();

  // Deploy this contract. The returned object will be of a `Contract` type, similarly to ones in `ethers`.
  const parsedFee = ethers.utils.formatEther(deploymentFee.toString());
  console.log(`The deployment is estimated to cost ${parsedFee} ETH`);

  const deployedContract = await deployer.deploy(artifact, []);

  //obtain the Constructor Arguments
  console.log(
    "constructor args:" + deployedContract.interface.encodeDeploy([])
  );

  // Show the contract info.
  const contractAddress = deployedContract.address;
  console.log(`${artifact.contractName} was deployed to ${contractAddress}`);
}
