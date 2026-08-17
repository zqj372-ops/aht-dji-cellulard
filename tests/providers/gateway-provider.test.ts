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
  schema_version: 1,
  revision: 1,
  event_id: 'evt-1',
  generated_at: '2026-08-18T03:00:00.000Z',
  permission_scope: ['needs_you:read', 'needs_you:write'],
  agents: [{
    id: 'codex', type: 'codex', name: 'Codex', model: 'codex', server: 'tokyo-01',
    workspace: '/aht', session: 'codex-remote-1', status: 'waiting_approval',
    current_task: '生产部署审批', elapsed_seconds: 23, needs_user: true,
    maturity: 'beta', capabilities: { approval: true },
  }],
  needs_you: [{
    id: 'remote-approval', agent_id: 'codex', type: 'approval', title: '远程审批',
    detail: '来自 Gateway 的审批', risk: 'high', created_at: '2026-08-18T03:00:00.000Z',
    status: 'pending', actions: ['approve', 'reject'],
  }],
  servers: [],
  network: null,
};

afterEach(() => {
  FakeSocket.instances = [];
});

describe('GatewayProvider', () => {
  test('sends hello, emits a snapshot, and resumes from the last event after reconnect', async () => {
    const events: ProviderEvent[] = [];
    const provider = new GatewayProvider({
      url: 'ws://gateway.test',
      clientId: 'test-client',
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
      reconnectDelaysMs: [0],
    });
    provider.subscribe((event) => events.push(event));

    provider.connect();
    const first = FakeSocket.instances[0];
    first?.open();
    const hello = JSON.parse(first?.sent[0] ?? '{}');
    expect(hello).toMatchObject({ protocol: 'aht.gateway.v1', type: 'hello', client_id: 'test-client' });
    expect(hello).not.toHaveProperty('resume_after');

    first?.receive({ protocol: 'aht.gateway.v1', type: 'hello_ack', connection_id: 'conn-1', resume_supported: true });
    first?.receive({ protocol: 'aht.gateway.v1', type: 'snapshot', event_id: 'evt-1', snapshot: gatewaySnapshot });
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
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
    });
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'hello_ack', connection_id: 'conn-1', resume_supported: true });
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'snapshot', event_id: 'evt-1', snapshot: gatewaySnapshot });

    const ackPromise = provider.decide({ itemId: 'remote-approval', agentId: 'codex', decision: 'approve' });
    const command = JSON.parse(socket?.sent[1] ?? '{}');
    expect(command).toMatchObject({
      protocol: 'aht.gateway.v1', type: 'command', command: 'approve',
      target: { needs_you_id: 'remote-approval', agent_id: 'codex' },
    });
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'command_ack', command_id: command.command_id, status: 'accepted' });
    await expect(ackPromise).resolves.toMatchObject({ status: 'accepted' });
    provider.disconnect();
  });

  test('turns malformed messages into a visible provider error instead of throwing', () => {
    const events: ProviderEvent[] = [];
    const provider = new GatewayProvider({
      url: 'ws://gateway.test',
      socketFactory: (url) => new FakeSocket(url),
    });
    provider.subscribe((event) => events.push(event));
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'snapshot', snapshot: {} });

    expect(events).toContainEqual(expect.objectContaining({ type: 'error', code: 'invalid_snapshot' }));
    provider.disconnect();
  });

  test('locks decisions after a socket error instead of sending on a broken connection', async () => {
    const provider = new GatewayProvider({
      url: 'ws://gateway.test',
      clientId: 'test-client',
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
    });
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'hello_ack', connection_id: 'conn-1', resume_supported: true });
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'snapshot', event_id: 'evt-1', snapshot: gatewaySnapshot });

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
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => Date.parse('2026-08-18T03:00:31.000Z'),
      maxSnapshotAgeMs: 30_000,
    });
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'hello_ack', connection_id: 'conn-1', resume_supported: true });
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'snapshot', event_id: 'evt-1', snapshot: gatewaySnapshot });

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
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => now,
      maxSnapshotAgeMs: 30_000,
    });
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'hello_ack', connection_id: 'conn-1', resume_supported: true });
    socket?.receive({
      protocol: 'aht.gateway.v1',
      type: 'snapshot',
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
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
    });
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'hello_ack', connection_id: 'conn-1', resume_supported: true });
    socket?.receive({
      protocol: 'aht.gateway.v1',
      type: 'snapshot',
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
      socketFactory: (url) => new FakeSocket(url),
      nowFn: () => Date.parse('2026-08-18T03:00:01.000Z'),
    });
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'hello_ack', connection_id: 'conn-1', resume_supported: true });
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'snapshot', event_id: 'evt-1', snapshot: gatewaySnapshot });

    const ackPromise = provider.decide({ itemId: 'remote-approval', agentId: 'codex', decision: 'defer' });
    const commandSent = socket?.sent.some((message) => JSON.parse(message).type === 'command');
    provider.disconnect();
    await expect(ackPromise).resolves.toMatchObject({ status: 'rejected', reason: 'action_not_allowed' });
    expect(commandSent).toBe(false);
  });
});
