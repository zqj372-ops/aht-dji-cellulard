import type {
  GatewayAgent,
  GatewayAgentMaturity,
  GatewayAgentStatus,
  GatewayAuditActor,
  GatewayAuth,
  GatewayErrorDetails,
  GatewayEvent,
  GatewayEventAudit,
  GatewayNeedsYou,
  GatewayNetwork,
  GatewayProtocolErrorCode,
  GatewayServer,
  GatewaySession,
  GatewaySessionStatus,
  GatewaySnapshot,
  ProtocolErrorMessage,
} from './protocol';

export interface ProtocolIssue {
  path: string;
  code: string;
  message: string;
}

export function protocolError(
  code: GatewayProtocolErrorCode,
  message: string,
  path?: string,
): ProtocolErrorMessage {
  return {
    type: 'protocol_error',
    code,
    message,
    ...(path ? { details: { path } } : {}),
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isIsoTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || isNonEmptyString(value);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => isNonEmptyString(item));
}

export function isPermissionScopeArray(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.every((item) => typeof item === 'string' && /^[a-z][a-z0-9_.-]*:[a-z][a-z0-9_.-]*$/.test(item));
}

function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'boolean');
}

function isAgentStatus(value: unknown): value is GatewayAgentStatus {
  return value === 'idle'
    || value === 'running'
    || value === 'waiting_input'
    || value === 'waiting_approval'
    || value === 'completed'
    || value === 'error'
    || value === 'disconnected';
}

function isSessionStatus(value: unknown): value is GatewaySessionStatus {
  return isAgentStatus(value);
}

function isAgentMaturity(value: unknown): value is GatewayAgentMaturity {
  return value === 'stable'
    || value === 'beta'
    || value === 'developer_preview'
    || value === 'generic'
    || value === 'unavailable'
    || value === 'planned';
}

export function isGatewayAgent(value: unknown): value is GatewayAgent {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.type)
    && isNonEmptyString(value.name)
    && (value.model === null || isNonEmptyString(value.model))
    && (value.server === null || isNonEmptyString(value.server))
    && (value.workspace === null || isNonEmptyString(value.workspace))
    && (value.session === null || isNonEmptyString(value.session))
    && isAgentStatus(value.status)
    && (value.current_task === null || isNonEmptyString(value.current_task))
    && (value.elapsed_seconds === null || (typeof value.elapsed_seconds === 'number' && value.elapsed_seconds >= 0))
    && typeof value.needs_user === 'boolean'
    && isAgentMaturity(value.maturity)
    && isBooleanRecord(value.capabilities);
}

export function isGatewaySession(value: unknown): value is GatewaySession {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.agent_id)
    && isSessionStatus(value.status)
    && isNonEmptyString(value.title)
    && isIsoTimestamp(value.started_at)
    && isIsoTimestamp(value.updated_at);
}

function isNeedsYouType(value: unknown): boolean {
  return value === 'approval'
    || value === 'question'
    || value === 'error'
    || value === 'completed'
    || value === 'security'
    || value === 'server_alert';
}

function isRisk(value: unknown): boolean {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isNeedsYouStatus(value: unknown): boolean {
  return value === 'pending' || value === 'approved' || value === 'rejected' || value === 'deferred';
}

function isDecision(value: unknown): boolean {
  return value === 'approve' || value === 'reject' || value === 'defer';
}

export function isGatewayNeedsYou(value: unknown): value is GatewayNeedsYou {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.agent_id)
    && isNeedsYouType(value.type)
    && isNonEmptyString(value.title)
    && isNonEmptyString(value.detail)
    && isRisk(value.risk)
    && isIsoTimestamp(value.created_at)
    && isNeedsYouStatus(value.status)
    && Array.isArray(value.actions)
    && value.actions.length > 0
    && value.actions.every(isDecision);
}

function isServiceStatus(value: unknown): boolean {
  return value === 'healthy' || value === 'degraded' || value === 'offline' || value === 'unknown';
}

