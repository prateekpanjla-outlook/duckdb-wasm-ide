// Bundle all SDK modules that app-bridge.js and the landing page need
// These replace the esm.sh CDN imports

// All schemas + types (used by app-bridge.js)
export * from "@modelcontextprotocol/sdk/types.js";

// Protocol + mergeCapabilities (used by app-bridge.js)
export * from "@modelcontextprotocol/sdk/shared/protocol.js";

// Client + transport (used by landing page)
export { Client } from "@modelcontextprotocol/sdk/client/index.js";
export { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
