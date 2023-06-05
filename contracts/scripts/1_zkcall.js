
const hre = require("hardhat");
const { Deployer } = require("@matterlabs/hardhat-zksync-deploy");
const zk = require('zksync-web3');


async function main() {

    const testMnemonic = 'stuff slice staff easily soup parent arm payment cotton trade scatter struggle';
    const wallet = zk.Wallet.fromMnemonic(testMnemonic, "m/44'/60'/0'/0/0");

    // Create deployer object and load the artifact of the contract you want to deploy.
    const deployer = new Deployer(hre, wallet);
    const artifact = await deployer.loadArtifact("GaugeRegistry");

    const contractAddress = "0x08ab1B475a3d616c3c38b0e9DE990e000468665d";
    // const reg = new zk.ContractFactory("GaugeRegistry");
    const reg = new zk.ContractFactory(artifact.abi, artifact.bytecode, deployer.zkWallet, deployer.deploymentType);
    const gaugeReg = await reg.attach(contractAddress);
    console.log("attached");

    const owner = await gaugeReg.owner();
    console.log("owner:", owner);

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });