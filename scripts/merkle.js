const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256')
const { ethers } = require("ethers");
const { Contract, Provider } = require('@pelith/ethers-multicall'); // multicall with archive support
const fs = require('fs');
const fetch = require('node-fetch');


function bufToHex(buffer) { // buffer is an ArrayBuffer
    return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('')
}

cache = require('./cache.json');

var provider = new ethers.providers.JsonRpcProvider('https://eth.llamarpc.com');
var callProvider = new Provider(provider);

const lockerAddress = "0x72a19342e8F1838460eBFCCEf09F6585e32db86E";
const lockerAbi = [{"inputs":[{"internalType":"address","name":"_user","type":"address"}],"name":"lockedBalanceOf","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"epochs","outputs":[{"internalType":"uint224","name":"supply","type":"uint224"},{"internalType":"uint32","name":"date","type":"uint32"}],"stateMutability":"view","type":"function"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_user","type":"address"},{"indexed":true,"internalType":"uint256","name":"_epoch","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_paidAmount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_lockedAmount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_boostedAmount","type":"uint256"}],"name":"Staked","type":"event"},{"inputs":[{"internalType":"uint256","name":"_epoch","type":"uint256"},{"internalType":"address","name":"_user","type":"address"}],"name":"balanceAtEpochOf","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"epochCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}]

const delAddress = "0x469788fE6E9E9681C6ebF3bF78e7Fd26Fc015446";
const delAbi = [{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"delegator","type":"address"},{"indexed":true,"internalType":"bytes32","name":"id","type":"bytes32"},{"indexed":true,"internalType":"address","name":"delegate","type":"address"}],"name":"ClearDelegate","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"delegator","type":"address"},{"indexed":true,"internalType":"bytes32","name":"id","type":"bytes32"},{"indexed":true,"internalType":"address","name":"delegate","type":"address"}],"name":"SetDelegate","type":"event"},{"inputs":[{"internalType":"bytes32","name":"id","type":"bytes32"}],"name":"clearDelegate","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"bytes32","name":"","type":"bytes32"}],"name":"delegation","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"bytes32","name":"id","type":"bytes32"},{"internalType":"address","name":"delegate","type":"address"}],"name":"setDelegate","outputs":[],"stateMutability":"nonpayable","type":"function"}];

