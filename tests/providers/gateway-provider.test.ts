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
  agents: [],
  needs_you: [],
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
    expect(events.some((event) => event.type === 'snapshot')).toBe(true);

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
    });
    provider.connect();
    const socket = FakeSocket.instances[0];
    socket?.open();
    socket?.receive({ protocol: 'aht.gateway.v1', type: 'hello_ack', connection_id: 'conn-1', resume_supported: true });

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
});
