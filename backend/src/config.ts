import "dotenv/config";


function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    console.warn(`[config] WARNING: ${name} is not set in the environment.`);
    return "";
  }
  return value.trim();
}

export const config = {
  // Network
  rpcUrl: process.env.PHAROS_RPC_URL?.trim() || "https://atlantic.dplabs-internal.com",
  chainId: Number(process.env.PHAROS_CHAIN_ID || 688689),
  explorerUrl: process.env.PHAROS_EXPLORER_URL?.trim() || "https://atlantic.pharosscan.xyz",

  // Deployed AgentCreditLedger address (set to your redeployed V2 address)
  contractAddress: required("CONTRACT_ADDRESS", process.env.CONTRACT_ADDRESS),

  // Canonical Pharos addresses used by the skill
  usdcAddress:
    process.env.USDC_ADDRESS?.trim() || "0xcfC8330f4BCAB529c625D12781b1C19466A9Fc8B",
  multicall3Address:
    process.env.MULTICALL3_ADDRESS?.trim() || "0xcA11bde05977b3631167028862bE2a173976CA11",

  // Demo agent keys (Pharos testnet private keys, funded with PHRS; payer also needs USDC)
  demoPayerKey: required("DEMO_PAYER_PRIVATE_KEY", process.env.DEMO_PAYER_PRIVATE_KEY),
  demoProviderKey: required("DEMO_PROVIDER_PRIVATE_KEY", process.env.DEMO_PROVIDER_PRIVATE_KEY),

  // HTTP
  port: Number(process.env.PORT || 3000),

  // Server identity
  name: "pharoscred",
  version: "0.1.0",
} as const;