const voteBalanceAddress = "0x81768695e9fDdA232491bec5B21Fd1BC1116F917";
const voteBalanceAbi = [{"inputs":[{"internalType":"address","name":"_user","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"stateMutability":"view","type":"function"}];

const lockerMulti = new Contract(lockerAddress, lockerAbi);
const locker = new ethers.Contract(lockerAddress, lockerAbi, provider);
const delegation = new Contract(delAddress, delAbi);
const voteBalance = new Contract(voteBalanceAddress, voteBalanceAbi);

// set local timezone to UTC
process.env.TZ = 'UTC';
// set local language to English
process.env.LANG = 'en_US.UTF-8';

const newEpoch = Math.floor(Date.now()/1000/(86400*7))*86400*7;

date = new Date(newEpoch*1000);
day = date.getDate();
month = date.getMonth()+1;
year = date.getFullYear();
const epochString = "proofs_" +year +"_" +month+"_" +day;

module.exports = {
    getUsers: async function (target_block, fullsync=false) {
        // get all staked events in batches of 100000 blocks
        var stakedEvents = [];
        if(fullsync) { cache.usersBlock = 14320609; cache.userBase = {}; cache.userDelegation = {}; cache.userAdjusted = {}; }
        var startBlock = cache.usersBlock-1;
        eventsAll = [];
        while(startBlock < target_block){
            endBlock = startBlock + 100000;
            if(endBlock > target_block){
                endBlock = target_block;
            }
            console.log("getting lock events from " + startBlock + " to " + endBlock);
            eventsAll.push(locker.queryFilter(locker.filters.Staked(),startBlock,endBlock));
            startBlock = endBlock;
        }
        eventsAll = await Promise.all(eventsAll);
        for(var i=0; i < eventsAll.length; i++){
            stakedEvents = stakedEvents.concat(eventsAll[i]);
        }
        for(var i=0; i < stakedEvents.length; i++){
            var user = ethers.utils.getAddress(stakedEvents[i].args._user);
            if(cache.userBase[user] == undefined){
                cache.userBase[user] = 0;
            }
        }
        console.log("Total locker addresses: "+Object.keys(cache.userBase).length);
        cache.usersBlock = target_block;

        addressArray = Object.keys(cache.userBase);
        querySize = 1000;
        var groups = Math.floor(Number( (addressArray.length/querySize) + 1));
        let rm = 0;
        await Promise.all([...Array(Number(groups)).keys()].map(async i => {
            var start = i*querySize;
            var finish = i*querySize + querySize - 1;
            if(finish >= addressArray.length){
                finish = addressArray.length - 1;
            }
            console.log("Checking lockedBalanceOf from " + start + " to " +finish);
            var calldata = [];
            var addresses = [];
            for(var c = start; c <= finish; c++){
                calldata.push(lockerMulti.lockedBalanceOf(addressArray[c]));
                addresses.push(addressArray[c]);
            }
            //console.log(calldata);
            let balData = await callProvider.all(calldata, target_block);
            for(var d = 0; d < balData.length; d++){
                // if(balData[d] == "0x")continue;
                // console.log("baldata[d]: " +balData[d]);
                var bal = ethers.BigNumber.from(balData[d]);
                if(bal.toString() == "0") {
                    delete cache.userBase[ethers.utils.getAddress(addresses[d])];
                    rm++;
                }
            }
        }));
        console.log("Removed "+rm+" zero-lockedBalance addresses");

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
        var groups = Math.floor(Number( (addressArray.length/querySize) + 1));

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
                calldata.push(voteBalance.balanceOf(addressArray[c]));
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
        await fs.writeFileSync('./cache.json', JSON.stringify(cache));
        console.log("Balances cache updated");
        return cache.userBase;
    },
    getDelegations: async function (target_block) {
        addressArray = Object.keys(cache.userBase);
        var groups = Math.floor(Number( (addressArray.length/querySize) + 1));
        globalCheckList = [];
        await Promise.all([...Array(Number(groups)).keys()].map(async i => {
            var start = i*querySize;
            var finish = i*querySize + querySize - 1;
            if(finish >= addressArray.length){
                finish = addressArray.length - 1;
            }
            console.log("get cvx delegations from " + start + " to " +finish);
            var calldata = [];
            var addresses = [];
            for(var c = start; c <= finish; c++){
                calldata.push(delegation.delegation(addressArray[c], "0x6376782e65746800000000000000000000000000000000000000000000000000"));
                addresses.push(addressArray[c]);
            }
            //console.log(calldata);
            let delData = await callProvider.all(calldata, target_block);
            for(var d = 0; d < delData.length; d++){
                if(delData[d] == ethers.constants.AddressZero) {
                    globalCheckList.push(addresses[d]);
                } else {
                    cache.userDelegation[ethers.utils.getAddress(addresses[d])] = ethers.utils.getAddress(delData[d]);
                }
            }
        }));
        addressArray = globalCheckList;
        var groups = Math.floor(Number( (addressArray.length/querySize) + 1));
        await Promise.all([...Array(Number(groups)).keys()].map(async i => {
            var start = i*querySize;
            var finish = i*querySize + querySize - 1;
            if(finish >= addressArray.length){
                finish = addressArray.length - 1;
            }
            console.log("get global delegations from " + start + " to " +finish);
            var calldata = [];
            var addresses = [];
            for(var c = start; c <= finish; c++){
                calldata.push(delegation.delegation(addressArray[c], "0x0000000000000000000000000000000000000000000000000000000000000000"));
                addresses.push(addressArray[c]);
            }
            //console.log(calldata);
            let delData = await callProvider.all(calldata, target_block);
            for(var d = 0; d < delData.length; d++){

                var delegate = ethers.utils.getAddress(delData[d]);
                if(delegate != ethers.constants.AddressZero) {
                    cache.userDelegation[addresses[d]] = delegate;
                } else {   
                    cache.userDelegation[addresses[d]] = addresses[d];
                }
            }
        }));
        await fs.writeFileSync('./cache.json', JSON.stringify(cache));
        console.log("Delegations cache updated");
    },
    cleanUp: async function () {
        userAdjusted = {};
        for(user in cache.userBase) {
            if(cache.userDelegation[user] == undefined) {
                cache.userDelegation[user] = user;
            }
            if(user.toString().toLowerCase() == "undefined") {
                console.error("undefined user" + user);
            }
            if(userAdjusted[user] == undefined) {
                userAdjusted[user] = ethers.BigNumber.from(0);
            }
            if(userAdjusted[cache.userDelegation[user]] == undefined) {
                userAdjusted[cache.userDelegation[user]] = ethers.BigNumber.from(0);
            }
            if(cache.userDelegation[cache.userDelegation[user]] == undefined) {
                cache.userDelegation[cache.userDelegation[user]] = cache.userDelegation[user];
            }
            if(cache.userBase[cache.userDelegation[user]] == undefined) {
                cache.userBase[cache.userDelegation[user]] = 0;
            }
            if(cache.userDelegation[user] != user) {
                userAdjusted[cache.userDelegation[user]] = userAdjusted[cache.userDelegation[user]].add(ethers.BigNumber.from(cache.userBase[user]));
            }
        }
        totalDelegated = ethers.BigNumber.from(0);
        for(user in userAdjusted) {
            totalDelegated = totalDelegated.add(userAdjusted[user]);
            userAdjusted[user] = userAdjusted[user].toString();
        }
        console.log("Total delegated: "+ethers.utils.formatUnits(totalDelegated,18));
        cache.userAdjusted = userAdjusted;
        await fs.writeFileSync('./cache.json', JSON.stringify(cache, null, 2));
        console.log("Cleaned up cache");
        return [cache.userBase, cache.userAdjusted, cache.userDelegation];
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
        await fs.writeFileSync('./'+epochString+'.json', JSON.stringify(compiledProofs, null, 2));
        console.log("Merkle tree written to file "+epochString+".json");
        return compiledProofs;
    }
}