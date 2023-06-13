const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256')
const { ethers } = require("ethers");
const { Contract, Provider } = require('@pelith/ethers-multicall'); // multicall with archive support
const fs = require('fs');
const fetch = require('node-fetch');


function bufToHex(buffer) { // buffer is an ArrayBuffer
    return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('')
}

function addslashes(string) {
    return string.replace(/\\/g, '\\\\').
        replace(/\u0008/g, '\\b').
        replace(/\t/g, '\\t').
        replace(/\n/g, '\\n').
        replace(/\f/g, '\\f').
        replace(/\r/g, '\\r').
        replace(/'/g, '\\\'').
        replace(/"/g, '\\"');
}

cache = require('./cache.json');

var provider = new ethers.providers.JsonRpcProvider('https://eth.llamarpc.com');
var callProvider = new Provider(provider);

const lockerAddress = "0x72a19342e8F1838460eBFCCEf09F6585e32db86E";
const lockerAbi = [{"inputs":[{"internalType":"address","name":"_user","type":"address"}],"name":"lockedBalanceOf","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"epochs","outputs":[{"internalType":"uint224","name":"supply","type":"uint224"},{"internalType":"uint32","name":"date","type":"uint32"}],"stateMutability":"view","type":"function"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_user","type":"address"},{"indexed":true,"internalType":"uint256","name":"_epoch","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_paidAmount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_lockedAmount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_boostedAmount","type":"uint256"}],"name":"Staked","type":"event"},{"inputs":[{"internalType":"uint256","name":"_epoch","type":"uint256"},{"internalType":"address","name":"_user","type":"address"}],"name":"balanceAtEpochOf","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"epochCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}]

const lockerMulti = new Contract(lockerAddress, lockerAbi);
const locker = new ethers.Contract(lockerAddress, lockerAbi, provider);

// set local timezone to UTC
process.env.TZ = 'UTC';
// set local language to English
process.env.LANG = 'en_US.UTF-8';

const newEpoch = Math.floor(Date.now()/1000/(86400*7))*86400*7;

// format timestamp as "Week of 8th Jun 2023"
date = new Date(newEpoch*1000);
day = date.getDate();
month = date.toLocaleString('default', { month: 'short' });
year = date.getFullYear();
const epochString = "Week of "+day+" "+month+" "+year;

