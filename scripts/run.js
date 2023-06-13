const merkle = require('./merkle');

async function main() {
    startTime = Date.now();
    // check if console argument is "--sync"
    if (process.argv[2] === '--sync') {
        await merkle.getUsers(true);
    } else {
        await merkle.getUsers();
    }
    userBase = await merkle.getLockedBalances();
    [userAdjusted, userDelegation] = await merkle.getDelegations();
    tree = await merkle.createTree(userBase, userAdjusted, userDelegation);
    endTime = Date.now();
    console.log(`\nTime elapsed: ${(endTime - startTime) / 1000} seconds`);
}

main();
