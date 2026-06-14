import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ethers } from "ethers";
import { provider, getReadContract } from "../chain.js";
import { config } from "../config.js";


const AGENTS_SLOT = 2n;
const MASK64 = (1n << 64n) - 1n;

function recordBaseSlot(agent: string): bigint {
  const key = ethers.zeroPadValue(agent, 32);
  const slot = ethers.zeroPadValue(ethers.toBeHex(AGENTS_SLOT), 32);
  return BigInt(ethers.keccak256(ethers.concat([key, slot])));
}

function slotValue(entry: { value?: string } | undefined): bigint {
  const raw = entry?.value;
  return raw && raw !== "0x" ? BigInt(raw) : 0n;
}


export function registerVerifyScoreTool(server: McpServer): void {
  server.registerTool(
    "verify_score",
    {
      title: "Verify an agent's score",
      description:
        "Produce a cryptographic proof that an agent's PharosCred record is genuine. Uses " +
        "eth_getProof against the contract's storage, anchored to a block state root. Returns " +
        "the proof, the decoded stats, and the contract-read stats for cross-checking.",
      inputSchema: {
        agent: z.string().describe("The agent's wallet address"),
      },
    },
    async ({ agent }) => {
      if (!ethers.isAddress(agent)) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: `Invalid address: ${agent}` }],
        };
      }
      try {
        const address = ethers.getAddress(agent);
        const base = recordBaseSlot(address);

        const registeredSlot = ethers.toBeHex(base, 32);
        const statsSlot = ethers.toBeHex(base + 2n, 32);
        const volumeSlot = ethers.toBeHex(base + 3n, 32);

        // Pin a block so the proof and the state root refer to the same height.
        const blockNumber = await provider.getBlockNumber();
        const blockHex = ethers.toBeHex(blockNumber);

        const proof = await provider.send("eth_getProof", [
          config.contractAddress,
          [registeredSlot, statsSlot, volumeSlot],
          blockHex,
        ]);
        const block = await provider.send("eth_getBlockByNumber", [blockHex, false]);

        // Match storage proof entries back to our slots (by key, with index fallback).
        const byKey = (slot: string) =>
          (proof.storageProof ?? []).find(
            (e: { key?: string }) =>
              e.key && BigInt(e.key) === BigInt(slot)
          );
        const registeredEntry = byKey(registeredSlot) ?? proof.storageProof?.[0];
        const statsEntry = byKey(statsSlot) ?? proof.storageProof?.[1];
        const volumeEntry = byKey(volumeSlot) ?? proof.storageProof?.[2];

        const packed = slotValue(statsEntry);
        const decodedFromProof = {
          registered: slotValue(registeredEntry) !== 0n,
          total: Number(packed & MASK64),
          successful: Number((packed >> 64n) & MASK64),
          distinctPartners: Number((packed >> 128n) & MASK64),
          volume: slotValue(volumeEntry).toString(),
        };

        // Cross-check against a direct contract read.
        const [registered, label, total, successful, distinctPartners, volume] =
          await getReadContract().getStats(address);
        const contractRead = {
          registered,
          label,
          total: Number(total),
          successful: Number(successful),
          distinctPartners: Number(distinctPartners),
          volume: volume.toString(),
        };
        const score = Number(await getReadContract().getScore(address));

        const result = {
          agent: address,
          blockNumber,
          blockHash: block?.hash,
          stateRoot: block?.stateRoot,
          contract: config.contractAddress,
          storageHash: proof.storageHash,
          score,
          decodedFromProof,
          contractRead,
          proofMatchesContract:
            decodedFromProof.total === contractRead.total &&
            decodedFromProof.successful === contractRead.successful &&
            decodedFromProof.distinctPartners === contractRead.distinctPartners,
          proof: {
            accountProof: proof.accountProof,
            storageProof: proof.storageProof,
          },
          howToVerify:
            "Verify the storageProof entries against storageHash, and the accountProof against " +
            "the block stateRoot at the contract address, using Pharos SPV. Then recompute the " +
            "score from total/successful/distinctPartners. No trust in this server is required.",
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: `verify_score failed: ${message}` }],
        };
      }
    }
  );
}