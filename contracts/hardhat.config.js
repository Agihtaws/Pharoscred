require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Deployer / agent key. Keep the real value in .env, never in code.
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
// Defaults to the public Atlantic endpoint; override in .env if you use ZAN.
const PHAROS_RPC_URL =
  process.env.PHAROS_RPC_URL || "https://atlantic.dplabs-internal.com";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      // Pharos is EVM-equivalent. "paris" is the safe default (no PUSH0 / no
      // transient-storage opcodes), so a deploy can't fail on an unsupported
      // opcode. Bump to "cancun" later if you confirm Pharos supports it.
      evmVersion: "paris",
    },
  },

  networks: {
    pharosAtlantic: {
      url: PHAROS_RPC_URL,
      chainId: 688689,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },

  // IMPORTANT: Pharos is NOT an Etherscan-operated chain, so the Etherscan V2
  // single API key does not apply here. Verification goes through SocialScan
  // via this customChains override, and the apiKey is just a non-empty
  // placeholder string (no real Etherscan key needed).
  etherscan: {
    apiKey: {
      pharosAtlantic: "socialscan",
    },
    customChains: [
      {
        network: "pharosAtlantic",
        chainId: 688689,
        urls: {
          apiURL:
            "https://api.socialscan.io/pharos-atlantic-testnet/v1/explorer/command_api/contract",
          browserURL: "https://atlantic.pharosscan.xyz/",
        },
      },
    ],
  },

  // Silence the Sourcify prompt; SocialScan is our verifier of record.
  sourcify: {
    enabled: false,
  },
};