export function isGatewayServer(value: unknown): value is GatewayServer {
  if (!isRecord(value) || !isRecord(value.services)) return false;
  return isNonEmptyString(value.id)
    && isNonEmptyString(value.name)
    && typeof value.online === 'boolean'
    && (value.rtt_ms === null || (typeof value.rtt_ms === 'number' && value.rtt_ms >= 0))
    && (value.cpu_percent === null || (typeof value.cpu_percent === 'number' && value.cpu_percent >= 0))
    && (value.memory_percent === null || (typeof value.memory_percent === 'number' && value.memory_percent >= 0))
    && (value.disk_percent === null || (typeof value.disk_percent === 'number' && value.disk_percent >= 0))
    && (value.load === null || (typeof value.load === 'number' && value.load >= 0))
    && Object.values(value.services).every(isServiceStatus)
    && isNonNegativeInteger(value.agents);
}

export function isGatewayNetwork(value: unknown): value is GatewayNetwork {
  if (!isRecord(value)) return false;
  return (value.link === 'Wi-Fi' || value.link === '4G' || value.link === 'offline')
    && (value.rtt_ms === null || (typeof value.rtt_ms === 'number' && value.rtt_ms >= 0))
    && typeof value.vpn === 'boolean';
}

export function isGatewaySnapshot(value: unknown): value is GatewaySnapshot {
  if (!isRecord(value)) return false;
  return value.source === 'gateway'
    && value.schema_version === 1
    && isNonNegativeInteger(value.revision)
    && isNonEmptyString(value.event_id)
    && isIsoTimestamp(value.generated_at)
    && isNonEmptyString(value.tenant_id)
    && isNonEmptyString(value.principal_id)
    && isNonEmptyString(value.device_id)
    && isPermissionScopeArray(value.permission_scope)
    && Array.isArray(value.agents)
    && value.agents.every(isGatewayAgent)
    && Array.isArray(value.sessions)
    && value.sessions.every(isGatewaySession)
    && Array.isArray(value.needs_you)
    && value.needs_you.every(isGatewayNeedsYou)
    && Array.isArray(value.servers)
    && value.servers.every(isGatewayServer)
    && (value.network === null || isGatewayNetwork(value.network));
}

export function isGatewayAuditActor(value: unknown): value is GatewayAuditActor {
  return isRecord(value)
    && (value.kind === 'user' || value.kind === 'agent' || value.kind === 'system')
    && isNonEmptyString(value.id);
}

export function isGatewayEventAudit(value: unknown): value is GatewayEventAudit {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.tenant_id)
    && isNonEmptyString(value.principal_id)
    && isNonEmptyString(value.device_id)
    && isNonEmptyString(value.session_id)
    && isNullableString(value.command_id)
    && isNullableString(value.source_event_id)
    && (value.source_revision === null || isNonNegativeInteger(value.source_revision));
}

export function isGatewayEvent(value: unknown): value is GatewayEvent {
  if (!isRecord(value) || !isNonEmptyString(value.type)) return false;
  switch (value.type) {
    case 'needs_you_created':
    case 'needs_you_updated':
      return isGatewayNeedsYou(value.item);
    case 'needs_you_resolved':
      return isNonEmptyString(value.needs_you_id)
        && isNeedsYouStatus(value.status)
        && isNullableString(value.command_id);
    case 'agent_updated':
      return isGatewayAgent(value.agent);
    case 'session_updated':
      return isGatewaySession(value.session);
    case 'server_updated':
      return isGatewayServer(value.server);
    case 'permission_updated':
      return isPermissionScopeArray(value.permission_scope);
    default:
      return false;
  }
}

export function isGatewayAuth(value: unknown): value is GatewayAuth {
  return isRecord(value)
    && (value.mode === 'paired_session' || value.mode === 'pairing_ref' || value.mode === 'reference')
    && isNonEmptyString(value.credential_ref);
}

export function isGatewayErrorCode(value: unknown): value is GatewayProtocolErrorCode {
  return value === 'invalid_message'
    || value === 'invalid_protocol'
    || value === 'unknown_type'
    || value === 'invalid_snapshot'
    || value === 'invalid_event'
    || value === 'unauthorized'
    || value === 'pairing_required'
    || value === 'permission_denied'
    || value === 'stale_target'
    || value === 'invalid_target'
    || value === 'action_not_allowed'
    || value === 'duplicate_command'
    || value === 'policy_denied'
    || value === 'resync_required'
    || value === 'server_unavailable';
}

export function isErrorDetails(value: unknown): value is GatewayErrorDetails {
  return isRecord(value) && Object.values(value).every((item) => (
    item === null || typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean'
  ));
}
