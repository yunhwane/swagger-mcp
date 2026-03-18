import { type IncomingMessage, type ServerResponse } from 'http';
import { randomUUID } from 'crypto';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './server';

const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function isHostAllowed(req: IncomingMessage): boolean {
  const host = req.headers.host;
  if (!host) return false;
  // Strip port if present
  const hostname = host.replace(/:\d+$/, '');
  return ALLOWED_HOSTS.has(hostname);
}

function sendJsonError(res: ServerResponse, status: number, error: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error }));
}

function getSessionTransport(
  sessions: Map<string, StreamableHTTPServerTransport>,
  sessionId: string | undefined,
): StreamableHTTPServerTransport | null {
  if (!sessionId) return null;
  return sessions.get(sessionId) ?? null;
}

export function createHttpRequestHandler(): (
  req: IncomingMessage,
  res: ServerResponse,
) => void {
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  return async (req: IncomingMessage, res: ServerResponse) => {
    // DNS rebinding protection
    if (!isHostAllowed(req)) {
      sendJsonError(res, 403, 'Forbidden: invalid Host header');
      return;
    }

    // Only handle /mcp path
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    if (url.pathname !== '/mcp') {
      sendJsonError(res, 404, 'Not Found');
      return;
    }

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (req.method === 'POST') {
      // Read body
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(chunk as Buffer);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());

      // Check if this is an initialize request
      const isInit = Array.isArray(body)
        ? body.some((msg: { method?: string }) => msg.method === 'initialize')
        : body.method === 'initialize';

      if (isInit) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
        });

        const server = await createMcpServer();
        await server.connect(transport);

        transport.onclose = () => {
          if (transport.sessionId) {
            sessions.delete(transport.sessionId);
          }
        };

        await transport.handleRequest(req, res, body);

        if (transport.sessionId) {
          sessions.set(transport.sessionId, transport);
        }
        return;
      }

      // Non-init request: look up existing session
      const transport = getSessionTransport(sessions, sessionId);
      if (!transport) {
        sendJsonError(res, 400, 'Bad Request: missing or invalid session');
        return;
      }
      await transport.handleRequest(req, res, body);
      return;
    }

    if (req.method === 'GET') {
      const transport = getSessionTransport(sessions, sessionId);
      if (!transport) {
        sendJsonError(res, 400, 'Bad Request: missing or invalid session');
        return;
      }
      await transport.handleRequest(req, res);
      return;
    }

    if (req.method === 'DELETE') {
      const transport = getSessionTransport(sessions, sessionId);
      if (!transport) {
        sendJsonError(res, 400, 'Bad Request: missing or invalid session');
        return;
      }
      await transport.handleRequest(req, res);
      sessions.delete(sessionId!);
      return;
    }

    sendJsonError(res, 405, 'Method Not Allowed');
  };
}
