import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ethers } from "ethers";
import { getWriteContract } from "../chain.js";
import { config } from "../config.js";

/** Maps the contract's custom errors to readable explanations. */
function explain(message: string): string {
  if (message.includes("InvalidPayerSignature")) return "The payer signature is invalid.";
  if (message.includes("InvalidProviderSignature")) return "The provider signature is invalid.";
  if (message.includes("InteractionAlreadyUsed")) return "This interactionId has already been recorded.";
  if (message.includes("NotRegistered")) return "One of the parties is not registered.";
  if (message.includes("SelfDealing")) return "Payer and provider cannot be the same address.";
  return message;
}

export function registerSubmitSettlementTool(server: McpServer): void {
  server.registerTool(
    "submit_settlement",
    {
      title: "Submit a settlement",
      description:
        "Record a mutually-signed settlement on-chain using both parties' EIP-712 signatures. " +
        "Updates both agents' scores. Write transaction relayed by the payer wallet.",
      inputSchema: {
        interactionId: z.string().describe("32-byte hex id used in the signatures"),
        payer: z.string().describe("Payer agent address"),
        provider: z.string().describe("Provider agent address"),
        amount: z.string().describe("Settled value in base units (uint256)"),
        success: z.boolean().describe("Whether the interaction succeeded"),
        payerSig: z.string().describe("Payer's EIP-712 signature"),
        providerSig: z.string().describe("Provider's EIP-712 signature"),
      },
    },
    async ({ interactionId, payer, provider, amount, success, payerSig, providerSig }) => {
      try {
        const contract = getWriteContract("payer");
        const args = [
          interactionId,
          ethers.getAddress(payer),
          ethers.getAddress(provider),
          BigInt(amount),
          success,
          payerSig,
          providerSig,
        ] as const;

        const gasEstimate = await contract.recordSettlement.estimateGas(...args);
        const gasLimit = (gasEstimate * 12n) / 10n;
        const tx = await contract.recordSettlement(...args, { gasLimit });
        const receipt = await tx.wait();

        const result = {
          interactionId,
          payer: ethers.getAddress(payer),
          provider: ethers.getAddress(provider),
          amount,
          success,
          txHash: tx.hash,
          blockNumber: receipt?.blockNumber,
          status: receipt?.status === 1 ? "success" : "failed",
          explorer: `${config.explorerUrl}/tx/${tx.hash}`,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: `submit_settlement failed: ${explain(message)}` }],
        };
      }
    }
  );
}