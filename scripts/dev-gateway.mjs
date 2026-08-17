import { WebSocketServer } from 'ws';
import { createGatewaySnapshot, nextGatewayEventId } from './gateway-fixture.mjs';

const port = Number(process.env.AHT_GATEWAY_PORT ?? 8787);
const dropAfterMs = Number(process.env.AHT_GATEWAY_DROP_AFTER_MS ?? 0);
const server = new WebSocketServer({ host: '127.0.0.1', port });
let snapshot = createGatewaySnapshot();
const history = [];

function send(socket, message) {
  if (socket.readyState === 1) socket.send(JSON.stringify({ protocol: 'aht.gateway.v1', ...message }));
}

function sendSnapshot(socket) {
  send(socket, { type: 'snapshot', event_id: snapshot.event_id, snapshot });
}

function broadcast(message) {
  server.clients.forEach((client) => send(client, message));
}

function rememberEvent(event) {
  history.push(event);
  if (history.length > 20) history.shift();
}

server.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: 'error', code: 'invalid_json', message: 'reference Gateway 收到非法 JSON', retryable: false });
      return;
    }

    if (message.type === 'hello') {
      send(socket, { type: 'hello_ack', connection_id: `ref-${Date.now()}`, resume_supported: true });
      const resumeIndex = history.findIndex((item) => item.event_id === message.resume_after);
      if (typeof message.resume_after === 'string' && resumeIndex >= 0) {
        history.slice(resumeIndex + 1).forEach((item) => send(socket, item));
      } else {
        sendSnapshot(socket);
      }
      return;
    }

    if (message.type !== 'command') {
      send(socket, { type: 'error', code: 'unsupported_command', message: 'reference Gateway 只处理 hello/command', retryable: false });
      return;
    }

    const target = snapshot.needs_you.find((item) => item.id === message.target?.needs_you_id);
    const allowed = target && target.agent_id === message.target?.agent_id
      && ['approve', 'reject', 'defer'].includes(message.command);
    if (!allowed) {
      send(socket, { type: 'command_ack', command_id: message.command_id, status: 'rejected', reason: 'invalid_target' });
      return;
    }

    send(socket, { type: 'command_ack', command_id: message.command_id, status: 'accepted' });
    const status = message.command === 'approve' ? 'approved' : message.command === 'reject' ? 'rejected' : 'deferred';
    const eventId = nextGatewayEventId();
    const generatedAt = new Date().toISOString();
    snapshot = {
      ...snapshot,
      revision: snapshot.revision + 1,
      event_id: eventId,
      generated_at: generatedAt,
      needs_you: snapshot.needs_you.map((item) => item.id === target.id ? { ...item, status } : item),
    };
    const eventMessage = {
      type: 'event', event_id: eventId, revision: snapshot.revision, generated_at: generatedAt,
      event: { type: 'needs_you_resolved', needs_you_id: target.id, status },
    };
    rememberEvent(eventMessage);
    broadcast(eventMessage);
  });
});

server.on('listening', () => {
  console.log(`AHT reference Gateway listening on ws://127.0.0.1:${port}`);
  if (dropAfterMs > 0) {
    setTimeout(() => {
      console.log('AHT reference Gateway dropping clients for reconnect QA');
      server.clients.forEach((client) => client.close(1001, 'reconnect QA'));
    }, dropAfterMs);
  }
});

function shutdown() {
  server.clients.forEach((client) => client.close(1001, 'reference Gateway stopped'));
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
