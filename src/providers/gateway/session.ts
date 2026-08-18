import type {
  GatewayCommandMessage,
  GatewayEventAudit,
  GatewaySnapshot,
} from '../protocol';

export type AuthorizationState = 'authorized' | 'pairing_required' | 'unauthorized';

export interface GatewaySessionContext {
  id: string;
  clientId: string;
  deviceId: string;
  principalId: string | null;
  tenantId: string | null;
  permissionScope: string[];
  expiresAt: string | null;
}

export interface DecisionEvaluation {
  allowed: boolean;
  reason: string | null;
  retryable: boolean;
  audit: GatewayEventAudit | null;
}

export interface CommandRecord {
  commandId: string;
  fingerprint: string;
  status: 'accepted' | 'rejected';
  phase: 'pending_event' | 'final' | 'not_applicable';
  reason: string | null;
  retryable: boolean;
  finalEventId: string | null;
}

const WRITE_SCOPE = 'needs_you:write';

export function createReferenceSession(input: { clientId: string; deviceId: string }): GatewaySessionContext {
  return {
    id: 'reference-session',
    clientId: input.clientId,
    deviceId: input.deviceId,
    principalId: 'reference-user',
    tenantId: 'reference-tenant',
    permissionScope: ['agents:read', 'sessions:read', 'needs_you:read', WRITE_SCOPE, 'servers:read'],
    expiresAt: null,
  };
}

export function authorizeSession(
  session: GatewaySessionContext,
  deviceId: string,
  nowMs: number = Date.now(),
): { status: AuthorizationState; reason: string | null } {
  if (session.deviceId !== deviceId) return { status: 'unauthorized', reason: 'device_mismatch' };
  if (session.expiresAt) {
    const expiresAtMs = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAtMs)) return { status: 'unauthorized', reason: 'session_invalid' };
    if (expiresAtMs <= nowMs) return { status: 'unauthorized', reason: 'session_expired' };
  }
  if (!session.tenantId) return { status: 'pairing_required', reason: 'tenant_missing' };
  if (!session.principalId) return { status: 'pairing_required', reason: 'principal_missing' };
  return { status: 'authorized', reason: null };
}

function commandFingerprint(command: GatewayCommandMessage): string {
  return JSON.stringify({
    command: command.command,
    target: command.target,
    precondition: command.precondition,
  });
}

function retryableReason(reason: string): boolean {
  return reason === 'stale_target'
    || reason === 'gateway_unavailable'
    || reason === 'server_unavailable'
    || reason === 'resync_required';
}

export function evaluateDecisionCommand(
  command: GatewayCommandMessage,
  session: GatewaySessionContext,
  snapshot: GatewaySnapshot,
  nowMs: number = Date.now(),
): DecisionEvaluation {
  const authorization = authorizeSession(session, snapshot.device_id, nowMs);
  if (authorization.status !== 'authorized') {
    return {
      allowed: false,
      reason: authorization.status === 'pairing_required' ? 'pairing_required' : 'unauthorized',
      retryable: false,
      audit: null,
    };
  }
  if (session.tenantId !== snapshot.tenant_id || session.principalId !== snapshot.principal_id) {
    return { allowed: false, reason: 'unauthorized', retryable: false, audit: null };
  }
  if (!session.permissionScope.includes(WRITE_SCOPE) || !snapshot.permission_scope.includes(WRITE_SCOPE)) {
    return { allowed: false, reason: 'permission_denied', retryable: false, audit: null };
  }
  if (command.precondition.event_id !== snapshot.event_id || command.precondition.revision !== snapshot.revision) {
    return { allowed: false, reason: 'stale_target', retryable: true, audit: null };
  }

  const target = snapshot.needs_you.find((item) => item.id === command.target.needs_you_id);
  if (!target || target.agent_id !== command.target.agent_id) {
    return { allowed: false, reason: 'invalid_target', retryable: false, audit: null };
  }
  if (target.status !== 'pending') {
    return { allowed: false, reason: 'policy_denied', retryable: false, audit: null };
  }
  if (!target.actions.includes(command.command)) {
    return { allowed: false, reason: 'action_not_allowed', retryable: false, audit: null };
  }

  return {
    allowed: true,
    reason: null,
    retryable: false,
    audit: {
      tenant_id: snapshot.tenant_id,
      principal_id: snapshot.principal_id,
      device_id: snapshot.device_id,
      session_id: session.id,
      command_id: command.command_id,
      source_event_id: snapshot.event_id,
      source_revision: snapshot.revision,
    },
  };
}

export class CommandLedger {
  private readonly records = new Map<string, CommandRecord>();

  lookup(commandId: string): CommandRecord | null {
    return this.records.get(commandId) ?? null;
  }

  matches(command: GatewayCommandMessage): boolean {
    const record = this.records.get(command.command_id);
    return record ? record.fingerprint === commandFingerprint(command) : false;
  }

  recordAccepted(command: GatewayCommandMessage, finalEventId: string | null): CommandRecord {
    const existing = this.records.get(command.command_id);
    if (existing) {
      if (existing.fingerprint !== commandFingerprint(command)) throw new Error('command_id_conflict');
      return existing;
    }
    const record: CommandRecord = {
      commandId: command.command_id,
      fingerprint: commandFingerprint(command),
      status: 'accepted',
      phase: finalEventId ? 'final' : 'pending_event',
      reason: null,
      retryable: false,
      finalEventId,
    };
    this.records.set(command.command_id, record);
    return record;
  }

  recordFinal(commandId: string, finalEventId: string): CommandRecord | null {
    const existing = this.records.get(commandId);
    if (!existing) return null;
    const record = { ...existing, phase: 'final' as const, finalEventId };
    this.records.set(commandId, record);
    return record;
  }

  recordRejected(command: GatewayCommandMessage, reason: string): CommandRecord {
    const existing = this.records.get(command.command_id);
    if (existing) {
      if (existing.fingerprint !== commandFingerprint(command)) throw new Error('command_id_conflict');
      return existing;
    }
    const record: CommandRecord = {
      commandId: command.command_id,
      fingerprint: commandFingerprint(command),
      status: 'rejected',
      phase: 'not_applicable',
      reason,
      retryable: retryableReason(reason),
      finalEventId: null,
    };
    this.records.set(command.command_id, record);
    return record;
  }
}
