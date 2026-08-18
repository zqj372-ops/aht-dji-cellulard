import { afterEach, describe, expect, test } from 'vitest';
import { GatewayProvider } from '../../src/providers/gateway/GatewayProvider';
import type { GatewaySnapshot } from '../../src/providers/protocol';
import type { ProviderEvent } from '../../src/providers/types';

class FakeSocket {
  static instances: FakeSocket[] = [];
  readonly sent: string[] = [];
  readonly url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  send(message: string): void {
    this.sent.push(message);
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  fail(): void {
    this.onerror?.();
  }
}

const gatewaySnapshot: GatewaySnapshot = {
  source: 'gateway',
  schema_version: 1,
  revision: 1,
  event_id: 'evt-1',
  generated_at: '2026-08-18T03:00:00.000Z',
  tenant_id: 'tenant-01',
  principal_id: 'user-01',
  device_id: 'device-01',
  permission_scope: ['needs_you:read', 'needs_you:write'],
  agents: [{
    id: 'codex', type: 'codex', name: 'Codex', model: 'codex', server: 'tokyo-01',
    workspace: '/aht', session: 'codex-remote-1', status: 'waiting_approval',
    current_task: '生产部署审批', elapsed_seconds: 23, needs_user: true,
    maturity: 'beta', capabilities: { approval: true },
  }],
  sessions: [{
    id: 'codex-remote-1', agent_id: 'codex', status: 'waiting_approval', title: '生产部署审批',
    started_at: '2026-08-18T02:59:00.000Z', updated_at: '2026-08-18T03:00:00.000Z',
  }],
  needs_you: [{
    id: 'remote-approval', agent_id: 'codex', type: 'approval', title: '远程审批',
    detail: '来自 Gateway 的审批', risk: 'high', created_at: '2026-08-18T03:00:00.000Z',
    status: 'pending', actions: ['approve', 'reject'],
  }],
  servers: [],
  network: null,
};

function receiveAuthorized(socket: FakeSocket | undefined): void {
  socket?.receive({
    protocol: 'aht.gateway.v1', type: 'hello_ack', message_id: 'msg-ack-1', connection_id: 'conn-1',
    session: { id: 'session-aht', principal_id: 'user-01', tenant_id: 'tenant-01', device_id: 'device-01', expires_at: null },
    authorization: { status: 'authorized', permission_scope: gatewaySnapshot.permission_scope, reason: null },
    server_time: '2026-08-18T03:00:01.000Z', resume_supported: true, capabilities: ['needs_you:write'],
  });
  socket?.receive({ protocol: 'aht.gateway.v1', type: 'snapshot', message_id: 'msg-snapshot-1', event_id: 'evt-1', snapshot: gatewaySnapshot });
}

afterEach(() => {
  FakeSocket.instances = [];
});

describe('GatewayProvider', () => {
  test('carries the session expiry from hello_ack into authorization state', () => {
    const events: ProviderEvent[] = [];
    const provider = new GatewayProvider({
      url: 'ws://gateway.test',
      deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
      reconnectDelaysMs: [0],
    });
    provider.subscribe((event) => events.push(event));
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'hello_ack', message_id: 'msg-ack-expiry', connection_id: 'conn-1',
      session: {
        id: 'session-aht', principal_id: 'user-01', tenant_id: 'tenant-01',
        device_id: 'device-01', expires_at: '2026-08-18T11:00:00.000Z',
      },
      authorization: { status: 'authorized', permission_scope: gatewaySnapshot.permission_scope, reason: null },
      server_time: '2026-08-18T03:00:01.000Z', resume_supported: true, capabilities: ['needs_you:write'],
    });
    const authorizationEvent = events.find((event) => event.type === 'authorization');
    expect(authorizationEvent).toEqual(expect.objectContaining({
      type: 'authorization',
      authorization: expect.objectContaining({
        status: 'authorized',
        sessionId: 'session-aht',
        principalId: 'user-01',
        tenantId: 'tenant-01',
        deviceId: 'device-01',
        expiresAt: '2026-08-18T11:00:00.000Z',
      }),
    }));
  });

