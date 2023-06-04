import { HardhatUserConfig } from "hardhat/config";

import "@matterlabs/hardhat-zksync-deploy";
import "@matterlabs/hardhat-zksync-solc";
var jsonfile = require('jsonfile');
var api_keys = jsonfile.readFileSync('./.api_keys');

const config: HardhatUserConfig = {
  zksolc: {
    version: "1.3.10",
    compilerSource: "binary",
    settings: {},
  },
  defaultNetwork: "zkSync",
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
    zkSync: {
      url: api_keys.provider_zksync,
      ethNetwork: "mainnet",
      zksync: true,
    },
  },
  solidity: {
    version: "0.8.10",
  },
  // OTHER SETTINGS...
};

export default config;
