// Leaderboard demo: batch-read and rank agent scores via MultiCall3.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const AGENTS = [
  "0x16fe7e28314162b463dE747F61F7173D8a4c9f73", // payer
  "0x5A651a15692F2cA5E61d14376245CfEB7DDC9b6a", // provider
];

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));
const client = new Client({ name: "leaderboard", version: "1.0.0" });
await client.connect(transport);
const res = await client.callTool({ name: "leaderboard", arguments: { agents: AGENTS } });
console.log(res.content[0].text);
await client.close();