  test('sends hello, emits a snapshot, and resumes from the last event after reconnect', async () => {
    const events: ProviderEvent[] = [];
    const provider = new GatewayProvider({
      url: 'ws://gateway.test',
      clientId: 'test-client',
      deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
      reconnectDelaysMs: [0],
    });
    provider.subscribe((event) => events.push(event));

    provider.connect();
    const first = FakeSocket.instances[0];
    first?.open();
    const hello = JSON.parse(first?.sent[0] ?? '{}');
    expect(hello).toMatchObject({
      protocol: 'aht.gateway.v1', type: 'hello', client_id: 'test-client', device_id: 'device-01', client_kind: 'browser',
      auth: { mode: 'reference', credential_ref: 'reference:aht' }, message_id: expect.any(String),
    });
    expect(hello).not.toHaveProperty('resume_after');

    receiveAuthorized(first);
    const snapshotEvent = events.find((event) => event.type === 'snapshot');
    expect(snapshotEvent).toEqual(expect.objectContaining({
      type: 'snapshot',
      snapshotTrust: expect.objectContaining({
        freshness: 'fresh',
        generatedAt: gatewaySnapshot.generated_at,
        permissionScope: gatewaySnapshot.permission_scope,
      }),
    }));

    first?.close();
    await new Promise((resolve) => setTimeout(resolve, 1));
    const second = FakeSocket.instances[1];
    second?.open();
    expect(JSON.parse(second?.sent[0] ?? '{}')).toMatchObject({ resume_after: 'evt-1' });

    provider.disconnect();
  });

