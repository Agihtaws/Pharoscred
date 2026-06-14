import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ethers } from "ethers";
import { getReadContract } from "../chain.js";


export function registerGetScoreTool(server: McpServer): void {
  server.registerTool(
    "get_score",
    {
      title: "Get agent credit score",
      description:
        "Return the on-chain PharosCred credit score for an agent address. The score is " +
        "0 to 10000 basis points (10000 = perfect). Returns 0 if the agent has no track record yet.",
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
        const score = Number(await getReadContract().getScore(address));

        const result = {
          agent: address,
          score,
          scorePercent: score / 100,
          note:
            score === 0
              ? "A score of 0 means no successful track record yet (unregistered or no settlements)."
              : undefined,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [{ type: "text" as const, text: `get_score failed: ${message}` }],
        };
      }
    }
  );
}