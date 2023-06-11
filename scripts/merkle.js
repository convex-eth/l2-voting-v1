const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256')
const { ethers } = require("ethers");
const { Contract, Provider } = require('ethers-multicall');
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
const lockerAbi = [{"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"epochs","outputs":[{"internalType":"uint224","name":"supply","type":"uint224"},{"internalType":"uint32","name":"date","type":"uint32"}],"stateMutability":"view","type":"function"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_user","type":"address"},{"indexed":true,"internalType":"uint256","name":"_epoch","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_paidAmount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_lockedAmount","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"_boostedAmount","type":"uint256"}],"name":"Staked","type":"event"},{"inputs":[{"internalType":"uint256","name":"_epoch","type":"uint256"},{"internalType":"address","name":"_user","type":"address"}],"name":"balanceAtEpochOf","outputs":[{"internalType":"uint256","name":"amount","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"epochCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}]

const lockerMulti = new Contract(lockerAddress, lockerAbi);
const locker = new ethers.Contract(lockerAddress, lockerAbi, provider);

module.exports = {
    getUsers: async function (fullsync=false) {
        // get all staked events in batches of 100000 blocks
        var stakedEvents = [];
        var currentBlock = await provider.getBlockNumber();
        if(fullsync) { cache.blockHeight = 14320609; cache.userBase = {}; cache.userDelegation = {}; cache.userAdjusted = {}; }
        var startBlock = cache.blockHeight;
        while(startBlock < currentBlock){
            endBlock = startBlock + 100000;
            if(endBlock > currentBlock){
                endBlock = currentBlock;
            }
            console.log("getting events from " + startBlock + " to " + endBlock);
            var events = await locker.queryFilter(locker.filters.Staked(),startBlock,endBlock);
            stakedEvents = stakedEvents.concat(events);
            startBlock = endBlock;
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
    getLockedBalances: async function () {
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

        addressList = Object.keys(cache.userBase);
        balances = [];
        for(var i=0; i < addressList.length; i++) {
            console.log("fetching balances for "+(i+1000 > addressList.length ? addressList.length : i+1000)+" of "+addressList.length)
            calls = [];
            while(calls.length < 1000 && i < addressList.length) {
                calls.push(lockerMulti.balanceAtEpochOf(currentEpoch, addressList[i]));
                i++;
            }        
            balances = balances.concat(await callProvider.all(calls));
            i--;
        }
        totalVlCVX = 0;
        for(var i=0; i < addressList.length; i++) {
            cache.userBase[addressList[i]] = balances[i].toString();
            totalVlCVX += Number(ethers.utils.formatUnits(balances[i],18));
        }
        console.log("Total vlCVX: "+totalVlCVX);
        fs.writeFileSync('./cache.json', JSON.stringify(cache));
        console.log("Balances cache updated");
        return cache.userBase;
    },
    getDelegations: async function () {
        userList = Object.keys(cache.userBase);
        i = 0;
        delegations = [];
        while(i <= userList.length-500) {
            console.log("fetching delegations for "+(i+500 > userList.length ? userList.length : i+500)+" of "+userList.length)
            call = await fetch("https://api.thegraph.com/subgraphs/name/snapshot-labs/snapshot", {
                "headers": {
                  "accept": "application/json, multipart/mixed",
                  "content-type": "application/json",
                  "pragma": "no-cache",
                },
                "body": "{\"query\":\"{\\n  delegations(where: {delegator_in: "+addslashes(JSON.stringify(userList.slice(i, i+500)))+", space_in: [\\\"\\\", \\\"cvx.eth\\\"]}, first: 1000) {\\n    delegator\\n    space\\n    delegate\\n  }\\n}\"}",
                "method": "POST"
              });
            response = await call.json();
            delegations = delegations.concat(response.data.delegations);
            i += 500;
        }
        if(i < userList.length) {
            console.log("fetching delegations for "+(i+500 > userList.length ? userList.length : i+500)+" of "+userList.length)
            call = await fetch("https://api.thegraph.com/subgraphs/name/snapshot-labs/snapshot", {
                "headers": {
                  "accept": "application/json, multipart/mixed",
                  "content-type": "application/json",
                  "pragma": "no-cache",
                },
                "body": "{\"query\":\"{\\n  delegations(where: {delegator_in: "+addslashes(JSON.stringify(userList.slice(i, userList.length)))+", space_in: [\\\"\\\", \\\"cvx.eth\\\"]}, first: 1000) {\\n    delegator\\n    space\\n    delegate\\n  }\\n}\"}",
                "method": "POST"
              });
            response = await call.json();
            delegations = delegations.concat(response.data.delegations);
        }
        userDelegation = {};
        for(var i=0; i < delegations.length; i++) {
            if(userDelegation[ethers.utils.getAddress(delegations[i].delegator)] == undefined) { 
                userDelegation[ethers.utils.getAddress(delegations[i].delegator)] = ethers.utils.getAddress(delegations[i].delegate);
            } else if(delegations[i].space == "cvx.eth") {
                userDelegation[ethers.utils.getAddress(delegations[i].delegator)] = ethers.utils.getAddress(delegations[i].delegate);
            }

        }
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
	createTree: async function (userBase, userAdjusted, userDelegation) {
        var elements = [];
        userlist = Object.keys(userBase);
        for(user in userBase){
            // abi encode packed user, delegate, base amount, adjustment
            //console.log("adding "+user+" to tree")
            elements.push(ethers.utils.solidityKeccak256(["address","address","uint256","int256"],[user,userDelegation[user],ethers.BigNumber.from(userBase[user]),ethers.BigNumber.from(userAdjusted[user])]));
        }

        const merkleTree = new MerkleTree(elements, keccak256, { sortPairs: true })
        const root = merkleTree.getRoot()

        var compiledProofs = {root: "0x"+bufToHex(root),blockHeight:1,users:{}};
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
        fs.writeFileSync('./'+cache.blockHeight+'.json', JSON.stringify(compiledProofs));
        console.log("Merkle tree written to file "+cache.blockHeight+".json");
        return compiledProofs;
    }
}