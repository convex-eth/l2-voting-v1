const merkle = require('./merkle');
const EthDater = require('ethereum-block-by-date');
const { ethers } = require("ethers");
var provider = new ethers.providers.JsonRpcProvider('https://eth.llamarpc.com');

const newEpoch = Math.floor(Date.now()/1000/(86400*7))*86400*7;
const dater = new EthDater(provider);

async function main() {
    target_block = await dater.getDate(newEpoch*1000, true, false);
    target_block = target_block.block;
    blocktime = await provider.getBlock(target_block);
    while(blocktime.timestamp < newEpoch) {
        target_block += 1;
        blocktime = await provider.getBlock(target_block);
    }
    console.log("target block: "+target_block);
    console.log("target block time: "+blocktime.timestamp);
    console.log("Block is "+(blocktime.timestamp-newEpoch)+" seconds into the epoch.");
    startTime = Date.now();
    // check if console argument is "--sync"
    if (process.argv[2] === '--sync') {
        await merkle.getUsers(target_block, true);
    } else {
        await merkle.getUsers(target_block);
    }
    await merkle.getLockedBalances(target_block);
    await await merkle.getDelegations(target_block);
    [userBase, userAdjusted, userDelegation] = await merkle.cleanUp();
    tree = await merkle.createTree(userBase, userAdjusted, userDelegation, target_block);
    endTime = Date.now();
    console.log(`\nTime elapsed: ${(endTime - startTime) / 1000} seconds`);
}

main();
