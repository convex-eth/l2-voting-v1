import { HardhatUserConfig } from "hardhat/config";

import "@matterlabs/hardhat-zksync-deploy";
import "@matterlabs/hardhat-zksync-solc";
import "@matterlabs/hardhat-zksync-verify";
var jsonfile = require('jsonfile');
var api_keys = jsonfile.readFileSync('./.api_keys');

const config: HardhatUserConfig = {
  zksolc: {
    version: "1.3.10",
    compilerSource: "binary",
    settings: {},
  },
  defaultNetwork: "zksync",
  networks: {
    hardhat: {
      zksync: false,
    },
    goerli:{
      url: 'https://goerli.com/api/abcdef12345',
      zksync: false,
    },
    mainnet:{
      url: api_keys.provider_mainnet,
      zksync: false,
    },
    zksync: {
      url: api_keys.provider_zksync,
      ethNetwork: "mainnet",
      zksync: true,
      verifyURL: 'https://zksync2-mainnet-explorer.zksync.io/contract_verification'
    },
  },
  solidity: {
    version: "0.8.10",
  },
  // OTHER SETTINGS...
  etherscan: {
    apiKey: api_keys.etherscan,
  }
};

export default config;
