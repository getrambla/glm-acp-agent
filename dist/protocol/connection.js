import { Readable, Writable } from "node:stream";
import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk";
import { GlmAcpAgent } from "./agent.js";
/**
 * Sets up the ACP stdio connection and starts the agent.
 *
 * Uses `ndJsonStream` for newline-delimited JSON transport over stdin/stdout,
 * as specified in the ACP SDK documentation.
 */
export function startConnection(agentOptions = {}) {
    // Convert Node.js streams to Web Streams API
    const output = Writable.toWeb(process.stdout);
    const input = Readable.toWeb(process.stdin);
    const stream = ndJsonStream(output, input);
    const connection = new AgentSideConnection((conn) => new GlmAcpAgent(conn, agentOptions), stream);
    return connection;
}
//# sourceMappingURL=connection.js.map