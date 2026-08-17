import { describe, expect, test } from 'vitest';
import {
  encodeGatewayClientMessage,
  encodeGatewayServerMessage,
  parseGatewayClientMessage,
  parseGatewayServerMessage,
} from '../../src/providers/protocol';

const snapshot = {
  source: 'gateway' as const,
  schema_version: 1 as const,
  revision: 42,
  event_id: 'evt-42',
  generated_at: '2026-08-18T03:00:00.000Z',
  tenant_id: 'tenant-01',
  principal_id: 'user-01',
  device_id: 'device-01',
  permission_scope: ['agents:read', 'sessions:read', 'needs_you:read', 'needs_you:write'],
  agents: [{
    id: 'codex', type: 'codex', name: 'Codex', model: 'codex', server: 'tokyo-01',
    workspace: '/aht', session: 'session-codex', status: 'waiting_approval' as const,
    current_task: '生产部署审批', elapsed_seconds: 23, needs_user: true,
    maturity: 'beta' as const, capabilities: { approval: true },
  }],
  sessions: [{
    id: 'session-codex', agent_id: 'codex', status: 'waiting_approval' as const,
    title: '生产部署审批', started_at: '2026-08-18T02:59:00.000Z', updated_at: '2026-08-18T03:00:00.000Z',
  }],
  needs_you: [{
    id: 'need-01', agent_id: 'codex', type: 'approval' as const, title: '确认部署', detail: '生产部署',
    risk: 'high' as const, created_at: '2026-08-18T02:59:00.000Z', status: 'pending' as const,
    actions: ['approve', 'reject', 'defer'] as Array<'approve' | 'reject' | 'defer'>,
  }],
  servers: [{
    id: 'tokyo-01', name: 'TOKYO-01', online: true, rtt_ms: 38, cpu_percent: 21,
    memory_percent: 46, disk_percent: 62, load: 0.42,
    services: { gateway: 'healthy' as const }, agents: 1,
  }],
  network: { link: '4G' as const, rtt_ms: 38, vpn: true },
};

const audit = {
  tenant_id: 'tenant-01', principal_id: 'user-01', device_id: 'device-01', session_id: 'session-aht',
  command_id: 'cmd-01', source_event_id: 'evt-42', source_revision: 42,
};

