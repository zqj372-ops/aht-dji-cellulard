import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { createReferenceGateway } from '../../scripts/reference-gateway-contract.mjs';

let server;
let gateway;
let port;
const clients = new Set();

function createMemoryStore() {
  let savedState = null;
  return {
    load() {
      return savedState;
    },
    save(state) {
      savedState = JSON.parse(JSON.stringify(state));
    },
  };
}

function waitForOpen(socket) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 1500);
    socket.once('open', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('error', reject);
  });
}

function nextMessage(socket, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('message', onMessage);
      reject(new Error('WebSocket message timeout'));
    }, 1500);
    function onMessage(raw) {
      const message = JSON.parse(raw.toString());
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off('message', onMessage);
      resolve(message);
    }
    socket.on('message', onMessage);
  });
}

function send(socket, message) {
  socket.send(JSON.stringify({ protocol: 'aht.gateway.v1', ...message }));
}

async function openClient() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  clients.add(socket);
  await waitForOpen(socket);
  return socket;
}

async function authorizeAndReadSnapshot(socket, messageId) {
  const helloAckPromise = nextMessage(socket, (message) => message.type === 'hello_ack');
  const snapshotPromise = nextMessage(socket, (message) => message.type === 'snapshot');
  send(socket, {
    type: 'hello', message_id: messageId, client_id: 'browser-1', device_id: 'device-01', client_kind: 'browser',
    auth: { mode: 'reference', credential_ref: 'reference:aht' },
  });
  await helloAckPromise;
  return snapshotPromise;
}

async function closeServer() {
  clients.forEach((client) => client.close());
  clients.clear();
  await new Promise((resolve) => server.close(resolve));
}

beforeEach(async () => {
  server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
});

afterEach(async () => {
  await closeServer();
});

describe('reference Gateway persistence boundary', () => {
  test('recovers snapshot, event history and command ledger after a gateway restart', async () => {
    const store = createMemoryStore();
    gateway = createReferenceGateway({
      deviceId: 'device-01',
      nowFn: () => Date.parse('2026-08-18T03:00:00.000Z'),
      store,
    });
    server.on('connection', (socket) => gateway.attach(socket));

    const firstClient = await openClient();
    const snapshot = await authorizeAndReadSnapshot(firstClient, 'hello-before-restart');
    const command = {
      type: 'command', message_id: 'command-before-restart', command_id: 'cmd-persisted', command: 'approve',
      target: { needs_you_id: 'codex-production-approval', agent_id: 'codex' },
      precondition: { event_id: snapshot.event_id, revision: snapshot.snapshot.revision },
    };
    const ackPromise = nextMessage(firstClient, (message) => message.type === 'command_ack' && message.command_id === 'cmd-persisted');
    const eventPromise = nextMessage(firstClient, (message) => message.type === 'event' && message.audit?.command_id === 'cmd-persisted');
    send(firstClient, command);
    const ack = await ackPromise;
    const event = await eventPromise;
    expect(ack).toMatchObject({ status: 'accepted', phase: 'pending_event' });
    expect(event).toMatchObject({ event: { type: 'needs_you_resolved', status: 'approved' } });
    expect(store.load()).toBeTruthy();

    await closeServer();
    server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise((resolve) => server.once('listening', resolve));
    port = server.address().port;
    gateway = createReferenceGateway({
      deviceId: 'device-01',
      nowFn: () => Date.parse('2026-08-18T03:01:00.000Z'),
      store,
    });
    server.on('connection', (socket) => gateway.attach(socket));

    expect(gateway.getSnapshot()).toMatchObject({ revision: 2, event_id: event.event_id });
    expect(gateway.getHistory()).toHaveLength(1);
    expect(gateway.getLedger().get('cmd-persisted')).toMatchObject({
      status: 'accepted', phase: 'final', finalEventId: event.event_id,
    });

    const restartedClient = await openClient();
    await authorizeAndReadSnapshot(restartedClient, 'hello-after-restart');
    const duplicateAckPromise = nextMessage(restartedClient, (message) => message.type === 'command_ack' && message.command_id === 'cmd-persisted');
    const duplicateEventPromise = nextMessage(restartedClient, (message) => message.type === 'event' && message.audit?.command_id === 'cmd-persisted');
    send(restartedClient, { ...command, message_id: 'command-after-restart' });
    expect(await duplicateAckPromise).toMatchObject({ status: 'duplicate', phase: 'final', final_event_id: event.event_id });
    expect(await duplicateEventPromise).toMatchObject({ event_id: event.event_id });
  });

  test('keeps paired credentials and their revocations across a gateway restart', async () => {
    const store = createMemoryStore();
    gateway = createReferenceGateway({
      deviceId: 'device-01',
      nowFn: () => Date.parse('2026-08-18T03:00:00.000Z'),
      store,
    });
    server.on('connection', (socket) => gateway.attach(socket));

    const first = await openClient();
    const challengePromise = nextMessage(first, (message) => message.type === 'pairing_challenge');
    send(first, {
      type: 'pairing_begin', message_id: 'pair-persist', client_id: 'native-1', device_id: 'device-03', device_name: 'AHT Native',
    });
    const challenge = await challengePromise;
    const resultPromise = nextMessage(first, (message) => message.type === 'pairing_result');
    send(first, {
      type: 'pairing_confirm', message_id: 'pair-confirm-persist', pairing_id: challenge.pairing_id, code: '000000',
    });
    const result = await resultPromise;
    const credentialRef = result.credential_ref;
    expect(credentialRef).toMatch(/^paired:device-03:/);
    const revokedPromise = nextMessage(first, (message) => message.type === 'session_revoked');
    send(first, { type: 'session_revoke', message_id: 'revoke-persist', credential_ref: credentialRef });
    expect(await revokedPromise).toMatchObject({ type: 'session_revoked', credential_ref: credentialRef });
    expect(store.load()).toBeTruthy();

    await closeServer();
    server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise((resolve) => server.once('listening', resolve));
    port = server.address().port;
    gateway = createReferenceGateway({
      deviceId: 'device-01',
      nowFn: () => Date.parse('2026-08-18T03:01:00.000Z'),
      store,
    });
    server.on('connection', (socket) => gateway.attach(socket));

    const restarted = await openClient();
    const ackPromise = nextMessage(restarted, (message) => message.type === 'hello_ack');
    send(restarted, {
      type: 'hello', message_id: 'revoked-after-restart', client_id: 'native-1', device_id: 'device-03', client_kind: 'native',
      auth: { mode: 'paired_session', credential_ref: credentialRef },
    });
    expect(await ackPromise).toMatchObject({
      authorization: { status: 'unauthorized', reason: 'credential_revoked', permission_scope: [] },
    });
  });
});
