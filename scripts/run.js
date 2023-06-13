const merkle = require('./merkle');
const EthDater = require('ethereum-block-by-date');
const { ethers } = require("ethers");
var provider = new ethers.providers.JsonRpcProvider('https://eth.llamarpc.com');

const newEpoch = Math.floor(Date.now()/1000/(86400*7))*86400*7;
const dater = new EthDater(provider);

async function main() {
    target_block = await dater.getDate(newEpoch*1000, true, false);
    target_block = target_block.block;
    console.log("target block: "+target_block);
    startTime = Date.now();
    // check if console argument is "--sync"
    if (process.argv[2] === '--sync') {
        await merkle.getUsers(true);
    } else {
        await merkle.getUsers();
    }
    userBase = await merkle.getLockedBalances(target_block);
    [userAdjusted, userDelegation] = await merkle.getDelegations(target_block);
    tree = await merkle.createTree(userBase, userAdjusted, userDelegation, target_block);
    endTime = Date.now();
    console.log(`\nTime elapsed: ${(endTime - startTime) / 1000} seconds`);
}

main();
