import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { config } from "./config.js";
import { registerHealthTool } from "./tools/health.js";
import { registerGetScoreTool } from "./tools/getScore.js";
import { registerGetStatsTool } from "./tools/getStats.js";
import { registerRegisterAgentTool } from "./tools/registerAgent.js";
import { registerSignSettlementTool } from "./tools/signSettlement.js";
import { registerSubmitSettlementTool } from "./tools/submitSettlement.js";
import { registerRecordDemoSettlementTool } from "./tools/recordDemoSettlement.js";
import { registerVerifyScoreTool } from "./tools/verifyScore.js";
import { registerRecordPaidSettlementTool } from "./tools/recordPaidSettlement.js";
import { registerLeaderboardTool } from "./tools/leaderboard.js";

export function createServer(): McpServer {
  const server = new McpServer({
    name: config.name,
    version: config.version,
  });

  registerHealthTool(server);
  registerGetScoreTool(server);
  registerGetStatsTool(server);
  registerRegisterAgentTool(server);
  registerSignSettlementTool(server);
  registerSubmitSettlementTool(server);
  registerRecordDemoSettlementTool(server);
  registerVerifyScoreTool(server);
  registerRecordPaidSettlementTool(server);
  registerLeaderboardTool(server);

  return server;
}