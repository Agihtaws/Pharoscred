import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ethers } from "ethers";
import { getMulticall } from "../chain.js";
import { AGENT_CREDIT_LEDGER_ABI } from "../abi.js";
import { config } from "../config.js";

/** Demo agents to rank when the caller doesn't supply any addresses. */
function defaultAgents(): string[] {
  const addrs: string[] = [];
  for (const key of [config.demoPayerKey, config.demoProviderKey]) {
    if (key && key.trim() !== "") {
      try {
        addrs.push(new ethers.Wallet(key).address);
      } catch {
        /* ignore malformed key */
      }
    }
  }
  return addrs;
}


export function registerLeaderboardTool(server: McpServer): void {
  server.registerTool(
    "leaderboard",
    {
      title: "Agent credit leaderboard",
      description:
        "Batch-read the PharosCred scores of multiple agents in one MultiCall3 call and return " +
        "them ranked highest-first. If no addresses are given, the built-in demo agents are ranked.",
      inputSchema: {
        agents: z
          .array(z.string())
          .optional()
          .describe(
            "Optional array of agent wallet addresses to rank. " +
              "Omit to rank the built-in demo agents."
          ),
      },
    },
    async ({ agents }) => {
      try {
        const requested = agents && agents.length > 0 ? agents : defaultAgents();
        const valid = requested.filter((a) => ethers.isAddress(a)).map((a) => ethers.getAddress(a));
        if (valid.length === 0) {
          throw new Error(
            "No valid addresses provided and no demo agents configured. " +
              "Pass an `agents` array of 0x... addresses."
          );
        }

        const iface = new ethers.Interface(AGENT_CREDIT_LEDGER_ABI as unknown as ethers.InterfaceAbi);
        const calls = valid.map((agent) => ({
          target: config.contractAddress,
          allowFailure: true,
          callData: iface.encodeFunctionData("getScore", [agent]),
        }));

        const results = await getMulticall().aggregate3.staticCall(calls);

        const rows = valid.map((agent, i) => {
          const r = results[i];
          let score: number | null = null;
          if (r.success) {
            score = Number(iface.decodeFunctionResult("getScore", r.returnData)[0]);
          }
          return { agent, score };
        });

        rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
        const ranked = rows.map((row, i) => ({
          rank: i + 1,
          agent: row.agent,
          score: row.score,
          scorePercent: row.score === null ? null : row.score / 100,
        }));

        const usedDefault = !(agents && agents.length > 0);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { leaderboard: ranked, ...(usedDefault ? { note: "Ranked the built-in demo agents (no addresses supplied)." } : {}) },
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
          content: [{ type: "text" as const, text: `leaderboard failed: ${message}` }],
        };
      }
    }
  );
}