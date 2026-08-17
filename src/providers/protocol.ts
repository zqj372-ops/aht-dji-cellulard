import {
  isErrorDetails,
  isGatewayAgent,
  isGatewayAuth,
  isGatewayEvent,
  isGatewayEventAudit,
  isGatewayErrorCode,
  isGatewaySnapshot,
  isGatewayServer,
  isGatewaySession,
  isGatewayNeedsYou,
  isIsoTimestamp,
  isNonEmptyString,
  isNonNegativeInteger,
  isRecord,
  isStringArray,
  isPermissionScopeArray,
  protocolError,
} from './protocolValidation';

export const gatewayProtocol = 'aht.gateway.v1' as const;
export const gatewaySchemaVersion = 1 as const;

export type GatewayProtocolErrorCode =
  | 'invalid_message'
  | 'invalid_protocol'
  | 'unknown_type'
  | 'invalid_snapshot'
  | 'invalid_event'
  | 'unauthorized'
  | 'pairing_required'
  | 'permission_denied'
  | 'stale_target'
  | 'invalid_target'
  | 'action_not_allowed'
  | 'duplicate_command'
  | 'policy_denied'
  | 'resync_required'
  | 'server_unavailable';

export interface GatewayEnvelope {
  protocol: typeof gatewayProtocol;
  type: string;
  message_id: string;
}

export type GatewayAgentStatus =
  | 'idle'
  | 'running'
  | 'waiting_input'
  | 'waiting_approval'
  | 'completed'
  | 'error'
  | 'disconnected';

export type GatewayAgentMaturity =
  | 'stable'
  | 'beta'
  | 'developer_preview'
  | 'generic'
  | 'unavailable'
  | 'planned';

export interface GatewayAgent {
  id: string;
  type: string;
  name: string;
  model: string | null;
  server: string | null;
  workspace: string | null;
  session: string | null;
  status: GatewayAgentStatus;
  current_task: string | null;
  elapsed_seconds: number | null;
  needs_user: boolean;
  maturity: GatewayAgentMaturity;
  capabilities: Record<string, boolean>;
}

export type GatewayNeedsYouType =
  | 'approval'
  | 'question'
  | 'error'
  | 'completed'
  | 'security'
  | 'server_alert';

export type GatewayNeedsYouStatus = 'pending' | 'approved' | 'rejected' | 'deferred';
export type GatewayDecision = 'approve' | 'reject' | 'defer';

export interface GatewayNeedsYou {
  id: string;
  agent_id: string;
  type: GatewayNeedsYouType;
  title: string;
  detail: string;
  risk: 'low' | 'medium' | 'high';
  created_at: string;
  status: GatewayNeedsYouStatus;
  actions: GatewayDecision[];
}

export interface GatewayServer {
  id: string;
  name: string;
  online: boolean;
  rtt_ms: number | null;
  cpu_percent: number | null;
  memory_percent: number | null;
  disk_percent: number | null;
  load: number | null;
  services: Record<string, 'healthy' | 'degraded' | 'offline' | 'unknown'>;
  agents: number;
}

export interface GatewayNetwork {
  link: 'Wi-Fi' | '4G' | 'offline';
  rtt_ms: number | null;
  vpn: boolean;
}

export type GatewaySessionStatus = GatewayAgentStatus;

export interface GatewaySession {
  id: string;
  agent_id: string;
  status: GatewaySessionStatus;
  title: string;
  started_at: string;
  updated_at: string;
}

export interface GatewaySnapshot {
  source: 'gateway';
  schema_version: typeof gatewaySchemaVersion;
  revision: number;
  event_id: string;
  generated_at: string;
  tenant_id: string;
  principal_id: string;
  device_id: string;
  permission_scope: string[];
  agents: GatewayAgent[];
  sessions: GatewaySession[];
  needs_you: GatewayNeedsYou[];
  servers: GatewayServer[];
  network: GatewayNetwork | null;
}

export type GatewayClientKind = 'browser' | 'native';

export interface GatewayAuth {
  mode: 'paired_session' | 'pairing_ref' | 'reference';
  credential_ref: string;
}

export interface GatewayHelloMessage extends GatewayEnvelope {
  type: 'hello';
  client_id: string;
  device_id: string;
  client_kind: GatewayClientKind;
  auth?: GatewayAuth;
  resume_after?: string;
}

export interface GatewayCommandMessage extends GatewayEnvelope {
  type: 'command';
  command_id: string;
  command: GatewayDecision;
  target: { needs_you_id: string; agent_id: string };
  precondition: { event_id: string; revision: number };
}

export interface GatewayPairingBeginMessage extends GatewayEnvelope {
  type: 'pairing_begin';
  client_id: string;
  device_id: string;
  device_name: string;
}

