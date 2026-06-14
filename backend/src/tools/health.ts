import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { provider } from "../chain.js";
import { config } from "../config.js";


export function registerHealthTool(server: McpServer): void {
  server.registerTool(
    "health",
    {
      title: "Health check",
      description:
        "Check that the PharosCred server can reach the Pharos RPC, confirm the chain id, " +
        "read the latest block, and verify the AgentCreditLedger contract is deployed at the " +
        "configured address. Takes no arguments.",
      inputSchema: {},
    },
    async () => {
      try {
        const [blockNumber, net, code] = await Promise.all([
          provider.getBlockNumber(),
          provider.getNetwork(),
          provider.getCode(config.contractAddress),
        ]);

        const contractDeployed = code !== "0x";
        const chainId = Number(net.chainId);
        const healthy = contractDeployed && chainId === config.chainId;

        const result = {
          status: healthy ? "healthy" : "degraded",
          rpcUrl: config.rpcUrl,
          chainId,
          expectedChainId: config.chainId,
          blockNumber,
          contractAddress: config.contractAddress,
          contractDeployed,
        };

        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Health check failed: ${message}`,
            },
          ],
        };
      }
    }
  );
}