module.exports = {
    getUsers: async function (fullsync=false) {
        // get all staked events in batches of 100000 blocks
        var stakedEvents = [];
        var currentBlock = await provider.getBlockNumber();
        if(fullsync) { cache.blockHeight = 14320609; cache.userBase = {}; cache.userDelegation = {}; cache.userAdjusted = {}; }
        var startBlock = cache.blockHeight;
        eventsAll = [];
        while(startBlock < currentBlock){
            endBlock = startBlock + 100000;
            if(endBlock > currentBlock){
                endBlock = currentBlock;
            }
            console.log("getting events from " + startBlock + " to " + endBlock);
            eventsAll.push(locker.queryFilter(locker.filters.Staked(),startBlock,endBlock));
            startBlock = endBlock;
        }
        eventsAll = await Promise.all(eventsAll);
        for(var i=0; i < eventsAll.length; i++){
            stakedEvents = stakedEvents.concat(eventsAll[i]);
        }
        var userBase = cache.userBase;
        for(var i=0; i < stakedEvents.length; i++){
            var user = ethers.utils.getAddress(stakedEvents[i].args._user);
            if(userBase[user] == undefined){
                userBase[user] = 0;
            }
        }
        console.log("Total locker addresses: "+Object.keys(userBase).length);
        cache.blockHeight = currentBlock;
        cache.userBase = userBase;
        fs.writeFileSync('./cache.json', JSON.stringify(cache));
        console.log("User list cache updated");
    },
    getLockedBalances: async function (target_block) {

        await callProvider.init();
        currentEpoch = Math.floor(Date.now()/1000/(86400*7))*86400*7;
        latestIndex = await locker.epochCount();
        latestIndex = Number(latestIndex)-1;
        epochIndex = latestIndex;
        _date = currentEpoch;
        while(_date >= currentEpoch){
            _date = await locker.epochs(epochIndex);
            _date = Number(_date.date);
            if(_date >= currentEpoch){
                epochIndex--;
            }
        }
        currentEpoch = latestIndex>epochIndex ? epochIndex+1 : epochIndex;
        console.log("current epoch: "+currentEpoch);

        let querySize = 1000;
        addressArray = Object.keys(cache.userBase);
        cache.userBase = {};
        var groups = Number( (addressArray.length/querySize) + 1).toFixed(0);
        totalVlCVX = 0;
        await Promise.all([...Array(Number(groups)).keys()].map(async i => {
            var start = i*querySize;
            var finish = i*querySize + querySize - 1;
            if(finish >= addressArray.length){
                finish = addressArray.length - 1;
            }
            console.log("get balances from " + start + " to " +finish);
            var calldata = [];
            var addresses = [];
            for(var c = start; c <= finish; c++){
                calldata.push(lockerMulti.balanceAtEpochOf(currentEpoch, addressArray[c]));
                addresses.push(addressArray[c]);
            }
            //console.log(calldata);
            let balData = await callProvider.all(calldata, target_block);
            for(var d = 0; d < balData.length; d++){
                // if(balData[d] == "0x")continue;
                // console.log("baldata[d]: " +balData[d]);
                var bal = ethers.BigNumber.from(balData[d]);
                cache.userBase[ethers.utils.getAddress(addresses[d])] = bal.toString();
                totalVlCVX += Number(ethers.utils.formatUnits(bal,18));
            }
        }));

        console.log("Total vlCVX: "+totalVlCVX);
        fs.writeFileSync('./cache.json', JSON.stringify(cache));
        console.log("Balances cache updated");
        return cache.userBase;
    },
    getDelegations: async function (target_block) {
        await callProvider.init();
        let querySize = 600;
        addressArray = Object.keys(cache.userBase);
        var groups = Number( (addressArray.length/querySize) + 1).toFixed(0);
        userDelegation = {};
        await Promise.all([...Array(Number(groups)).keys()].map(async i => {
            var start = i*querySize;
            var finish = i*querySize + querySize - 1;
            if(finish >= addressArray.length){
                finish = addressArray.length - 1;
            }
            console.log("get delegations from " + start + " to " +finish);
            var calldata = [];
            var addresses = [];
            for(var c = start; c <= finish; c++){
                addresses.push(addressArray[c]);
            }
            //console.log(calldata);
            
            call = await fetch("https://api.thegraph.com/subgraphs/name/snapshot-labs/snapshot", {
                "headers": {
                  "accept": "application/json, multipart/mixed",
                  "content-type": "application/json",
                  "pragma": "no-cache",
                },
                "body": "{\"query\":\"{\\n  delegations(where: {delegator_in: "+addslashes(JSON.stringify(addresses))+", space_in: [\\\"\\\", \\\"cvx.eth\\\"]}, first: 1000) {\\n    delegator\\n    space\\n    delegate\\n  }\\n}\"}",
                "method": "POST"
              });
            response = await call.json();
            delegations = response.data.delegations;
            for(var d = 0; d < delegations.length; d++){
                if(userDelegation[ethers.utils.getAddress(delegations[d].delegator)] == undefined) {
                    userDelegation[ethers.utils.getAddress(delegations[d].delegator)] = ethers.utils.getAddress(delegations[d].delegate);
                } else if(delegations[d].space == "cvx.eth") {
                    userDelegation[ethers.utils.getAddress(delegations[d].delegator)] = ethers.utils.getAddress(delegations[d].delegate);
                }
            }
        }));

        let zeroBalanceList = [];
        for(user in cache.userBase) {
            if(cache.userBase[user] == 0) {
                zeroBalanceList.push(user);
            }
        }
        querySize = 1000;
        var groups = Number( (zeroBalanceList.length/querySize) + 1).toFixed(0);
        await Promise.all([...Array(Number(groups)).keys()].map(async i => {
            var start = i*querySize;
            var finish = i*querySize + querySize - 1;
            if(finish >= zeroBalanceList.length){
                finish = zeroBalanceList.length - 1;
            }
            console.log("Checking 0 balance addresses from " + start + " to " +finish);
            var calldata = [];
            var addresses = [];
            for(var c = start; c <= finish; c++){
                calldata.push(lockerMulti.balanceAtEpochOf(currentEpoch, zeroBalanceList[c]));
                addresses.push(zeroBalanceList[c]);
            }
            //console.log(calldata);
            let balData = await callProvider.all(calldata, target_block);
            for(var d = 0; d < balData.length; d++){
                // if(balData[d] == "0x")continue;
                // console.log("baldata[d]: " +balData[d]);
                var bal = ethers.BigNumber.from(balData[d]);
                if(bal.toString() == "0") {
                    delete cache.userBase[ethers.utils.getAddress(addresses[d])];
                }
            }
        }));

        userAdjusted = {};
        for(user in cache.userBase) {
            if(userDelegation[user] == undefined) {
                userDelegation[user] = user;
            }
            if(user.toString().toLowerCase() == "undefined") {
                console.error("undefined user" + user);
            }
            if(userAdjusted[user] == undefined) {
                userAdjusted[user] = ethers.BigNumber.from(0);
            }
            if(userAdjusted[userDelegation[user]] == undefined) {
                userAdjusted[userDelegation[user]] = ethers.BigNumber.from(0);
            }
            if(userDelegation[userDelegation[user]] == undefined) {
                userDelegation[userDelegation[user]] = userDelegation[user];
            }
            if(userBase[userDelegation[user]] == undefined) {
                userBase[userDelegation[user]] = 0;
            }
            if(userDelegation[user] != user) {
                userAdjusted[userDelegation[user]] = userAdjusted[userDelegation[user]].add(ethers.BigNumber.from(cache.userBase[user]));
            }
        }
        totalDelegated = ethers.BigNumber.from(0);
        for(user in userAdjusted) {
            totalDelegated = totalDelegated.add(userAdjusted[user]);
            userAdjusted[user] = userAdjusted[user].toString();
        }
        console.log("Total delegated: "+ethers.utils.formatUnits(totalDelegated,18));
        cache.userDelegation = userDelegation;
        cache.userAdjusted = userAdjusted;
        fs.writeFileSync('./cache.json', JSON.stringify(cache));
        console.log("Delegations cache updated");
        return [userAdjusted, userDelegation];
    },
	createTree: async function (userBase, userAdjusted, userDelegation, target_block) {
        var elements = [];
        // sort userBase object by key
        userBase = Object.keys(userBase).sort().reduce((r, k) => (r[k] = userBase[k], r), {});
        userlist = Object.keys(userBase);
        for(user in userBase){
            // abi encode packed user, delegate, base amount, adjustment
            //console.log("adding "+user+" to tree")
            elements.push(ethers.utils.solidityKeccak256(["address","address","uint256","int256"],[user,userDelegation[user],ethers.BigNumber.from(userBase[user]),ethers.BigNumber.from(userAdjusted[user])]));
        }

        const merkleTree = new MerkleTree(elements, keccak256, { sortPairs: true })
        const root = merkleTree.getRoot()

        var compiledProofs = {root: "0x"+bufToHex(root),blockHeight:target_block,users:{}};
        for(var i=0; i < elements.length; i++){
            var proofbytes = merkleTree.getProof(elements[i]);
            var proofHex = proofbytes.map(e => "0x"+e.data.toString('hex'));
            var address = userlist[i];
            var delegate = userDelegation[userlist[i]];
            var baseamount = userBase[userlist[i]];
            var adjustedamount = userAdjusted[userlist[i]];

            if(!merkleTree.verify(proofbytes,elements[i],root)) {
                console.error("proof verification failed at index " + i);
            }

            if(compiledProofs.users[address] != undefined){
                console.error("address already exists");
            }
            
            compiledProofs.users[address] = {};
            compiledProofs.users[address]["leaf"] = elements[i].toString('hex');
            compiledProofs.users[address]["proof"] = proofHex;
            compiledProofs.users[address]["base_amount"] = baseamount;
            compiledProofs.users[address]["adjusted_amount"] = adjustedamount;
            compiledProofs.users[address]["delegate"] = delegate;

        }
        fs.writeFileSync('./'+epochString+'.json', JSON.stringify(compiledProofs));
        console.log("Merkle tree written to file "+epochString+".json");
        return compiledProofs;
    }
}