export interface GatewayPairingConfirmMessage extends GatewayEnvelope {
  type: 'pairing_confirm';
  pairing_id: string;
  code: string;
}

export type GatewayClientPairingMessage = GatewayPairingBeginMessage | GatewayPairingConfirmMessage;

export interface GatewayPingMessage extends GatewayEnvelope {
  type: 'ping';
  sent_at: string;
}

export type GatewayClientMessage = GatewayHelloMessage | GatewayCommandMessage | GatewayClientPairingMessage | GatewayPingMessage;

export type GatewayAuthorizationStatus = 'authorized' | 'pairing_required' | 'unauthorized';

export interface GatewaySessionInfo {
  id: string;
  principal_id: string | null;
  tenant_id: string | null;
  device_id: string;
  expires_at: string | null;
}

export interface GatewayAuthorization {
  status: GatewayAuthorizationStatus;
  permission_scope: string[];
  reason: string | null;
}

export interface GatewayHelloAckMessage extends GatewayEnvelope {
  type: 'hello_ack';
  connection_id: string;
  session: GatewaySessionInfo;
  authorization: GatewayAuthorization;
  server_time: string;
  resume_supported: boolean;
  capabilities: string[];
}

export interface GatewaySnapshotMessage extends GatewayEnvelope {
  type: 'snapshot';
  event_id: string;
  snapshot: GatewaySnapshot;
}

export interface GatewayAuditActor {
  kind: 'user' | 'agent' | 'system';
  id: string;
}

export interface GatewayEventAudit {
  tenant_id: string;
  principal_id: string;
  device_id: string;
  session_id: string;
  command_id: string | null;
  source_event_id: string | null;
  source_revision: number | null;
}

export type GatewayEvent =
  | { type: 'needs_you_created'; item: GatewayNeedsYou }
  | { type: 'needs_you_updated'; item: GatewayNeedsYou }
  | { type: 'needs_you_resolved'; needs_you_id: string; status: GatewayNeedsYouStatus; command_id: string | null }
  | { type: 'agent_updated'; agent: GatewayAgent }
  | { type: 'session_updated'; session: GatewaySession }
  | { type: 'server_updated'; server: GatewayServer }
  | { type: 'permission_updated'; permission_scope: string[] };

export interface GatewayEventMessage extends GatewayEnvelope {
  type: 'event';
  event_id: string;
  revision: number;
  generated_at: string;
  actor: GatewayAuditActor;
  audit: GatewayEventAudit;
  event: GatewayEvent;
}

export type GatewayCommandAckStatus = 'accepted' | 'rejected' | 'duplicate';
export type GatewayCommandAckPhase = 'pending_event' | 'final' | 'not_applicable';

export interface GatewayCommandAckMessage extends GatewayEnvelope {
  type: 'command_ack';
  command_id: string;
  status: GatewayCommandAckStatus;
  phase: GatewayCommandAckPhase;
  reason: string | null;
  final_event_id: string | null;
  retryable: boolean;
}

export interface GatewayPairingChallengeMessage extends GatewayEnvelope {
  type: 'pairing_challenge';
  pairing_id: string;
  expires_at: string;
  display_code: string;
}

export interface GatewayPairingResultMessage extends GatewayEnvelope {
  type: 'pairing_result';
  pairing_id: string;
  status: 'paired' | 'rejected';
  credential_ref: string | null;
  reason: string | null;
}

export type GatewayServerPairingMessage = GatewayPairingChallengeMessage | GatewayPairingResultMessage;
export type GatewayPairingMessage = GatewayClientPairingMessage | GatewayServerPairingMessage;

export interface GatewayResyncRequiredMessage extends GatewayEnvelope {
  type: 'resync_required';
  reason: string;
  after_revision: number;
}

export type GatewayErrorDetails = Record<string, string | number | boolean | null>;

export interface GatewayErrorMessage extends GatewayEnvelope {
  type: 'error';
  code: GatewayProtocolErrorCode;
  message: string;
  retryable: boolean;
  request_message_id: string | null;
  details: GatewayErrorDetails;
}

export interface GatewayPongMessage extends GatewayEnvelope {
  type: 'pong';
  request_message_id: string;
  server_time: string;
}

export type GatewayServerMessage =
  | GatewayHelloAckMessage
  | GatewaySnapshotMessage
  | GatewayEventMessage
  | GatewayCommandAckMessage
  | GatewayServerPairingMessage
  | GatewayResyncRequiredMessage
  | GatewayErrorMessage
  | GatewayPongMessage;

export interface ProtocolErrorMessage {
  type: 'protocol_error';
  code: GatewayProtocolErrorCode;
  message: string;
  details?: { path?: string };
}

