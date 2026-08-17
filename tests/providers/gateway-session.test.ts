import { describe, expect, test } from 'vitest';
import {
  CommandLedger,
  authorizeSession,
  createReferenceSession,
  evaluateDecisionCommand,
  type GatewaySessionContext,
} from '../../src/providers/gateway/session';
import type { GatewayCommandMessage, GatewaySnapshot } from '../../src/providers/protocol';

const snapshot: GatewaySnapshot = {
  source: 'gateway', schema_version: 1, revision: 8, event_id: 'evt-08',
  generated_at: '2026-08-18T03:00:00.000Z', tenant_id: 'reference-tenant', principal_id: 'reference-user', device_id: 'device-01',
  permission_scope: ['needs_you:read', 'needs_you:write'],
  agents: [{
    id: 'codex', type: 'codex', name: 'Codex', model: 'codex', server: 'gateway', workspace: '/aht',
    session: 'session-aht', status: 'waiting_approval', current_task: '审批', elapsed_seconds: 1,
    needs_user: true, maturity: 'beta', capabilities: { approval: true },
  }],
  sessions: [{
    id: 'session-aht', agent_id: 'codex', status: 'waiting_approval', title: '审批',
    started_at: '2026-08-18T02:59:00.000Z', updated_at: '2026-08-18T03:00:00.000Z',
  }],
  needs_you: [{
    id: 'need-01', agent_id: 'codex', type: 'approval', title: '批准', detail: '批准动作', risk: 'high',
    created_at: '2026-08-18T02:59:00.000Z', status: 'pending', actions: ['approve', 'reject', 'defer'],
  }],
  servers: [], network: null,
};

const session = createReferenceSession({ clientId: 'aht-browser', deviceId: 'device-01' });

const command: GatewayCommandMessage = {
  protocol: 'aht.gateway.v1', type: 'command', message_id: 'msg-command', command_id: 'cmd-01', command: 'approve',
  target: { needs_you_id: 'need-01', agent_id: 'codex' },
  precondition: { event_id: 'evt-08', revision: 8 },
};

describe('reference Gateway session and command rules', () => {
  test('reference session is authorized only for its declared tenant/device scope', () => {
    expect(authorizeSession(session, 'device-01').status).toBe('authorized');
    expect(authorizeSession(session, 'other-device')).toMatchObject({ status: 'unauthorized', reason: 'device_mismatch' });
  });

  test('expired and incomplete sessions fail closed', () => {
    const expired: GatewaySessionContext = { ...session, expiresAt: '2026-08-18T02:59:59.000Z' };
    expect(authorizeSession(expired, 'device-01', Date.parse('2026-08-18T03:00:00.000Z'))).toMatchObject({
      status: 'unauthorized', reason: 'session_expired',
    });
    expect(authorizeSession({ ...session, principalId: null }, 'device-01')).toMatchObject({
      status: 'pairing_required', reason: 'principal_missing',
    });
  });

  test('command precondition rejects a changed snapshot before policy execution', () => {
    const result = evaluateDecisionCommand(command, session, { ...snapshot, revision: 9, event_id: 'evt-09' });
    expect(result).toMatchObject({ allowed: false, reason: 'stale_target', retryable: true, audit: null });
  });

  test('valid command returns an auditable decision evaluation', () => {
    const result = evaluateDecisionCommand(command, session, snapshot);
    expect(result).toMatchObject({ allowed: true, reason: null, retryable: false });
    expect(result.audit).toEqual({
      tenant_id: 'reference-tenant', principal_id: 'reference-user', device_id: 'device-01', session_id: 'reference-session',
      command_id: 'cmd-01', source_event_id: 'evt-08', source_revision: 8,
    });
  });

  test('authorization, scope, target, action and policy checks fail closed', () => {
    expect(evaluateDecisionCommand(command, { ...session, deviceId: 'other-device' }, snapshot).reason).toBe('unauthorized');
    expect(evaluateDecisionCommand(command, { ...session, permissionScope: ['needs_you:read'] }, snapshot).reason).toBe('permission_denied');
    expect(evaluateDecisionCommand({ ...command, target: { ...command.target, needs_you_id: 'missing' } }, session, snapshot).reason).toBe('invalid_target');
    expect(evaluateDecisionCommand({ ...command, target: { ...command.target, agent_id: 'other-agent' } }, session, snapshot).reason).toBe('invalid_target');
    expect(evaluateDecisionCommand({ ...command, command: 'defer' }, session, {
      ...snapshot, needs_you: snapshot.needs_you.map((item) => ({ ...item, actions: ['approve', 'reject'] })),
    }).reason).toBe('action_not_allowed');
    expect(evaluateDecisionCommand(command, session, {
      ...snapshot, needs_you: snapshot.needs_you.map((item) => ({ ...item, status: 'approved' })),
    }).reason).toBe('policy_denied');
  });

  test('same command id returns the original result and a changed fingerprint is a conflict', () => {
    const ledger = new CommandLedger();
    const first = ledger.recordAccepted(command, 'evt-09');
    expect(ledger.lookup(command.command_id)).toEqual(first);
    expect(ledger.recordAccepted(command, 'evt-09')).toEqual(first);
    expect(ledger.matches(command)).toBe(true);
    expect(ledger.matches({ ...command, command: 'reject' })).toBe(false);
  });

  test('rejected commands are retained for deterministic duplicate readback', () => {
    const ledger = new CommandLedger();
    const rejected = ledger.recordRejected(command, 'stale_target');
    expect(rejected).toMatchObject({ commandId: 'cmd-01', status: 'rejected', reason: 'stale_target', retryable: true });
    expect(ledger.lookup('cmd-01')).toEqual(rejected);
  });
});