  test('sends an approval command and resolves it from command_ack', async () => {
    const provider = new GatewayProvider({
      url: 'ws://gateway.test',
      clientId: 'test-client',
      deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
    });
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    receiveAuthorized(socket);

    const ackPromise = provider.decide({ itemId: 'remote-approval', agentId: 'codex', decision: 'approve' });
    const command = JSON.parse(socket?.sent[1] ?? '{}');
    expect(command).toMatchObject({
      protocol: 'aht.gateway.v1', type: 'command', command: 'approve',
      target: { needs_you_id: 'remote-approval', agent_id: 'codex' },
      precondition: { event_id: 'evt-1', revision: 1 },
    });
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'command_ack', message_id: 'msg-command-ack', command_id: command.command_id,
      status: 'accepted', phase: 'pending_event', reason: null, final_event_id: null, retryable: false });
    await expect(ackPromise).resolves.toMatchObject({ status: 'accepted' });
    provider.disconnect();
  });

  test('turns malformed messages into a visible provider error instead of throwing', () => {
    const events: ProviderEvent[] = [];
    const provider = new GatewayProvider({
      url: 'ws://gateway.test',
      deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url),
    });
    provider.subscribe((event) => events.push(event));
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'snapshot', message_id: 'msg-invalid', snapshot: {} });

    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'invalid_snapshot' }));
    provider.disconnect();
  });

  test('locks decisions after a socket error instead of sending on a broken connection', async () => {
    const provider = new GatewayProvider({
      url: 'ws://gateway.test',
      clientId: 'test-client',
      deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
    });
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    receiveAuthorized(socket);

    socket?.fail();
    const ack = await provider.decide({ itemId: 'remote-approval', agentId: 'codex', decision: 'approve' });

    expect(ack).toMatchObject({ status: 'rejected', reason: 'gateway_not_connected' });
    expect(socket?.sent.some((message) => JSON.parse(message).type === 'command')).toBe(false);
    provider.disconnect();
  });

  test('rejects a stale snapshot without sending a remote command', async () => {
    const provider = new GatewayProvider({
      url: 'ws://gateway.test',
      clientId: 'test-client',
      deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => Date.parse('2026-08-18T03:00:31.000Z'),
      maxSnapshotAgeMs: 30_000,
    });
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    receiveAuthorized(socket);

    const ackPromise = provider.decide({ itemId: 'remote-approval', agentId: 'codex', decision: 'approve' });
    const commandSent = socket?.sent.some((message) => JSON.parse(message).type === 'command');
    provider.disconnect();
    await expect(ackPromise).resolves.toMatchObject({ status: 'rejected', reason: 'gateway_snapshot_stale' });
    expect(commandSent).toBe(false);
  });

  test('re-evaluates snapshot age at decision time', async () => {
    let now = Date.parse('2026-08-18T03:00:01.000Z');
    const provider = new GatewayProvider({
      url: 'ws://gateway.test',
      clientId: 'test-client',
      deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => now,
      maxSnapshotAgeMs: 30_000,
    });
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'hello_ack', message_id: 'msg-ack-1', connection_id: 'conn-1',
      session: { id: 'session-aht', principal_id: 'user-01', tenant_id: 'tenant-01', device_id: 'device-01', expires_at: null },
      authorization: { status: 'authorized', permission_scope: gatewaySnapshot.permission_scope, reason: null },
      server_time: '2026-08-18T03:00:01.000Z', resume_supported: true, capabilities: ['needs_you:write'],
    });
    socket?.receive({
      protocol: 'aht.gateway.v1',
      type: 'snapshot', message_id: 'msg-snapshot-1',
      event_id: 'evt-1',
      snapshot: { ...gatewaySnapshot, generated_at: '2026-08-18T03:00:01.000Z' },
    });

    now = Date.parse('2026-08-18T03:00:32.000Z');
    const ack = await provider.decide({ itemId: 'remote-approval', agentId: 'codex', decision: 'approve' });

    expect(ack).toMatchObject({ status: 'rejected', reason: 'gateway_snapshot_stale' });
    expect(socket?.sent.some((message) => JSON.parse(message).type === 'command')).toBe(false);
    provider.disconnect();
  });

  test('rejects a read-only snapshot without sending a remote command', async () => {
    const provider = new GatewayProvider({
      url: 'ws://gateway.test',
      clientId: 'test-client',
      deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
    });
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'hello_ack', message_id: 'msg-ack-1', connection_id: 'conn-1',
      session: { id: 'session-aht', principal_id: 'user-01', tenant_id: 'tenant-01', device_id: 'device-01', expires_at: null },
      authorization: { status: 'authorized', permission_scope: gatewaySnapshot.permission_scope, reason: null },
      server_time: '2026-08-18T03:00:01.000Z', resume_supported: true, capabilities: ['needs_you:write'],
    });
    socket?.receive({
      protocol: 'aht.gateway.v1',
      type: 'snapshot', message_id: 'msg-snapshot-1',
      event_id: 'evt-1',
      snapshot: { ...gatewaySnapshot, permission_scope: ['needs_you:read'] },
    });

    const ackPromise = provider.decide({ itemId: 'remote-approval', agentId: 'codex', decision: 'approve' });
    const commandSent = socket?.sent.some((message) => JSON.parse(message).type === 'command');
    provider.disconnect();
    await expect(ackPromise).resolves.toMatchObject({ status: 'rejected', reason: 'permission_denied' });
    expect(commandSent).toBe(false);
  });

  test('rejects a decision that is not offered by the Gateway target', async () => {
    const provider = new GatewayProvider({
      url: 'ws://gateway.test',
      clientId: 'test-client',
      deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
    });
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    receiveAuthorized(socket);

    const ackPromise = provider.decide({ itemId: 'remote-approval', agentId: 'codex', decision: 'defer' });
    const commandSent = socket?.sent.some((message) => JSON.parse(message).type === 'command');
    provider.disconnect();
    await expect(ackPromise).resolves.toMatchObject({ status: 'rejected', reason: 'action_not_allowed' });
    expect(commandSent).toBe(false);
  });

  test('does not become connected when hello authorization requires pairing', async () => {
    const events: ProviderEvent[] = [];
    const provider = new GatewayProvider({
      url: 'ws://gateway.test', clientId: 'test-client', deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url), reconnectDelaysMs: [],
    });
    provider.subscribe((event) => events.push(event));
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'hello_ack', message_id: 'msg-pairing-ack', connection_id: 'conn-1',
      session: { id: 'session-pairing', principal_id: null, tenant_id: null, device_id: 'device-01', expires_at: null },
      authorization: { status: 'pairing_required', permission_scope: [], reason: 'credential_missing' },
      server_time: '2026-08-18T03:00:01.000Z', resume_supported: true, capabilities: ['pairing'],
    });

    expect(events).toContainEqual(expect.objectContaining({ type: 'authorization', authorization: expect.objectContaining({ status: 'pairing_required' }) }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'connection', state: 'pairing_required' }));
    expect(events.some((event) => event.type === 'connection' && event.state === 'connected')).toBe(false);
    await expect(provider.decide({ itemId: 'remote-approval', agentId: 'codex', decision: 'approve' })).resolves.toMatchObject({
      status: 'rejected', reason: 'gateway_not_authorized',
    });
    provider.disconnect();
  });

  test('keeps ack and final event as separate lifecycle transitions', async () => {
    const events: ProviderEvent[] = [];
    const provider = new GatewayProvider({
      url: 'ws://gateway.test', clientId: 'test-client', deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url), reconnectDelaysMs: [],
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
    });
    provider.subscribe((event) => events.push(event));
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    receiveAuthorized(socket);

    const ackPromise = provider.decide({ itemId: 'remote-approval', agentId: 'codex', decision: 'approve' });
    const command = JSON.parse(socket?.sent[1] ?? '{}');
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'command_ack', message_id: 'msg-command-ack', command_id: command.command_id,
      status: 'accepted', phase: 'pending_event', reason: null, final_event_id: null, retryable: false });
    await expect(ackPromise).resolves.toMatchObject({ status: 'accepted', phase: 'pending_event' });
    expect(events).toContainEqual(expect.objectContaining({ type: 'command_lifecycle', lifecycle: expect.objectContaining({ phase: 'waiting_final_event' }) }));
    expect(events.filter((event) => event.type === 'snapshot').at(-1)).toMatchObject({
      snapshot: { inbox: [expect.objectContaining({ id: 'remote-approval', status: 'pending' })] },
    });

    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'event', message_id: 'msg-final-event', event_id: 'evt-2', revision: 2,
      generated_at: '2026-08-18T03:00:02.000Z', actor: { kind: 'user', id: 'user-01' },
      audit: {
        tenant_id: 'tenant-01', principal_id: 'user-01', device_id: 'device-01', session_id: 'session-aht',
        command_id: command.command_id, source_event_id: 'evt-1', source_revision: 1,
      },
      event: { type: 'needs_you_resolved', needs_you_id: 'remote-approval', status: 'approved', command_id: command.command_id },
    });
    expect(events).toContainEqual(expect.objectContaining({ type: 'command_lifecycle', lifecycle: expect.objectContaining({
      phase: 'confirmed', finalEventId: 'evt-2',
    }) }));
    expect(events.filter((event) => event.type === 'snapshot').at(-1)).toMatchObject({
      snapshot: { inbox: [expect.objectContaining({ id: 'remote-approval', status: 'approved' })] },
    });
    provider.disconnect();
  });

  test('requests a fresh snapshot on a revision gap and keeps the last trusted state', () => {
    const events: ProviderEvent[] = [];
    const provider = new GatewayProvider({
      url: 'ws://gateway.test', clientId: 'test-client', deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url), reconnectDelaysMs: [],
    });
    provider.subscribe((event) => events.push(event));
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    receiveAuthorized(socket);
    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'event', message_id: 'msg-gap', event_id: 'evt-4', revision: 4,
      generated_at: '2026-08-18T03:00:04.000Z', actor: { kind: 'system', id: 'gateway' },
      audit: {
        tenant_id: 'tenant-01', principal_id: 'user-01', device_id: 'device-01', session_id: 'session-aht',
        command_id: null, source_event_id: 'evt-1', source_revision: 1,
      },
      event: { type: 'server_updated', server: { id: 'server-1', name: 'SERVER-1', online: true, rtt_ms: 1,
        cpu_percent: 1, memory_percent: 1, disk_percent: 1, load: 0.1, services: { gateway: 'healthy' }, agents: 0 } },
    });
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'resync_required' }));
    expect(JSON.parse(socket?.sent.at(-1) ?? '{}')).toMatchObject({ type: 'hello', device_id: 'device-01' });
    expect(events.filter((event) => event.type === 'snapshot').at(-1)).toMatchObject({
      snapshot: { inbox: [expect.objectContaining({ id: 'remote-approval', status: 'pending' })] },
    });
    provider.disconnect();
  });

  test('runs the full browser pairing flow to an authorized session', () => {
    const events: ProviderEvent[] = [];
    const provider = new GatewayProvider({
      url: 'ws://gateway.test', clientId: 'test-client', deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url), reconnectDelaysMs: [],
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
    });
    provider.subscribe((event) => events.push(event));
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'hello_ack', message_id: 'msg-pairing-ack', connection_id: 'conn-1',
      session: { id: 'session-pairing', principal_id: null, tenant_id: null, device_id: 'device-01', expires_at: null },
      authorization: { status: 'pairing_required', permission_scope: [], reason: 'credential_missing' },
      server_time: '2026-08-18T03:00:01.000Z', resume_supported: true, capabilities: ['pairing'],
    });

    provider.beginPairing();
    expect(JSON.parse(socket?.sent[1] ?? '{}')).toMatchObject({
      type: 'pairing_begin', client_id: 'test-client', device_id: 'device-01',
    });

    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'pairing_challenge', message_id: 'msg-challenge',
      pairing_id: 'pairing-1', expires_at: '2026-08-18T03:05:00.000Z', display_code: '000000',
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'pairing',
      pairing: expect.objectContaining({ status: 'challenge', pairingId: 'pairing-1', displayCode: '000000' }),
    }));

    provider.confirmPairing('pairing-1', '000000');
    expect(JSON.parse(socket?.sent[2] ?? '{}')).toMatchObject({
      type: 'pairing_confirm', pairing_id: 'pairing-1', code: '000000',
    });

    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'pairing_result', message_id: 'msg-result',
      pairing_id: 'pairing-1', status: 'paired', credential_ref: 'paired:device-01:000001', reason: null,
    });
    expect(JSON.parse(socket?.sent[3] ?? '{}')).toMatchObject({
      type: 'hello',
      auth: { mode: 'paired_session', credential_ref: 'paired:device-01:000001' },
    });
    expect(events).toContainEqual(expect.objectContaining({
      type: 'pairing',
      pairing: expect.objectContaining({ status: 'paired', credentialRef: 'paired:device-01:000001' }),
    }));

    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'hello_ack', message_id: 'msg-ack-authorized', connection_id: 'conn-2',
      session: { id: 'session-aht', principal_id: 'user-01', tenant_id: 'tenant-01', device_id: 'device-01', expires_at: null },
      authorization: { status: 'authorized', permission_scope: gatewaySnapshot.permission_scope, reason: null },
      server_time: '2026-08-18T03:00:02.000Z', resume_supported: true, capabilities: ['needs_you:write'],
    });
    expect(events).toContainEqual(expect.objectContaining({ type: 'connection', state: 'connected' }));
    expect(events.filter((event) => event.type === 'pairing').at(-1)).toEqual(
      expect.objectContaining({ pairing: expect.objectContaining({ status: 'idle' }) }),
    );
    provider.disconnect();
  });

  test('keeps pairing_required when the gateway rejects the pairing result', () => {
    const events: ProviderEvent[] = [];
    const provider = new GatewayProvider({
      url: 'ws://gateway.test', clientId: 'test-client', deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url), reconnectDelaysMs: [],
    });
    provider.subscribe((event) => events.push(event));
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'hello_ack', message_id: 'msg-pairing-ack', connection_id: 'conn-1',
      session: { id: 'session-pairing', principal_id: null, tenant_id: null, device_id: 'device-01', expires_at: null },
      authorization: { status: 'pairing_required', permission_scope: [], reason: 'credential_missing' },
      server_time: '2026-08-18T03:00:01.000Z', resume_supported: true, capabilities: ['pairing'],
    });
    provider.beginPairing();
    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'pairing_challenge', message_id: 'msg-challenge',
      pairing_id: 'pairing-2', expires_at: '2026-08-18T03:05:00.000Z', display_code: '000000',
    });
    provider.confirmPairing('pairing-2', '000000');
    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'pairing_result', message_id: 'msg-result',
      pairing_id: 'pairing-2', status: 'rejected', credential_ref: null, reason: 'pairing_code_invalid',
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'pairing',
      pairing: expect.objectContaining({ status: 'rejected', reason: 'pairing_code_invalid' }),
    }));
    expect(events.filter((event) => event.type === 'connection').at(-1))
      .toEqual(expect.objectContaining({ state: 'pairing_required' }));
    provider.disconnect();
  });

  test('fails closed when the gateway revokes the active paired credential', () => {
    const events: ProviderEvent[] = [];
    const provider = new GatewayProvider({
      url: 'ws://gateway.test', clientId: 'test-client', deviceId: 'device-01',
      socketFactory: (url) => new FakeSocket(url), reconnectDelaysMs: [],
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
    });
    provider.subscribe((event) => events.push(event));
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'hello_ack', message_id: 'msg-pairing-ack', connection_id: 'conn-1',
      session: { id: 'session-pairing', principal_id: null, tenant_id: null, device_id: 'device-01', expires_at: null },
      authorization: { status: 'pairing_required', permission_scope: [], reason: 'credential_missing' },
      server_time: '2026-08-18T03:00:01.000Z', resume_supported: true, capabilities: ['pairing'],
    });
    provider.beginPairing();
    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'pairing_challenge', message_id: 'msg-challenge',
      pairing_id: 'pairing-3', expires_at: '2026-08-18T03:05:00.000Z', display_code: '000000',
    });
    provider.confirmPairing('pairing-3', '000000');
    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'pairing_result', message_id: 'msg-result',
      pairing_id: 'pairing-3', status: 'paired', credential_ref: 'paired:device-01:000003', reason: null,
    });
    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'hello_ack', message_id: 'msg-ack-authorized', connection_id: 'conn-2',
      session: { id: 'session-aht', principal_id: 'user-01', tenant_id: 'tenant-01', device_id: 'device-01', expires_at: null },
      authorization: { status: 'authorized', permission_scope: gatewaySnapshot.permission_scope, reason: null },
      server_time: '2026-08-18T03:00:02.000Z', resume_supported: true, capabilities: ['needs_you:write'],
    });
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'snapshot', message_id: 'msg-snapshot-1', event_id: 'evt-1', snapshot: gatewaySnapshot });

    socket?.receive({
      protocol: 'aht.gateway.v1', type: 'session_revoked', message_id: 'msg-revoked',
      credential_ref: 'paired:device-01:000003', revoked_at: '2026-08-18T04:00:00.000Z', reason: null,
    });

    expect(events).toContainEqual(expect.objectContaining({
      type: 'authorization',
      authorization: expect.objectContaining({ status: 'unauthorized', reason: 'credential_revoked' }),
    }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'connection', state: 'unauthorized' }));
    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'unauthorized' }));
    provider.disconnect();
  });
});
