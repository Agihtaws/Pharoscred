// Smoke test: lists the skill's tools and runs a few read queries.
// Live:  MCP_URL=https://pharoscred.onrender.com/mcp node test-client.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// Any agent address you want to query (default: the demo payer).
const SAMPLE_AGENT = "0x16fe7e28314162b463dE747F61F7173D8a4c9f73";

const MCP_URL = process.env.MCP_URL || "http://localhost:3000/mcp";
const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
const client = new Client({ name: "test-client", version: "1.0.0" });
await client.connect(transport);

const tools = await client.listTools();
console.log("REGISTERED TOOLS:", tools.tools.map((t) => t.name));

async function call(name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  console.log(`\n--- ${name}(${JSON.stringify(args)}) ---`);
  console.log(res.content[0].text);
}

await call("health");
await call("get_stats", { agent: SAMPLE_AGENT });
await call("get_score", { agent: SAMPLE_AGENT });

await client.close();
