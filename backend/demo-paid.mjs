
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PAYER = "0x16fe7e28314162b463dE747F61F7173D8a4c9f73";

const MCP_URL = process.env.MCP_URL || "http://localhost:3000/mcp";
const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
const client = new Client({ name: "demo-paid", version: "1.0.0" });
await client.connect(transport);
const call = async (n, a = {}) => (await client.callTool({ name: n, arguments: a })).content[0].text;

console.log("PAYER score BEFORE:", await call("get_score", { agent: PAYER }));
console.log("\nPaying 1 USDC provider <- payer, backing the credit record...");
console.log(await call("record_paid_settlement", { amount: "1000000" })); // 1 USDC = 1e6
console.log("\nPAYER score AFTER:", await call("get_score", { agent: PAYER }));
console.log("\nPAYER stats AFTER:", await call("get_stats", { agent: PAYER }));
await client.close();
