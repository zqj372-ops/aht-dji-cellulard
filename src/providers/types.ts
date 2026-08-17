import type { Decision, FixtureState } from '../app/types';

export type DataSource = 'fixture' | 'gateway';
export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

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
  | { type: 'snapshot'; snapshot: FixtureState; eventId?: string; stale?: boolean }
  | { type: 'command_ack'; ack: CommandAck }
  | { type: 'error'; code: string; message: string; retryable: boolean };

export interface AhtProvider {
  readonly source: DataSource;
  subscribe(listener: (event: ProviderEvent) => void): () => void;
  connect(): void;
  disconnect(): void;
  decide(command: DecisionCommand): Promise<CommandAck>;
}
