import type { Decision, FixtureState } from '../app/types';

export type DataSource = 'fixture' | 'gateway';
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

export type SnapshotFreshness = 'fresh' | 'stale' | 'unknown';

export interface SnapshotTrust {
  source: DataSource;
  eventId: string | null;
  revision: number | null;
  generatedAt: string | null;
  receivedAt: string | null;
  freshness: SnapshotFreshness;
  staleReason: string | null;
  permissionScope: string[];
}

export type DecisionGateReason =
  | 'gateway_not_connected'
  | 'gateway_snapshot_unavailable'
  | 'gateway_snapshot_stale'
  | 'permission_denied';

export interface DecisionGate {
  allowed: boolean;
  reason: DecisionGateReason | null;
}

export interface DecisionCommand {
  itemId: string;
  agentId: string;
  decision: Decision;
}

export interface CommandAck {
  commandId: string;
  status: 'accepted' | 'rejected' | 'duplicate';
  reason?: string;
}

export type ProviderEvent =
  | { type: 'connection'; state: ConnectionState; reason?: string }
  | { type: 'snapshot'; snapshot: FixtureState; snapshotTrust: SnapshotTrust; eventId?: string; stale?: boolean }
  | { type: 'command_ack'; ack: CommandAck }
  | { type: 'error'; code: string; message: string; retryable: boolean };

export interface AhtProvider {
  readonly source: DataSource;
  subscribe(listener: (event: ProviderEvent) => void): () => void;
  connect(): void;
  disconnect(): void;
  decide(command: DecisionCommand): Promise<CommandAck>;
}
