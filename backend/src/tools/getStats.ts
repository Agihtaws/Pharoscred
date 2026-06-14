import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ethers } from "ethers";
import { getReadContract } from "../chain.js";


export function registerGetStatsTool(server: McpServer): void {
  server.registerTool(
    "get_stats",
    {
      title: "Get agent credit stats",
      description:
        "Return the full on-chain record behind an agent's PharosCred score: registration, " +
        "label, total/successful/failed interactions, distinct counterparties, and settled volume.",
      inputSchema: {
        agent: z.string().describe("The agent's wallet address, e.g. 0x1234..."),
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
        const [registered, label, total, successful, distinctPartners, volume] =
          await getReadContract().getStats(address);

        const totalN = Number(total);
        const successfulN = Number(successful);
        const failedN = totalN - successfulN;

        const result = {
          agent: address,
          registered,
          label,
          total: totalN,
          successful: successfulN,
          failed: failedN,
          distinctPartners: Number(distinctPartners),
          volume: volume.toString(),
          successRate: totalN > 0 ? `${((successfulN / totalN) * 100).toFixed(1)}%` : "n/a",
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: `get_stats failed: ${message}` }],
        };
      }
    }
  );
}