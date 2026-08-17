import { decideInboxItem, fixtureState } from './fixtureState';
import type { AhtProvider, CommandAck, DecisionCommand, ProviderEvent } from '../types';

export class FixtureProvider implements AhtProvider {
  readonly source = 'fixture' as const;
  private snapshot = fixtureState;
  private listeners = new Set<(event: ProviderEvent) => void>();

  subscribe(listener: (event: ProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connect(): void {
    this.emit({ type: 'connection', state: 'connected' });
    this.emit({ type: 'snapshot', snapshot: this.snapshot });
  }

  disconnect(): void {
    this.emit({ type: 'connection', state: 'disconnected', reason: 'fixture_stopped' });
  }

  async decide(command: DecisionCommand): Promise<CommandAck> {
    this.snapshot = decideInboxItem(this.snapshot, command.itemId, command.decision);
    this.emit({ type: 'snapshot', snapshot: this.snapshot });
    const ack = { commandId: `fixture-${command.itemId}`, status: 'accepted' as const };
    this.emit({ type: 'command_ack', ack });
    return ack;
  }

  private emit(event: ProviderEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}
