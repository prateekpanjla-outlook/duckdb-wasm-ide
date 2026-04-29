// Bundle the 4 SDK modules that app-bridge.js and the landing page need
// These replace the esm.sh CDN imports

// For app-bridge.js internal imports:
export * as sdkTypes from "@modelcontextprotocol/sdk/types.js";
export * as sdkProtocol from "@modelcontextprotocol/sdk/shared/protocol.js";

// For landing page imports:
export { Client } from "@modelcontextprotocol/sdk/client/index.js";
export { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
