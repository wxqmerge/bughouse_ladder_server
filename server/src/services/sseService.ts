import { Request, Response } from 'express';

interface SSEClient {
  response: Response;
  lastEventId: string;
}

let clients: SSEClient[] = [];
let eventCounter = 0;

export function addSSEClient(res: Response): void {
  const client: SSEClient = { response, lastEventId: '0' };
  clients.push(client);
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.write(':\n\n'); // Initial comment to keep connection open
  
  // Handle client disconnect
  res.on('close', () => {
    clients = clients.filter(c => c.response !== res);
  });
}

export function broadcastSSEEvent(event: string, data: unknown, filterClientId?: string): void {
  eventCounter++;
  const id = String(eventCounter);
  const payload = JSON.stringify(data);
  const message = `id: ${id}\nevent: ${event}\ndata: ${payload}\n\n`;
  
  const activeClients: SSEClient[] = [];
  
  for (const client of clients) {
    if (filterClientId && client.response.locals?.clientId !== filterClientId) {
      // Skip the client that made the change (they already have their data)
      continue;
    }
    
    try {
      const retryId = client.lastEventId ? `\nretry: 3000` : '';
      const lastId = client.lastEventId ? `\nid: ${client.lastEventId}` : '';
      
      // If client disconnected, remove them
      if (client.response.writableEnded) {
        continue;
      }
      
      client.response.write(message);
      client.lastEventId = id;
      activeClients.push(client);
    } catch {
      // Client disconnected, skip
    }
  }
  
  clients = activeClients;
}

export function getSSEClientCount(): number {
  return clients.length;
}

export function stopSSEClient(res: Response): void {
  clients = clients.filter(c => c.response !== res);
  res.end();
}
