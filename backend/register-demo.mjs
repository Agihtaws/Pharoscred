// Registers both demo agents on-chain (run once; "already registered" on re-run is harmless).
// Live:  MCP_URL=https://pharoscred.onrender.com/mcp node register-demo.mjs
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.env.MCP_URL || "http://localhost:3000/mcp";
const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
const client = new Client({ name: "register-demo", version: "1.0.0" });
await client.connect(transport);

for (const [account, label] of [
  ["payer", "Demo Payer Agent"],
  ["provider", "Demo Provider Agent"],
]) {
  const res = await client.callTool({ name: "register_agent", arguments: { account, label } });
  console.log(`\n--- register ${account} ---`);
  console.log(res.content[0].text);
}

await client.close();
