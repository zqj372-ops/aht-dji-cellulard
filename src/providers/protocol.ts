export const gatewayProtocol = 'aht.gateway.v1' as const;

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

export interface GatewayNeedsYou {
  id: string;
  agent_id: string;
  type: 'approval' | 'question' | 'error' | 'completed' | 'security' | 'server_alert';
  title: string;
  detail: string;
  risk: 'low' | 'medium' | 'high';
  created_at: string;
  status: 'pending' | 'approved' | 'rejected' | 'deferred';
  actions: Array<'approve' | 'reject' | 'defer'>;
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

export interface GatewaySnapshot {
  schema_version: 1;
  revision: number;
  event_id: string;
  agents: GatewayAgent[];
  needs_you: GatewayNeedsYou[];
  servers: GatewayServer[];
  network: GatewayNetwork | null;
}

export interface GatewayHelloAckMessage {
  protocol: typeof gatewayProtocol;
  type: 'hello_ack';
  connection_id: string;
  resume_supported: boolean;
}

export interface GatewaySnapshotMessage {
  protocol: typeof gatewayProtocol;
  type: 'snapshot';
  event_id: string;
  snapshot: GatewaySnapshot;
}

export interface GatewayEventMessage {
  protocol: typeof gatewayProtocol;
  type: 'event';
  event_id: string;
  revision: number;
  event: GatewayEvent;
}

export type GatewayEvent =
  | { type: 'needs_you_created'; item: GatewayNeedsYou }
  | { type: 'needs_you_resolved'; needs_you_id: string; status: GatewayNeedsYou['status'] }
  | { type: 'agent_updated'; agent: GatewayAgent }
  | { type: 'server_updated'; server: GatewayServer };

export interface GatewayCommandAckMessage {
  protocol: typeof gatewayProtocol;
  type: 'command_ack';
  command_id: string;
  status: 'accepted' | 'rejected' | 'duplicate';
  reason?: string;
}

export interface GatewayResyncRequiredMessage {
  protocol: typeof gatewayProtocol;
  type: 'resync_required';
  reason: string;
}

export interface GatewayErrorMessage {
  protocol: typeof gatewayProtocol;
  type: 'error';
  code: string;
  message: string;
  retryable: boolean;
}

export type GatewayServerMessage =
  | GatewayHelloAckMessage
  | GatewaySnapshotMessage
  | GatewayEventMessage
  | GatewayCommandAckMessage
  | GatewayResyncRequiredMessage
  | GatewayErrorMessage;

export type ProtocolErrorMessage = {
  type: 'protocol_error';
  code: 'invalid_message' | 'invalid_protocol' | 'unknown_type' | 'invalid_snapshot';
  message: string;
};

export type ParsedGatewayServerMessage = GatewayServerMessage | ProtocolErrorMessage;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSnapshot(value: unknown): value is GatewaySnapshot {
  if (!isRecord(value)) return false;
  return value.schema_version === 1
    && typeof value.revision === 'number'
    && typeof value.event_id === 'string'
    && Array.isArray(value.agents)
    && Array.isArray(value.needs_you)
    && Array.isArray(value.servers)
    && (value.network === null || isRecord(value.network));
}

function protocolError(code: ProtocolErrorMessage['code'], message: string): ProtocolErrorMessage {
  return { type: 'protocol_error', code, message };
}

export function parseGatewayServerMessage(input: unknown): ParsedGatewayServerMessage {
  if (!isRecord(input)) return protocolError('invalid_message', 'Gateway message must be an object');
  if (input.protocol !== gatewayProtocol) return protocolError('invalid_protocol', 'Unsupported Gateway protocol');
  if (typeof input.type !== 'string') return protocolError('invalid_message', 'Gateway message type is required');

  if (input.type === 'snapshot') {
    if (typeof input.event_id !== 'string' || !isSnapshot(input.snapshot)) {
      return protocolError('invalid_snapshot', 'Gateway snapshot is incomplete');
    }
    return input as unknown as GatewaySnapshotMessage;
  }

  if (input.type === 'hello_ack'
    && typeof input.connection_id === 'string'
    && typeof input.resume_supported === 'boolean') {
    return input as unknown as GatewayHelloAckMessage;
  }

  if (input.type === 'command_ack'
    && typeof input.command_id === 'string'
    && (input.status === 'accepted' || input.status === 'rejected' || input.status === 'duplicate')) {
    return input as unknown as GatewayCommandAckMessage;
  }

  if (input.type === 'resync_required' && typeof input.reason === 'string') {
    return input as unknown as GatewayResyncRequiredMessage;
  }

  if (input.type === 'error'
    && typeof input.code === 'string'
    && typeof input.message === 'string'
    && typeof input.retryable === 'boolean') {
    return input as unknown as GatewayErrorMessage;
  }

  if (input.type === 'event'
    && typeof input.event_id === 'string'
    && typeof input.revision === 'number'
    && isRecord(input.event)
    && typeof input.event.type === 'string') {
    return input as unknown as GatewayEventMessage;
  }

  return protocolError('unknown_type', `Unsupported Gateway message type: ${input.type}`);
}
