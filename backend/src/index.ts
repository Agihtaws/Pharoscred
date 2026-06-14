import express, { type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "./server.js";
import { config } from "./config.js";

const app = express();
app.use(express.json());

// CORS so browser-based MCP clients and Claude's connector can reach the server.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Mcp-Session-Id, mcp-protocol-version");
  res.header("Access-Control-Expose-Headers", "Mcp-Session-Id");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

// Plain liveness endpoint (used by hosting platforms and for a quick "is it up?" check).
app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok", name: config.name, version: config.version });
});

// Active Streamable HTTP transports, keyed by MCP session id.
const transports: Record<string, StreamableHTTPServerTransport> = {};

// POST /mcp — client-to-server requests (initialization and tool calls).
app.post("/mcp", async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      // Reuse the transport for an existing session.
      transport = transports[sessionId];
    } else if (!sessionId && isInitializeRequest(req.body)) {
      // New session: build a server + transport pair.
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports[id] = transport;
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) delete transports[transport.sessionId];
      };

      const server = createServer();
      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Bad Request: no valid session id" },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    console.error("[mcp] error handling POST:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Shared handler for GET (server-to-client SSE stream) and DELETE (session teardown).
async function handleSessionRequest(req: Request, res: Response) {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session id");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
}

app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

app.listen(config.port, () => {
  console.log(`PharosCred MCP server "${config.name}" v${config.version} is running.`);
  console.log(`  MCP endpoint : http://localhost:${config.port}/mcp`);
  console.log(`  Health check : http://localhost:${config.port}/health`);
  console.log(`  Pharos RPC   : ${config.rpcUrl} (chainId ${config.chainId})`);
  console.log(`  Contract     : ${config.contractAddress || "(not set)"}`);
});