export type ParsedGatewayClientMessage = GatewayClientMessage | ProtocolErrorMessage;
export type ParsedGatewayServerMessage = GatewayServerMessage | ProtocolErrorMessage;

function parseEnvelope(input: unknown): ProtocolErrorMessage | null {
  if (!isRecord(input)) return protocolError('invalid_message', 'Gateway message must be an object');
  if (input.protocol !== gatewayProtocol) return protocolError('invalid_protocol', 'Unsupported Gateway protocol');
  if (!isNonEmptyString(input.type)) return protocolError('invalid_message', 'Gateway message type is required', 'type');
  if (!isNonEmptyString(input.message_id)) return protocolError('invalid_message', 'Gateway message_id is required', 'message_id');
  return null;
}

function isSessionInfo(value: unknown): value is GatewaySessionInfo {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id)
    && (value.principal_id === null || isNonEmptyString(value.principal_id))
    && (value.tenant_id === null || isNonEmptyString(value.tenant_id))
    && isNonEmptyString(value.device_id)
    && (value.expires_at === null || isIsoTimestamp(value.expires_at));
}

function isAuthorization(value: unknown): value is GatewayAuthorization {
  if (!isRecord(value)) return false;
  return (value.status === 'authorized' || value.status === 'pairing_required' || value.status === 'unauthorized')
    && isPermissionScopeArray(value.permission_scope)
    && (value.reason === null || isNonEmptyString(value.reason));
}

function isAuditActor(value: unknown): value is GatewayAuditActor {
  return isRecord(value)
    && (value.kind === 'user' || value.kind === 'agent' || value.kind === 'system')
    && isNonEmptyString(value.id);
}

function isCommandAckStatus(value: unknown): value is GatewayCommandAckStatus {
  return value === 'accepted' || value === 'rejected' || value === 'duplicate';
}

function isCommandAckPhase(value: unknown): value is GatewayCommandAckPhase {
  return value === 'pending_event' || value === 'final' || value === 'not_applicable';
}

export function parseGatewayClientMessage(input: unknown): ParsedGatewayClientMessage {
  const envelopeError = parseEnvelope(input);
  if (envelopeError) return envelopeError;
  if (!isRecord(input)) return protocolError('invalid_message', 'Gateway message must be an object');

  if (input.type === 'hello') {
    if (!isNonEmptyString(input.client_id)
      || !isNonEmptyString(input.device_id)
      || (input.client_kind !== 'browser' && input.client_kind !== 'native')
      || (input.auth !== undefined && !isGatewayAuth(input.auth))
      || (input.resume_after !== undefined && !isNonEmptyString(input.resume_after))) {
      return protocolError('invalid_message', 'Gateway hello is incomplete', 'hello');
    }
    return input as unknown as GatewayHelloMessage;
  }

  if (input.type === 'command') {
    if (!isNonEmptyString(input.command_id)
      || (input.command !== 'approve' && input.command !== 'reject' && input.command !== 'defer')
      || !isRecord(input.target)
      || !isNonEmptyString(input.target.needs_you_id)
      || !isNonEmptyString(input.target.agent_id)
      || !isRecord(input.precondition)
      || !isNonEmptyString(input.precondition.event_id)
      || !isNonNegativeInteger(input.precondition.revision)) {
      return protocolError('invalid_message', 'Gateway command is incomplete', 'command');
    }
    return input as unknown as GatewayCommandMessage;
  }

  if (input.type === 'pairing_begin') {
    if (!isNonEmptyString(input.client_id) || !isNonEmptyString(input.device_id) || !isNonEmptyString(input.device_name)) {
      return protocolError('invalid_message', 'Gateway pairing_begin is incomplete', 'pairing_begin');
    }
    return input as unknown as GatewayPairingBeginMessage;
  }

  if (input.type === 'pairing_confirm') {
    if (!isNonEmptyString(input.pairing_id) || !isNonEmptyString(input.code)) {
      return protocolError('invalid_message', 'Gateway pairing_confirm is incomplete', 'pairing_confirm');
    }
    return input as unknown as GatewayPairingConfirmMessage;
  }

  if (input.type === 'ping') {
    if (!isIsoTimestamp(input.sent_at)) return protocolError('invalid_message', 'Gateway ping sent_at is invalid', 'sent_at');
    return input as unknown as GatewayPingMessage;
  }

  return protocolError('unknown_type', `Unsupported Gateway client message type: ${input.type}`);
}

