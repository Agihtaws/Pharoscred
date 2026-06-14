// One-time setup: registers both demo agents on-chain.
// Run once after funding DEMO_PAYER_PRIVATE_KEY and DEMO_PROVIDER_PRIVATE_KEY.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const transport = new StreamableHTTPClientTransport(new URL("http://localhost:3000/mcp"));
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
