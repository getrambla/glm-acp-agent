import { AgentSideConnection } from "@agentclientprotocol/sdk";
import { type GlmAcpAgentOptions } from "./agent.js";
/**
 * Sets up the ACP stdio connection and starts the agent.
 *
 * Uses `ndJsonStream` for newline-delimited JSON transport over stdin/stdout,
 * as specified in the ACP SDK documentation.
 */
export declare function startConnection(agentOptions?: GlmAcpAgentOptions): AgentSideConnection;
//# sourceMappingURL=connection.d.ts.map