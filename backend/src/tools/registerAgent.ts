import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getWallet, getWriteContract } from "../chain.js";
import { config } from "../config.js";


export function registerRegisterAgentTool(server: McpServer): void {
  server.registerTool(
    "register_agent",
    {
      title: "Register an agent",
      description:
        "Register one of the demo agents ('payer' or 'provider') on-chain with a label. " +
        "Write transaction — the matching demo key must be funded with testnet PHRS for gas.",
      inputSchema: {
        account: z
          .enum(["payer", "provider"])
          .describe("Which demo agent to register"),
        label: z
          .string()
          .min(1)
          .describe("A human-readable label, e.g. 'Research Agent'"),
      },
    },
    async ({ account, label }) => {
      try {
        const wallet = getWallet(account);
        const address = await wallet.getAddress();
        const contract = getWriteContract(account);

        // Estimate gas and add a 20% buffer. Pharos charges by gas_limit, so a
        // tight limit can fail due to refund mechanics — the buffer avoids that.
        const gasEstimate = await contract.registerAgent.estimateGas(label);
        const gasLimit = (gasEstimate * 12n) / 10n;

        const tx = await contract.registerAgent(label, { gasLimit });
        const receipt = await tx.wait();

        const result = {
          account,
          address,
          label,
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
        const friendly = message.includes("AlreadyRegistered")
          ? `The "${account}" agent is already registered.`
          : message;
        return {
          isError: true,
          content: [{ type: "text" as const, text: `register_agent failed: ${friendly}` }],
        };
      }
    }
  );
}