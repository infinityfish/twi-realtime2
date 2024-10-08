import { NextApiRequest } from 'next';
import { NextResponse } from 'next/server';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { parse } from 'url';
import { handleWebSocketConnection } from '../../../lib/websocketHandler';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('Missing OpenAI API key. Please set it in the .env.local file.');
  process.exit(1);
}

const wss = new WebSocketServer({ noServer: true });

const httpServer = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket server is running');
});

httpServer.on('upgrade', (request, socket, head) => {
  const { pathname } = parse(request.url || '', true);

  if (pathname === '/api/media-stream') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on('connection', (ws, request) => {
  handleWebSocketConnection(ws, request as NextApiRequest);
});

const port = process.env.WS_PORT || 3001;
httpServer.listen(port, () => {
  console.log(`WebSocket server is running on port ${port}`);
});

export async function GET() {
  return new NextResponse('WebSocket server is running', { status: 200 });
}
