const { MerkleTree } = require('merkletreejs')
const keccak256 = require('keccak256')
const { ethers } = require("ethers");
const fs = require('fs');


function bufToHex(buffer) { // buffer is an ArrayBuffer
    return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('')
}

module.exports = {
	createTree: async function (userData, userDelegation) {
        var elements = [];
        userlist = Object.keys(userData);
        for(user in userData){
            // abi encode packed user, delegate, amount
            elements.push(ethers.utils.solidityKeccak256(["address","address","uint256"],[user,userDelegation[user],userData[user]]));
        }

        const merkleTree = new MerkleTree(elements, keccak256, { sortPairs: true })
        const root = merkleTree.getRoot()

        var compiledProofs = {root: "0x"+bufToHex(root),blockHeight:1,users:{}};
        for(var i=0; i < elements.length; i++){
            var proofbytes = merkleTree.getProof(elements[i]);
            var proofHex = proofbytes.map(e => "0x"+e.data.toString('hex'));
            var address = userlist[i];
            var delegate = userDelegation[userlist[i]];
            var amount = userData[userlist[i]];

            if(!merkleTree.verify(proofbytes,elements[i],root)) {
                console.error("proof verification failed at index " + i);
            }

            if(compiledProofs.users[address] != undefined){
                console.error("address already exists");
            }
            
            compiledProofs.users[address] = {};
            compiledProofs.users[address]["leaf"] = elements[i].toString('hex');
            compiledProofs.users[address]["proof"] = proofHex;
            compiledProofs.users[address]["amount"] = amount;
            compiledProofs.users[address]["delegate"] = delegate;

        }
        return compiledProofs;
    }
}