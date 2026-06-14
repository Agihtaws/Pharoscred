import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ethers } from "ethers";
import { getWallet } from "../chain.js";
import { signSettlement } from "../eip712.js";


export function registerSignSettlementTool(server: McpServer): void {
  server.registerTool(
    "sign_settlement",
    {
      title: "Sign a settlement",
      description:
        "Produce a demo agent's EIP-712 signature over a settlement (interactionId, payer, " +
        "provider, amount, success). Returns the signature to pass to submit_settlement.",
      inputSchema: {
        account: z.enum(["payer", "provider"]).describe("Which demo agent signs"),
        interactionId: z.string().describe("32-byte hex id (0x + 64 hex chars)"),
        payer: z.string().describe("Payer agent address"),
        provider: z.string().describe("Provider agent address"),
        amount: z.string().describe("Settled value in base units (uint256)"),
        success: z.boolean().describe("Whether the interaction succeeded"),
      },
    },
    async ({ account, interactionId, payer, provider, amount, success }) => {
      try {
        if (!ethers.isHexString(interactionId, 32))
          throw new Error("interactionId must be a 32-byte hex string");
        if (!ethers.isAddress(payer)) throw new Error(`Invalid payer address: ${payer}`);
        if (!ethers.isAddress(provider)) throw new Error(`Invalid provider address: ${provider}`);

        const wallet = getWallet(account);
        const signature = await signSettlement(wallet, {
          interactionId,
          payer: ethers.getAddress(payer),
          provider: ethers.getAddress(provider),
          amount: BigInt(amount),
          success,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { account, signer: await wallet.getAddress(), signature },
                null,
                2
              ),
            },
          ],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: `sign_settlement failed: ${message}` }],
        };
      }
    }
  );
}