export function parseGatewayServerMessage(input: unknown): ParsedGatewayServerMessage {
  const envelopeError = parseEnvelope(input);
  if (envelopeError) return envelopeError;
  if (!isRecord(input)) return protocolError('invalid_message', 'Gateway message must be an object');

  if (input.type === 'hello_ack') {
    if (!isNonEmptyString(input.connection_id)
      || !isSessionInfo(input.session)
      || !isAuthorization(input.authorization)
      || !isIsoTimestamp(input.server_time)
      || typeof input.resume_supported !== 'boolean'
      || !isStringArray(input.capabilities)) {
      return protocolError('invalid_message', 'Gateway hello_ack is incomplete', 'hello_ack');
    }
    if (input.authorization.status === 'authorized'
      && (input.session.principal_id === null || input.session.tenant_id === null)) {
      return protocolError('invalid_message', 'Authorized Gateway session must include principal and tenant', 'hello_ack.session');
    }
    return input as unknown as GatewayHelloAckMessage;
  }

  if (input.type === 'snapshot') {
    if (!isNonEmptyString(input.event_id) || !isGatewaySnapshot(input.snapshot) || input.event_id !== input.snapshot.event_id) {
      return protocolError('invalid_snapshot', 'Gateway snapshot is incomplete or inconsistent', 'snapshot');
    }
    return input as unknown as GatewaySnapshotMessage;
  }

  if (input.type === 'event') {
    if (!isNonEmptyString(input.event_id)
      || !isNonNegativeInteger(input.revision)
      || !isIsoTimestamp(input.generated_at)
      || !isAuditActor(input.actor)
      || !isGatewayEventAudit(input.audit)
      || !isGatewayEvent(input.event)) {
      return protocolError('invalid_event', 'Gateway event is incomplete or unknown', 'event');
    }
    return input as unknown as GatewayEventMessage;
  }

  if (input.type === 'command_ack') {
    if (!isNonEmptyString(input.command_id)
      || !isCommandAckStatus(input.status)
      || !isCommandAckPhase(input.phase)
      || (input.reason !== null && !isNonEmptyString(input.reason))
      || (input.final_event_id !== null && !isNonEmptyString(input.final_event_id))
      || typeof input.retryable !== 'boolean') {
      return protocolError('invalid_message', 'Gateway command_ack is incomplete', 'command_ack');
    }
    return input as unknown as GatewayCommandAckMessage;
  }

  if (input.type === 'pairing_challenge') {
    if (!isNonEmptyString(input.pairing_id) || !isIsoTimestamp(input.expires_at) || !isNonEmptyString(input.display_code)) {
      return protocolError('invalid_message', 'Gateway pairing_challenge is incomplete', 'pairing_challenge');
    }
    return input as unknown as GatewayPairingChallengeMessage;
  }

  if (input.type === 'pairing_result') {
    if (!isNonEmptyString(input.pairing_id)
      || (input.status !== 'paired' && input.status !== 'rejected')
      || (input.credential_ref !== null && !isNonEmptyString(input.credential_ref))
      || (input.reason !== null && !isNonEmptyString(input.reason))) {
      return protocolError('invalid_message', 'Gateway pairing_result is incomplete', 'pairing_result');
    }
    return input as unknown as GatewayPairingResultMessage;
  }

  if (input.type === 'resync_required') {
    if (!isNonEmptyString(input.reason) || !isNonNegativeInteger(input.after_revision)) {
      return protocolError('invalid_message', 'Gateway resync_required is incomplete', 'resync_required');
    }
    return input as unknown as GatewayResyncRequiredMessage;
  }

  if (input.type === 'error') {
    if (!isGatewayErrorCode(input.code)
      || !isNonEmptyString(input.message)
      || typeof input.retryable !== 'boolean'
      || (input.request_message_id !== null && !isNonEmptyString(input.request_message_id))
      || !isErrorDetails(input.details)) {
      return protocolError('invalid_message', 'Gateway error is incomplete', 'error');
    }
    return input as unknown as GatewayErrorMessage;
  }

  if (input.type === 'pong') {
    if (!isNonEmptyString(input.request_message_id) || !isIsoTimestamp(input.server_time)) {
      return protocolError('invalid_message', 'Gateway pong is incomplete', 'pong');
    }
    return input as unknown as GatewayPongMessage;
  }

  return protocolError('unknown_type', `Unsupported Gateway server message type: ${input.type}`);
}

export function encodeGatewayClientMessage(message: GatewayClientMessage): string {
  const parsed = parseGatewayClientMessage(message);
  if (parsed.type === 'protocol_error') throw new Error(`${parsed.code}: ${parsed.message}`);
  return JSON.stringify(parsed);
}

export function encodeGatewayServerMessage(message: GatewayServerMessage): string {
  const parsed = parseGatewayServerMessage(message);
  if (parsed.type === 'protocol_error') throw new Error(`${parsed.code}: ${parsed.message}`);
  return JSON.stringify(parsed);
}
