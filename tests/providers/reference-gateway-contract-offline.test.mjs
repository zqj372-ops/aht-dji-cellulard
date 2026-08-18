import { describe, expect, test } from 'vitest';
import { createReferenceGateway } from '../../scripts/reference-gateway-contract.mjs';

const BASE_TIME = Date.parse('2026-08-18T03:00:00.000Z');

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

function createMockSocket() {
  const listeners = new Map();
  const messages = [];
  return {
    readyState: 1,
    messages,
    emit(type, payload) {
      for (const listener of listeners.get(type) ?? []) listener(payload);
    },
    on(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    send(raw) {
      messages.push(JSON.parse(raw.toString()));
    },
  };
}

function send(gateway, socket, message) {
  socket.emit('message', Buffer.from(JSON.stringify({ protocol: 'aht.gateway.v1', ...message })));
}

function typeOf(socket, type) {
  return socket.messages.filter((message) => message.type === type);
}

describe('reference Gateway business loop (offline contract)', () => {
  test('executes hello -> snapshot -> command -> ack -> final event -> duplicate readback without sockets', () => {
    const gateway = createReferenceGateway({ deviceId: 'device-01', nowFn: () => BASE_TIME });
    const socket = createMockSocket();
    gateway.attach(socket);

    send(gateway, socket, {
      type: 'hello', message_id: 'client-hello-1', client_id: 'browser-1', device_id: 'device-01', client_kind: 'browser',
      auth: { mode: 'reference', credential_ref: 'reference:aht' },
    });
    const helloAck = typeOf(socket, 'hello_ack')[0];
    const snapshotMessage = typeOf(socket, 'snapshot')[0];
    expect(helloAck).toMatchObject({
      authorization: { status: 'authorized', permission_scope: expect.arrayContaining(['needs_you:write']) },
      session: { tenant_id: 'reference-tenant', principal_id: 'reference-user', device_id: 'device-01' },
    });
    expect(snapshotMessage.snapshot).toMatchObject({
      source: 'gateway', schema_version: 1, revision: 1, event_id: 'evt-1',
      tenant_id: 'reference-tenant', principal_id: 'reference-user', device_id: 'device-01',
    });

    const command = {
      type: 'command', message_id: 'client-command-1', command_id: 'cmd-01', command: 'approve',
      target: { needs_you_id: 'codex-production-approval', agent_id: 'codex' },
      precondition: { event_id: snapshotMessage.event_id, revision: snapshotMessage.snapshot.revision },
    };
    send(gateway, socket, command);
    const ack = typeOf(socket, 'command_ack')[0];
    const event = typeOf(socket, 'event')[0];
    expect(ack).toMatchObject({ status: 'accepted', phase: 'pending_event', final_event_id: null, retryable: false });
    expect(event).toMatchObject({
      revision: 2,
      actor: { kind: 'user', id: 'reference-user' },
      audit: {
        tenant_id: 'reference-tenant', principal_id: 'reference-user', device_id: 'device-01',
        command_id: 'cmd-01', source_event_id: 'evt-1', source_revision: 1,
      },
      event: { type: 'needs_you_resolved', status: 'approved', command_id: 'cmd-01' },
    });

    const messagesBeforeDuplicate = socket.messages.length;
    send(gateway, socket, { ...command, message_id: 'client-command-duplicate' });
    const duplicateAck = socket.messages[messagesBeforeDuplicate];
    const duplicateEvent = socket.messages[messagesBeforeDuplicate + 1];
    expect(duplicateAck).toMatchObject({ status: 'duplicate', phase: 'final', final_event_id: event.event_id });
    expect(duplicateEvent).toMatchObject({ type: 'event', event_id: event.event_id });
    expect(gateway.getSnapshot()).toMatchObject({ revision: 2, event_id: event.event_id });
  });

  test('recovers snapshot, event history and ledger after restart and replays on resume_after', () => {
    const store = createMemoryStore();
    const firstGateway = createReferenceGateway({ deviceId: 'device-01', nowFn: () => BASE_TIME, store });
    const firstSocket = createMockSocket();
    firstGateway.attach(firstSocket);

    send(firstGateway, firstSocket, {
      type: 'hello', message_id: 'hello-before-restart', client_id: 'browser-1', device_id: 'device-01', client_kind: 'browser',
      auth: { mode: 'reference', credential_ref: 'reference:aht' },
    });
    const snapshotMessage = typeOf(firstSocket, 'snapshot')[0];
    send(firstGateway, firstSocket, {
      type: 'command', message_id: 'command-before-restart', command_id: 'cmd-persisted', command: 'approve',
      target: { needs_you_id: 'codex-production-approval', agent_id: 'codex' },
      precondition: { event_id: snapshotMessage.event_id, revision: snapshotMessage.snapshot.revision },
    });
    const finalEvent = typeOf(firstSocket, 'event')[0];
    expect(store.load()).toBeTruthy();

    const restartedGateway = createReferenceGateway({
      deviceId: 'device-01',
      nowFn: () => BASE_TIME + 60_000,
      store,
    });
    expect(restartedGateway.getSnapshot()).toMatchObject({ revision: 2, event_id: finalEvent.event_id });
    expect(restartedGateway.getHistory()).toHaveLength(1);
    expect(restartedGateway.getLedger().get('cmd-persisted')).toMatchObject({
      status: 'accepted', phase: 'final', finalEventId: finalEvent.event_id,
    });

    const restartedSocket = createMockSocket();
    restartedGateway.attach(restartedSocket);
    send(restartedGateway, restartedSocket, {
      type: 'hello', message_id: 'hello-after-restart', client_id: 'browser-1', device_id: 'device-01', client_kind: 'browser',
      auth: { mode: 'reference', credential_ref: 'reference:aht' },
      resume_after: finalEvent.event_id,
    });
    const replayed = typeOf(restartedSocket, 'event');
    expect(replayed).toHaveLength(1);
    expect(replayed[0]).toMatchObject({ type: 'event', event_id: finalEvent.event_id });

    send(restartedGateway, restartedSocket, {
      type: 'command', message_id: 'command-after-restart', command_id: 'cmd-persisted', command: 'approve',
      target: { needs_you_id: 'codex-production-approval', agent_id: 'codex' },
      precondition: { event_id: snapshotMessage.event_id, revision: snapshotMessage.snapshot.revision },
    });
    const duplicateAck = typeOf(restartedSocket, 'command_ack').at(-1);
    expect(duplicateAck).toMatchObject({ status: 'duplicate', phase: 'final', final_event_id: finalEvent.event_id });
  });
});
