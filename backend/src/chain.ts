import { ethers } from "ethers";
import { config } from "./config.js";
import { AGENT_CREDIT_LEDGER_ABI } from "./abi.js";


const network = new ethers.Network("pharos-atlantic", config.chainId);

export const provider = new ethers.JsonRpcProvider(config.rpcUrl, network, {
  staticNetwork: network,
});

/** A read-only contract instance bound to the deployed AgentCreditLedger. */
export function getReadContract(): ethers.Contract {
  return new ethers.Contract(config.contractAddress, AGENT_CREDIT_LEDGER_ABI, provider);
}

export type DemoAccount = "payer" | "provider";

/** Returns a wallet (connected to the provider) for one of the demo agents. */
export function getWallet(account: DemoAccount): ethers.Wallet {
  const key = account === "payer" ? config.demoPayerKey : config.demoProviderKey;
  if (!key) {
    throw new Error(
      `No private key configured for demo "${account}". ` +
        `Set DEMO_${account.toUpperCase()}_PRIVATE_KEY in your .env (funded with testnet PHRS).`
    );
  }
  return new ethers.Wallet(key, provider);
}

/** A write-capable contract instance signed by one of the demo agents. */
export function getWriteContract(account: DemoAccount): ethers.Contract {
  return new ethers.Contract(config.contractAddress, AGENT_CREDIT_LEDGER_ABI, getWallet(account));
}

/** Minimal ERC-20 interface for balance, allowance, and approval. */
export const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

/** ERC-20 contract bound to a signer (for approvals) or the provider (for reads). */
export function getErc20(
  token: string,
  runner: ethers.Wallet | ethers.JsonRpcProvider = provider
): ethers.Contract {
  return new ethers.Contract(token, ERC20_ABI, runner);
}

/** MultiCall3 aggregate3 for batched reads. */
export const MULTICALL3_ABI = [
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
];

export function getMulticall(): ethers.Contract {
  return new ethers.Contract(config.multicall3Address, MULTICALL3_ABI, provider);
}