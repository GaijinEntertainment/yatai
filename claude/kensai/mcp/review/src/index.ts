import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const INSTRUCTIONS = "";

const server = new McpServer({ name: "kensai", version: "0.1.0" }, { instructions: INSTRUCTIONS });

await server.connect(new StdioServerTransport());
