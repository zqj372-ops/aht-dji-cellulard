import type { Decision, FixtureState } from '../app/types';

export type DataSource = 'fixture' | 'gateway';
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'pairing_required'
  | 'unauthorized'
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
  | 'gateway_not_authorized'
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
  phase: 'pending_event' | 'final' | 'not_applicable';
  reason: string | null;
  finalEventId: string | null;
  retryable: boolean;
}

export type AuthorizationState = 'authorized' | 'pairing_required' | 'unauthorized';

export interface ProviderAuthorization {
  status: AuthorizationState;
  sessionId: string | null;
  principalId: string | null;
  tenantId: string | null;
  deviceId: string;
  expiresAt: string | null;
  permissionScope: string[];
  reason: string | null;
}

export type DecisionLifecyclePhase =
  | 'sending'
  | 'gateway_accepted'
  | 'waiting_final_event'
  | 'confirmed'
  | 'rejected'
  | 'failed'
  | 'result_pending';

export interface DecisionLifecycle {
  commandId: string;
  itemId: string;
  phase: DecisionLifecyclePhase;
  reason: string | null;
  sourceEventId: string | null;
  finalEventId: string | null;
}

export type PairingState =
  | { status: 'idle' }
  | { status: 'begin_sent' }
  | { status: 'challenge'; pairingId: string; displayCode: string; expiresAt: string }
  | { status: 'confirming' }
  | { status: 'paired'; credentialRef: string }
  | { status: 'rejected'; reason: string | null };

export type ProviderEvent =
  | { type: 'connection'; state: ConnectionState; reason?: string }
  | { type: 'authorization'; authorization: ProviderAuthorization }
  | { type: 'snapshot'; snapshot: FixtureState; snapshotTrust: SnapshotTrust; eventId?: string; stale?: boolean }
  | { type: 'command_ack'; ack: CommandAck }
  | { type: 'command_lifecycle'; lifecycle: DecisionLifecycle }
  | { type: 'pairing'; pairing: PairingState }
  | { type: 'error'; code: string; message: string; retryable: boolean };

export interface AhtProvider {
  readonly source: DataSource;
  subscribe(listener: (event: ProviderEvent) => void): () => void;
  connect(): void;
  disconnect(): void;
  beginPairing(): void;
  confirmPairing(pairingId: string, code: string): void;
  decide(command: DecisionCommand): Promise<CommandAck>;
}
