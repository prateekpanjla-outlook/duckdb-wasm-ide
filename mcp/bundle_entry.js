// Entry point for esbuild — bundles MCP SDK + ext-apps for browser use
// Exports under the names that the landing page expects

export { Client } from "@modelcontextprotocol/sdk/client/index.js";
export { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
export { App as AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps";
