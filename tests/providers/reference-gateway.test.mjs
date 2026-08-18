import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { WebSocket, WebSocketServer } from 'ws';
import { createReferenceGateway } from '../../scripts/reference-gateway-contract.mjs';

let server;
let gateway;
let port;
const clients = new Set();

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

async function openClient() {
  const socket = new WebSocket(`ws://127.0.0.1:${port}`);
  clients.add(socket);
  await waitForOpen(socket);
  return socket;
}

function send(socket, message) {
  socket.send(JSON.stringify({ protocol: 'aht.gateway.v1', ...message }));
}

beforeEach(async () => {
  server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise((resolve) => server.once('listening', resolve));
  port = server.address().port;
  gateway = createReferenceGateway({ deviceId: 'device-01', nowFn: () => Date.parse('2026-08-18T03:00:00.000Z') });
  server.on('connection', (socket) => gateway.attach(socket));
});

afterEach(async () => {
  clients.forEach((client) => client.close());
  clients.clear();
  await new Promise((resolve) => server.close(resolve));
});

describe('reference Gateway public contract', () => {
  test('runs hello, snapshot, command ack, final event and duplicate readback', async () => {
    const socket = await openClient();
    const helloAckPromise = nextMessage(socket, (message) => message.type === 'hello_ack');
    const snapshotPromise = nextMessage(socket, (message) => message.type === 'snapshot');
    send(socket, {
      type: 'hello', message_id: 'client-hello-1', client_id: 'browser-1', device_id: 'device-01', client_kind: 'browser',
      auth: { mode: 'reference', credential_ref: 'reference:aht' },
    });
    const helloAck = await helloAckPromise;
    const snapshot = await snapshotPromise;
    expect(helloAck).toMatchObject({
      type: 'hello_ack',
      authorization: { status: 'authorized', permission_scope: expect.arrayContaining(['needs_you:write']) },
      session: { tenant_id: 'reference-tenant', principal_id: 'reference-user', device_id: 'device-01' },
    });
    expect(snapshot).toMatchObject({
      type: 'snapshot',
      snapshot: {
        source: 'gateway', schema_version: 1, revision: 1, event_id: 'evt-1',
        tenant_id: 'reference-tenant', principal_id: 'reference-user', device_id: 'device-01',
        sessions: expect.arrayContaining([expect.objectContaining({ id: 'codex-gateway-001' })]),
      },
    });

    const command = {
      type: 'command', message_id: 'client-command-1', command_id: 'cmd-01', command: 'approve',
      target: { needs_you_id: 'codex-production-approval', agent_id: 'codex' },
      precondition: { event_id: snapshot.event_id, revision: snapshot.snapshot.revision },
    };
    const ackPromise = nextMessage(socket, (message) => message.type === 'command_ack' && message.command_id === 'cmd-01');
    const eventPromise = nextMessage(socket, (message) => message.type === 'event' && message.audit?.command_id === 'cmd-01');
    send(socket, command);
    const ack = await ackPromise;
    const event = await eventPromise;
    expect(ack).toMatchObject({ status: 'accepted', phase: 'pending_event', final_event_id: null, retryable: false });
    expect(event).toMatchObject({
      revision: 2,
      actor: { kind: 'user', id: 'reference-user' },
      audit: {
        tenant_id: 'reference-tenant', principal_id: 'reference-user', device_id: 'device-01',
        session_id: 'reference-session', command_id: 'cmd-01', source_event_id: 'evt-1', source_revision: 1,
      },
      event: { type: 'needs_you_resolved', status: 'approved', command_id: 'cmd-01' },
    });

    const duplicateAckPromise = nextMessage(socket, (message) => message.type === 'command_ack' && message.command_id === 'cmd-01');
    const duplicateEventPromise = nextMessage(socket, (message) => message.type === 'event' && message.audit?.command_id === 'cmd-01');
    send(socket, { ...command, message_id: 'client-command-duplicate' });
    const duplicateAck = await duplicateAckPromise;
    const duplicateEvent = await duplicateEventPromise;
    expect(duplicateAck).toMatchObject({ status: 'duplicate', phase: 'final', final_event_id: event.event_id });
    expect(duplicateEvent).toMatchObject({ event_id: event.event_id, event: { command_id: 'cmd-01' } });
    expect(gateway.getLedger().size).toBe(1);
    expect(gateway.getSnapshot().revision).toBe(2);
  });

  test('rejects stale, read-only and malformed commands with structured state', async () => {
    const socket = await openClient();
    const helloAckPromise = nextMessage(socket, (message) => message.type === 'hello_ack');
    const snapshotPromise = nextMessage(socket, (message) => message.type === 'snapshot');
    send(socket, {
      type: 'hello', message_id: 'hello-1', client_id: 'browser-1', device_id: 'device-01', client_kind: 'browser',
      auth: { mode: 'reference', credential_ref: 'reference:aht' },
    });
    await helloAckPromise;
    await snapshotPromise;
    const staleAckPromise = nextMessage(socket, (message) => message.type === 'command_ack' && message.command_id === 'stale-01');
    send(socket, {
      type: 'command', message_id: 'stale-message', command_id: 'stale-01', command: 'approve',
      target: { needs_you_id: 'codex-production-approval', agent_id: 'codex' },
      precondition: { event_id: 'evt-old', revision: 0 },
    });
    expect(await staleAckPromise).toMatchObject({ status: 'rejected', reason: 'stale_target', retryable: true });

    const readOnly = await openClient();
    const readOnlyAckPromise = nextMessage(readOnly, (message) => message.type === 'hello_ack');
    send(readOnly, {
      type: 'hello', message_id: 'readonly-hello', client_id: 'readonly', device_id: 'device-01', client_kind: 'browser',
      auth: { mode: 'pairing_ref', credential_ref: 'read-only' },
    });
    expect(await readOnlyAckPromise).toMatchObject({ authorization: { status: 'unauthorized', permission_scope: [] } });

    const malformedPromise = nextMessage(socket, (message) => message.type === 'error');
    send(socket, { type: 'command', message_id: 'malformed-command', command_id: 'bad' });
    expect(await malformedPromise).toMatchObject({ type: 'error', code: 'invalid_message', request_message_id: 'malformed-command' });
  });

  test('supports pairing, ping/pong and resume resync', async () => {
    const socket = await openClient();
    const pairingPromise = nextMessage(socket, (message) => message.type === 'pairing_challenge');
    send(socket, { type: 'pairing_begin', message_id: 'pairing-begin', client_id: 'browser-1', device_id: 'device-01', device_name: 'AHT Browser' });
    const challenge = await pairingPromise;
    expect(challenge).toMatchObject({ type: 'pairing_challenge', display_code: '000000' });
    const pairingResultPromise = nextMessage(socket, (message) => message.type === 'pairing_result');
    send(socket, { type: 'pairing_confirm', message_id: 'pairing-confirm', pairing_id: challenge.pairing_id, code: '000000' });
    const pairingResult = await pairingResultPromise;
    expect(pairingResult).toMatchObject({ status: 'paired' });
    expect(pairingResult.credential_ref).toMatch(/^paired:device-01:/);

    const pongPromise = nextMessage(socket, (message) => message.type === 'pong');
    send(socket, { type: 'ping', message_id: 'ping-1', sent_at: '2026-08-18T03:00:00.000Z' });
    expect(await pongPromise).toMatchObject({ request_message_id: 'ping-1' });

    const resyncClient = await openClient();
    const resyncAckPromise = nextMessage(resyncClient, (message) => message.type === 'hello_ack');
    const resyncPromise = nextMessage(resyncClient, (message) => message.type === 'resync_required');
    send(resyncClient, {
      type: 'hello', message_id: 'resync-hello-1', client_id: 'browser-2', device_id: 'device-01', client_kind: 'browser',
      auth: { mode: 'reference', credential_ref: 'reference:aht' }, resume_after: 'evt-missing',
    });
    await resyncAckPromise;
    expect(await resyncPromise).toMatchObject({ reason: 'resume_cursor_unknown', after_revision: 1 });
    const freshAckPromise = nextMessage(resyncClient, (message) => message.type === 'hello_ack');
    const freshSnapshotPromise = nextMessage(resyncClient, (message) => message.type === 'snapshot');
    send(resyncClient, {
      type: 'hello', message_id: 'resync-hello-2', client_id: 'browser-2', device_id: 'device-01', client_kind: 'browser',
      auth: { mode: 'reference', credential_ref: 'reference:aht' },
    });
    await freshAckPromise;
    expect(await freshSnapshotPromise).toMatchObject({ type: 'snapshot', snapshot: { revision: 1 } });
  });

  test('issues an expiring paired session and revokes its credential', async () => {
    const pairSocket = await openClient();
    const challengePromise = nextMessage(pairSocket, (message) => message.type === 'pairing_challenge');
    send(pairSocket, {
      type: 'pairing_begin', message_id: 'pair-begin', client_id: 'native-1', device_id: 'device-02', device_name: 'AHT Brick Pro',
    });
    const challenge = await challengePromise;
    const resultPromise = nextMessage(pairSocket, (message) => message.type === 'pairing_result');
    send(pairSocket, {
      type: 'pairing_confirm', message_id: 'pair-confirm', pairing_id: challenge.pairing_id, code: '000000',
    });
    const result = await resultPromise;
    expect(result).toMatchObject({ status: 'paired' });
    expect(result.credential_ref).toMatch(/^paired:device-02:/);

    const client = await openClient();
    const ackPromise = nextMessage(client, (message) => message.type === 'hello_ack');
    const snapshotPromise = nextMessage(client, (message) => message.type === 'snapshot');
    send(client, {
      type: 'hello', message_id: 'paired-hello', client_id: 'native-1', device_id: 'device-02', client_kind: 'native',
      auth: { mode: 'paired_session', credential_ref: result.credential_ref },
    });
    const ack = await ackPromise;
    const snapshot = await snapshotPromise;
    expect(ack).toMatchObject({
      authorization: { status: 'authorized', permission_scope: expect.arrayContaining(['needs_you:write']) },
      session: {
        id: expect.stringMatching(/^sess-/), device_id: 'device-02',
        principal_id: 'reference-user', tenant_id: 'reference-tenant',
      },
    });
    expect(Date.parse(ack.session.expires_at)).toBeGreaterThan(Date.parse(ack.server_time));
    expect(snapshot).toMatchObject({ type: 'snapshot' });

    const command = {
      type: 'command', message_id: 'paired-command', command_id: 'cmd-paired', command: 'approve',
      target: { needs_you_id: 'codex-production-approval', agent_id: 'codex' },
      precondition: { event_id: snapshot.event_id, revision: snapshot.snapshot.revision },
    };
    const commandAckPromise = nextMessage(client, (message) => message.type === 'command_ack' && message.command_id === 'cmd-paired');
    const eventPromise = nextMessage(client, (message) => message.type === 'event' && message.audit?.command_id === 'cmd-paired');
    send(client, command);
    expect(await commandAckPromise).toMatchObject({ status: 'accepted', phase: 'pending_event' });
    expect(await eventPromise).toMatchObject({ audit: { session_id: ack.session.id, device_id: 'device-02' } });

    const revokedPromise = nextMessage(client, (message) => message.type === 'session_revoked');
    send(client, { type: 'session_revoke', message_id: 'revoke-1', credential_ref: result.credential_ref });
    expect(await revokedPromise).toMatchObject({ type: 'session_revoked', credential_ref: result.credential_ref });

    const reuse = await openClient();
    const reuseAckPromise = nextMessage(reuse, (message) => message.type === 'hello_ack');
    send(reuse, {
      type: 'hello', message_id: 'reuse-hello', client_id: 'native-1', device_id: 'device-02', client_kind: 'native',
      auth: { mode: 'paired_session', credential_ref: result.credential_ref },
    });
    expect(await reuseAckPromise).toMatchObject({
      authorization: { status: 'unauthorized', reason: 'credential_revoked', permission_scope: [] },
    });
  });

  test('rejects unknown and expired paired credentials', async () => {
    const unknown = await openClient();
    const unknownAckPromise = nextMessage(unknown, (message) => message.type === 'hello_ack');
    send(unknown, {
      type: 'hello', message_id: 'unknown-hello', client_id: 'native-1', device_id: 'device-01', client_kind: 'native',
      auth: { mode: 'paired_session', credential_ref: 'paired:device-01:not-issued' },
    });
    expect(await unknownAckPromise).toMatchObject({
      authorization: { status: 'unauthorized', reason: 'credential_invalid', permission_scope: [] },
    });

    const expiredServer = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise((resolve) => expiredServer.once('listening', resolve));
    const expiredPort = expiredServer.address().port;
    const expiredGateway = createReferenceGateway({
      deviceId: 'device-01',
      nowFn: () => Date.parse('2026-08-18T03:00:00.000Z'),
      sessionTtlMs: 0,
    });
    expiredServer.on('connection', (socket) => expiredGateway.attach(socket));
    const pairSocket = new WebSocket(`ws://127.0.0.1:${expiredPort}`);
    clients.add(pairSocket);
    await waitForOpen(pairSocket);
    const challengePromise = nextMessage(pairSocket, (message) => message.type === 'pairing_challenge');
    send(pairSocket, {
      type: 'pairing_begin', message_id: 'expired-pair-begin', client_id: 'native-1', device_id: 'device-01', device_name: 'AHT Native',
    });
    const challenge = await challengePromise;
    const resultPromise = nextMessage(pairSocket, (message) => message.type === 'pairing_result');
    send(pairSocket, {
      type: 'pairing_confirm', message_id: 'expired-pair-confirm', pairing_id: challenge.pairing_id, code: '000000',
    });
    const result = await resultPromise;
    expect(result.credential_ref).toMatch(/^paired:device-01:/);

    const expiredClient = new WebSocket(`ws://127.0.0.1:${expiredPort}`);
    clients.add(expiredClient);
    await waitForOpen(expiredClient);
    const expiredAckPromise = nextMessage(expiredClient, (message) => message.type === 'hello_ack');
    send(expiredClient, {
      type: 'hello', message_id: 'expired-hello', client_id: 'native-1', device_id: 'device-01', client_kind: 'native',
      auth: { mode: 'paired_session', credential_ref: result.credential_ref },
    });
    expect(await expiredAckPromise).toMatchObject({
      authorization: { status: 'unauthorized', reason: 'session_expired', permission_scope: [] },
    });
    expiredServer.close();
    pairSocket.close();
    expiredClient.close();
    await new Promise((resolve) => expiredServer.once('close', resolve));
  });
});
