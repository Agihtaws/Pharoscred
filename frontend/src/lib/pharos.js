import { JsonRpcProvider, Contract, isAddress, getAddress, formatUnits } from "ethers";

const env = import.meta.env;

export const CONFIG = {
  contract: env.VITE_CONTRACT_ADDRESS || "0x3504943DA2bb76503FE3790EBf14F9459cdCFf4B",
  rpc: env.VITE_RPC_URL || "https://atlantic.dplabs-internal.com",
  explorer: env.VITE_EXPLORER_URL || "https://atlantic.pharosscan.xyz",
  chainId: 688689,
  usdcDecimals: 6,
  demoAgents: (
    env.VITE_DEMO_AGENTS ||
    "0x16fe7e28314162b463dE747F61F7173D8a4c9f73,0x5A651a15692F2cA5E61d14376245CfEB7DDC9b6a"
  )
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean),
};

const ABI = [
  "function getScore(address) view returns (uint256)",
  "function getStats(address) view returns (bool registered, string label, uint64 total, uint64 successful, uint64 distinctPartners, uint256 volume)",
];

let _provider;
function provider() {
  if (!_provider) _provider = new JsonRpcProvider(CONFIG.rpc);
  return _provider;
}
function contract() {
  return new Contract(CONFIG.contract, ABI, provider());
}

export { isAddress, getAddress };

export function shorten(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Mirrors AgentCreditLedger.getScore exactly (integer math, basis points).
 * Used to decompose the headline score into its three on-chain factors.
 */
export function decompose({ total, successful, distinctPartners }) {
  if (total === 0) return { successRate: 0, activity: 0, breadth: 0, score: 0 };
  const successRate = Math.floor((successful * 10000) / total);
  const activity = total >= 50 ? 10000 : Math.floor((total * 10000) / 50);
  const breadth = distinctPartners >= 10 ? 10000 : Math.floor((distinctPartners * 10000) / 10);
  const score = Math.floor((Math.floor((successRate * activity) / 10000) * breadth) / 10000);
  return { successRate, activity, breadth, score };
}

export async function fetchAgent(addressRaw) {
  const address = getAddress(addressRaw);
  const c = contract();
  const [scoreBn, stats] = await Promise.all([c.getScore(address), c.getStats(address)]);
  const total = Number(stats.total);
  const successful = Number(stats.successful);
  const distinctPartners = Number(stats.distinctPartners);
  const volume = stats.volume; // bigint
  return {
    address,
    registered: stats.registered,
    label: stats.label,
    total,
    successful,
    distinctPartners,
    volume,
    volumeUsdc: formatUnits(volume, CONFIG.usdcDecimals),
    score: Number(scoreBn),
    factors: decompose({ total, successful, distinctPartners }),
  };
}

export async function fetchLeaderboard(addresses) {
  const valid = addresses.filter((a) => isAddress(a)).map((a) => getAddress(a));
  const rows = await Promise.all(
    valid.map(async (address) => {
      try {
        return await fetchAgent(address);
      } catch {
        return { address, registered: false, label: "", total: 0, successful: 0, distinctPartners: 0, volume: 0n, volumeUsdc: "0", score: 0, factors: decompose({ total: 0, successful: 0, distinctPartners: 0 }) };
      }
    })
  );
  rows.sort((a, b) => b.score - a.score);
  return rows.map((r, i) => ({ ...r, rank: i + 1 }));
}

/**
 * Anchors the displayed data to chain state: returns the latest block number +
 * state root and the contract's account/storage hashes via eth_getProof.
 * This is the lightweight, in-browser counterpart to the verify_score tool's
 * full per-slot Merkle proof.
 */
export async function fetchAnchor() {
  const p = provider();
  const [block, proof] = await Promise.all([
    p.getBlock("latest"),
    p.send("eth_getProof", [CONFIG.contract, [], "latest"]),
  ]);
  return {
    blockNumber: Number(block.number),
    stateRoot: block.stateRoot,
    storageHash: proof.storageHash,
    codeHash: proof.codeHash,
  };
}