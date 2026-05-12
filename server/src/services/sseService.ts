import { Request, Response } from 'express';

interface SSEClient {
  res: Response;
  lastEventId: string;
}

let clients: SSEClient[] = [];
let eventCounter = 0;
let heartbeatInterval: NodeJS.Timeout | null = null;

export function addSSEClient(res: Response): void {
  const client: SSEClient = { res, lastEventId: '0' };
  clients.push(client);
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.write(':\n\n'); // Initial comment to keep connection open
  
  // Handle client disconnect
  res.on('close', () => {
    clients = clients.filter(c => c.res !== res);
  });
}

export function startHeartbeat(intervalMs: number = 30000): void {
  if (heartbeatInterval) return;
  heartbeatInterval = setInterval(() => {
    for (const client of clients) {
      try {
        if (!client.res.writableEnded) {
          client.res.write(':\n\n');
        }
      } catch (err) {
        // Ignore
      }
    }
  }, intervalMs);
}

export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

export function broadcastSSEEvent(event: string, data: unknown, filterClientId?: string): void {
  try {
    eventCounter++;
    const id = String(eventCounter);
    const payload = JSON.stringify(data);
    const message = `id: ${id}\nevent: ${event}\ndata: ${payload}\n\n`;

    const activeClients: SSEClient[] = [];

    for (const client of clients) {
      if (filterClientId && client.res.locals?.clientId !== filterClientId) {
        // Skip the client that made the change (they already have their data)
        continue;
      }

      try {
        // If client disconnected, remove them
        if (client.res.writableEnded) {
          continue;
        }

        client.res.write(message);
        client.lastEventId = id;
        activeClients.push(client);
      } catch {
        // Client disconnected, skip
      }
    }

    clients = activeClients;
  } catch (error) {
    console.error('[SSE] Error broadcasting event:', error);
  }
}

export function getSSEClientCount(): number {
  return clients.length;
}

export function stopSSEClient(res: Response): void {
  clients = clients.filter(c => c.res !== res);
  res.end();
}
