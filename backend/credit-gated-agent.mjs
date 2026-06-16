/**
 * PharosCred — Credit-Gated Payment Agent (consumer demo)
 * ------------------------------------------------------------------
 * A standalone agent that *consumes* the PharosCred skill. It demonstrates the
 * Skill -> Agent cascade: the agent embeds a trust POLICY, and calls the skill
 * for the on-chain credit PRIMITIVE.
 *
 * Flow:
 *   1. For each candidate provider, ask the PharosCred skill for its credit score.
 *   2. Reject anyone below the agent's credit threshold (the trust gate).
 *   3. Choose the highest-scoring qualifier.
 *   4. Settle with the chosen provider through the skill (real USDC moves).
 *   5. Re-read the score to show the payment fed back into the credit graph.
 *
 * Configure via env:
 *   MCP_URL           default http://localhost:3000/mcp  (or your Render /mcp URL)
 *   CREDIT_THRESHOLD  default 25      (minimum acceptable score, in bps)
 *   AMOUNT            default 1000000 (USDC base units; 1 USDC = 1000000)
 *   CANDIDATES        default = demo provider + a dead address (to show rejection)
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const MCP_URL = process.env.MCP_URL || "http://localhost:3000/mcp";
const THRESHOLD_BPS = Number(process.env.CREDIT_THRESHOLD ?? 25);
const AMOUNT = process.env.AMOUNT || "1000000"; // 1 USDC (6 decimals)

// The skill settles between its configured demo payer and demo provider, so the
// chosen provider must be the demo provider for the live payment to execute.
const DEMO_PROVIDER = "0x5A651a15692F2cA5E61d14376245CfEB7DDC9b6a";
const CANDIDATES = (
  process.env.CANDIDATES ||
  `${DEMO_PROVIDER},0x000000000000000000000000000000000000dead`
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const short = (a) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usdc = (base) => (Number(base) / 1e6).toString();

async function callTool(client, name, args) {
  const res = await client.callTool({ name, arguments: args });
  const text = res?.content?.[0]?.text ?? "";
  if (res?.isError) throw new Error(text || `${name} failed`);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL));
  const client = new Client({ name: "credit-gated-agent", version: "1.0.0" });
  await client.connect(transport);

  console.log("\n=== PharosCred · Credit-Gated Payment Agent ===");
  console.log(`Task   : pay ${usdc(AMOUNT)} USDC to the most creditworthy provider`);
  console.log(`Policy : minimum credit ${THRESHOLD_BPS} bps — reject anyone below\n`);

  // 1 + 2. Evaluate each candidate against the trust gate, using the skill.
  console.log(`Evaluating ${CANDIDATES.length} candidate provider(s) via PharosCred:`);
  const evaluated = [];
  for (const addr of CANDIDATES) {
    try {
      const { score } = await callTool(client, "get_score", { agent: addr });
      const qualifies = score >= THRESHOLD_BPS;
      evaluated.push({ addr, score, qualifies });
      console.log(
        `  ${short(addr)}   ${String(score).padStart(5)} bps   ` +
          (qualifies ? "✓ qualifies" : "✗ rejected (below threshold)")
      );
    } catch (e) {
      evaluated.push({ addr, score: null, qualifies: false });
      console.log(`  ${short(addr)}   ⚠ could not read score (${e.message})`);
    }
  }

  // 3. Apply policy: pick the highest-scoring qualifier.
  const qualifiers = evaluated.filter((e) => e.qualifies).sort((a, b) => b.score - a.score);
  if (qualifiers.length === 0) {
    console.log(
      `\nDecision: ABORT — no candidate meets the ${THRESHOLD_BPS} bps minimum. No funds moved.\n`
    );
    await client.close();
    return;
  }
  const chosen = qualifiers[0];
  console.log(
    `\nDecision: pay ${short(chosen.addr)} — highest qualifying credit (${chosen.score} bps).`
  );

  if (chosen.addr.toLowerCase() !== DEMO_PROVIDER.toLowerCase()) {
    console.log(
      `(Chosen provider isn't the skill's settle-able demo provider; in production the ` +
        `skill would hold a signing session for ${short(chosen.addr)}. Skipping live payment.)\n`
    );
    await client.close();
    return;
  }

  // 4. Execute the settlement through the skill — real USDC moves.
  console.log(`\nExecuting settlement (${usdc(AMOUNT)} USDC) via the skill...`);
  try {
    const r = await callTool(client, "record_paid_settlement", { amount: AMOUNT });
    if (r.status === "success") {
      console.log(`  paid ${r.amountUsdc} USDC · tx ${r.txHash} · block ${r.blockNumber}`);
    } else {
      console.log(`  settlement returned: ${JSON.stringify(r)}`);
      await client.close();
      return;
    }
  } catch (e) {
    console.log(`  settlement could not complete: ${e.message}\n`);
    await client.close();
    return;
  }

  // 5. Show the credit moved — the payment fed back into the graph.
  const after = await callTool(client, "get_score", { agent: chosen.addr });
  console.log(
    `\nResult : ${short(chosen.addr)} credit is now ${after.score} bps (was ${chosen.score}).`
  );
  console.log("The agent consumed the credit score to decide, then contributed back to it.\n");

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
