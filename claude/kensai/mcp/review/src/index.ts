import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { FindingsToolset } from "./toolsets/findings/toolset.ts";
import { FsToolset } from "./toolsets/fs/toolset.ts";
import { GitToolset } from "./toolsets/git/toolset.ts";
import { SessionToolset } from "./toolsets/session/toolset.ts";

const INSTRUCTIONS = "";

const server = new McpServer({ name: "kensai", version: "0.1.0" }, { instructions: INSTRUCTIONS });

const session = new SessionToolset([new FsToolset(), new GitToolset(), new FindingsToolset()]);
session.bind(server);

await server.connect(new StdioServerTransport());
