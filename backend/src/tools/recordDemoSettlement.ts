import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ethers } from "ethers";
import { randomUUID } from "node:crypto";
import { getWallet, getWriteContract } from "../chain.js";
import { signSettlement } from "../eip712.js";
import { config } from "../config.js";

/** Maps the contract's custom errors to readable explanations. */
function explain(message: string): string {
  if (message.includes("InvalidPayerSignature")) return "The payer signature is invalid.";
  if (message.includes("InvalidProviderSignature")) return "The provider signature is invalid.";
  if (message.includes("InteractionAlreadyUsed")) return "This interactionId has already been recorded.";
  if (message.includes("NotRegistered")) return "Both demo agents must be registered first (run register_agent).";
  if (message.includes("SelfDealing")) return "Payer and provider cannot be the same address.";
  return message;
}


export function registerRecordDemoSettlementTool(server: McpServer): void {
  server.registerTool(
    "record_demo_settlement",
    {
      title: "Record a demo settlement",
      description:
        "Record a completed interaction between the two demo agents (payer and provider). " +
        "The server co-signs as both parties and submits on-chain, updating both scores. " +
        "Use this for the natural-language demo.",
      inputSchema: {
        success: z.boolean().describe("Did the interaction complete successfully?"),
        amount: z
          .string()
          .default("0")
          .describe("Settled value in base units (optional, default 0)"),
        interactionId: z
          .string()
          .optional()
          .describe("Optional 32-byte hex id; auto-generated if omitted"),
      },
    },
    async ({ success, amount, interactionId }) => {
      try {
        const payerWallet = getWallet("payer");
        const providerWallet = getWallet("provider");
        const payer = await payerWallet.getAddress();
        const provider = await providerWallet.getAddress();

        const id = interactionId ?? ethers.id(randomUUID());
        if (!ethers.isHexString(id, 32))
          throw new Error("interactionId must be a 32-byte hex string");

        const fields = {
          interactionId: id,
          payer,
          provider,
          amount: BigInt(amount ?? "0"),
          success,
        };

        const payerSig = await signSettlement(payerWallet, fields);
        const providerSig = await signSettlement(providerWallet, fields);

        const contract = getWriteContract("payer");
        const args = [id, payer, provider, fields.amount, success, payerSig, providerSig] as const;
        const gasEstimate = await contract.recordSettlement.estimateGas(...args);
        const gasLimit = (gasEstimate * 12n) / 10n;
        const tx = await contract.recordSettlement(...args, { gasLimit });
        const receipt = await tx.wait();

        const result = {
          interactionId: id,
          payer,
          provider,
          amount,
          success,
          txHash: tx.hash,
          blockNumber: receipt?.blockNumber,
          status: receipt?.status === 1 ? "success" : "failed",
          explorer: `${config.explorerUrl}/tx/${tx.hash}`,
          note: "Both agents' scores were updated. Call get_score on either address to see the change.",
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [
            { type: "text" as const, text: `record_demo_settlement failed: ${explain(message)}` },
          ],
        };
      }
    }
  );
}