describe('aht.gateway.v1 public protocol', () => {
  test('parses an authorized hello with a resumable session contract', () => {
    const parsed = parseGatewayClientMessage({
      protocol: 'aht.gateway.v1', type: 'hello', message_id: 'msg-hello',
      client_id: 'aht-browser', device_id: 'device-01', client_kind: 'browser',
      auth: { mode: 'reference', credential_ref: 'reference:aht' },
      resume_after: 'evt-42',
    });

    expect(parsed).toMatchObject({ type: 'hello', device_id: 'device-01', resume_after: 'evt-42' });
  });

  test('rejects an approval command without the snapshot precondition', () => {
    expect(parseGatewayClientMessage({
      protocol: 'aht.gateway.v1', type: 'command', message_id: 'msg-command',
      command_id: 'cmd-01', command: 'approve',
      target: { needs_you_id: 'need-01', agent_id: 'codex' },
    })).toEqual(expect.objectContaining({ type: 'protocol_error', code: 'invalid_message' }));
  });

  test('parses a command with an explicit target revision and event id', () => {
    const parsed = parseGatewayClientMessage({
      protocol: 'aht.gateway.v1', type: 'command', message_id: 'msg-command',
      command_id: 'cmd-01', command: 'approve',
      target: { needs_you_id: 'need-01', agent_id: 'codex' },
      precondition: { event_id: 'evt-42', revision: 42 },
    });

    expect(parsed).toMatchObject({
      type: 'command',
      command_id: 'cmd-01',
      precondition: { event_id: 'evt-42', revision: 42 },
    });
  });

  test('parses a snapshot with authority context and sessions', () => {
    const parsed = parseGatewayServerMessage({
      protocol: 'aht.gateway.v1', type: 'snapshot', message_id: 'msg-snapshot',
      event_id: 'evt-42', snapshot,
    });

    expect(parsed).toMatchObject({
      type: 'snapshot',
      snapshot: { source: 'gateway', tenant_id: 'tenant-01', principal_id: 'user-01', sessions: [{ id: 'session-codex' }] },
    });
  });

  test('parses a command ack as accepted but still waiting for the final event', () => {
    const parsed = parseGatewayServerMessage({
      protocol: 'aht.gateway.v1', type: 'command_ack', message_id: 'msg-ack',
      command_id: 'cmd-01', status: 'accepted', phase: 'pending_event',
      reason: null, final_event_id: null, retryable: false,
    });

    expect(parsed).toMatchObject({ type: 'command_ack', status: 'accepted', phase: 'pending_event' });
  });

  test('rejects an event with an unknown event union or incomplete audit context', () => {
    expect(parseGatewayServerMessage({
      protocol: 'aht.gateway.v1', type: 'event', message_id: 'msg-event',
      event_id: 'evt-43', revision: 43, generated_at: '2026-08-18T03:00:00.000Z',
      actor: { kind: 'system', id: 'gateway' },
      audit: { ...audit, session_id: '' },
      event: { type: 'unknown_event' },
    })).toEqual(expect.objectContaining({ type: 'protocol_error', code: 'invalid_event' }));
  });

  test('parses a resolved event with actor and audit context', () => {
    const parsed = parseGatewayServerMessage({
      protocol: 'aht.gateway.v1', type: 'event', message_id: 'msg-event',
      event_id: 'evt-43', revision: 43, generated_at: '2026-08-18T03:00:01.000Z',
      actor: { kind: 'user', id: 'user-01' }, audit,
      event: { type: 'needs_you_resolved', needs_you_id: 'need-01', status: 'approved', command_id: 'cmd-01' },
    });

    expect(parsed).toMatchObject({
      type: 'event',
      event_id: 'evt-43',
      audit: { command_id: 'cmd-01', source_revision: 42 },
      event: { type: 'needs_you_resolved', command_id: 'cmd-01' },
    });
  });

  test('parses every published event union without widening arbitrary records', () => {
    const auditBase = {
      tenant_id: 'tenant-01', principal_id: 'user-01', device_id: 'device-01', session_id: 'session-aht',
      command_id: null, source_event_id: 'evt-42', source_revision: 42,
    };
    const eventBodies = [
      { type: 'needs_you_created', item: snapshot.needs_you[0] },
      { type: 'needs_you_updated', item: snapshot.needs_you[0] },
      { type: 'agent_updated', agent: snapshot.agents[0] },
      { type: 'session_updated', session: snapshot.sessions[0] },
      { type: 'server_updated', server: snapshot.servers[0] },
      { type: 'permission_updated', permission_scope: ['needs_you:read'] },
    ];
    eventBodies.forEach((event, index) => {
      expect(parseGatewayServerMessage({
        protocol: 'aht.gateway.v1', type: 'event', message_id: `msg-union-${index}`,
        event_id: `evt-union-${index}`, revision: 43 + index, generated_at: '2026-08-18T03:00:01.000Z',
        actor: { kind: 'system', id: 'gateway' }, audit: auditBase, event,
      })).toMatchObject({ type: 'event', event });
    });
  });

  test('parses resync, pairing and ping/pong messages', () => {
    expect(parseGatewayServerMessage({
      protocol: 'aht.gateway.v1', type: 'resync_required', message_id: 'msg-resync',
      reason: 'event_retention_exceeded', after_revision: 42,
    })).toMatchObject({ type: 'resync_required', after_revision: 42 });

    expect(parseGatewayClientMessage({
      protocol: 'aht.gateway.v1', type: 'pairing_begin', message_id: 'msg-pairing',
      client_id: 'aht-browser', device_id: 'device-01', device_name: 'AHT Browser',
    })).toMatchObject({ type: 'pairing_begin', device_name: 'AHT Browser' });

    expect(parseGatewayClientMessage({
      protocol: 'aht.gateway.v1', type: 'ping', message_id: 'msg-ping', sent_at: '2026-08-18T03:00:00.000Z',
    })).toMatchObject({ type: 'ping' });
    expect(parseGatewayServerMessage({
      protocol: 'aht.gateway.v1', type: 'pong', message_id: 'msg-pong', request_message_id: 'msg-ping',
      server_time: '2026-08-18T03:00:00.001Z',
    })).toMatchObject({ type: 'pong', request_message_id: 'msg-ping' });
  });

  test('rejects missing message ids, invalid timestamps and negative revisions', () => {
    expect(parseGatewayClientMessage({
      protocol: 'aht.gateway.v1', type: 'ping', sent_at: 'not-a-date',
    })).toEqual(expect.objectContaining({ type: 'protocol_error', code: 'invalid_message' }));
    expect(parseGatewayServerMessage({
      protocol: 'aht.gateway.v1', type: 'snapshot', event_id: 'evt-42', message_id: 'msg-snapshot',
      snapshot: { ...snapshot, revision: -1 },
    })).toEqual(expect.objectContaining({ type: 'protocol_error', code: 'invalid_snapshot' }));
  });

  test('accepts a zero baseline revision but rejects malformed scopes and unknown error codes', () => {
    expect(parseGatewayServerMessage({
      protocol: 'aht.gateway.v1', type: 'snapshot', message_id: 'msg-zero', event_id: 'evt-zero',
      snapshot: { ...snapshot, revision: 0, event_id: 'evt-zero', permission_scope: [] },
    })).toMatchObject({ type: 'snapshot', snapshot: { revision: 0 } });
    expect(parseGatewayServerMessage({
      protocol: 'aht.gateway.v1', type: 'snapshot', message_id: 'msg-bad-scope', event_id: 'evt-42',
      snapshot: { ...snapshot, permission_scope: ['needs_you_write'] },
    })).toEqual(expect.objectContaining({ type: 'protocol_error', code: 'invalid_snapshot' }));
    expect(parseGatewayServerMessage({
      protocol: 'aht.gateway.v1', type: 'error', message_id: 'msg-error', code: 'not_a_real_code',
      message: 'bad', retryable: false, request_message_id: null, details: {},
    })).toEqual(expect.objectContaining({ type: 'protocol_error', code: 'invalid_message' }));
  });

  test('serializes only messages that pass the same strict parser', () => {
    const hello = {
      protocol: 'aht.gateway.v1' as const, type: 'hello' as const, message_id: 'msg-encode',
      client_id: 'aht-browser', device_id: 'device-01', client_kind: 'browser' as const,
      auth: { mode: 'reference' as const, credential_ref: 'reference:aht' },
    };
    expect(JSON.parse(encodeGatewayClientMessage(hello))).toEqual(hello);
    expect(JSON.parse(encodeGatewayServerMessage({
      protocol: 'aht.gateway.v1', type: 'pong', message_id: 'msg-pong', request_message_id: 'msg-ping',
      server_time: '2026-08-18T03:00:00.000Z',
    }))).toMatchObject({ type: 'pong', message_id: 'msg-pong' });
  });
});
