import { decideInboxItem, fixtureState } from './fixtureState';
import type { AhtProvider, CommandAck, DecisionCommand, ProviderEvent } from '../types';
import { createFixtureSnapshotTrust } from '../trust';

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
    this.emit({ type: 'snapshot', snapshot: this.snapshot, snapshotTrust: createFixtureSnapshotTrust(new Date()) });
  }

  disconnect(): void {
    this.emit({ type: 'connection', state: 'disconnected', reason: 'fixture_stopped' });
  }

  beginPairing(): void {
    this.emit({
      type: 'pairing',
      pairing: { status: 'rejected', reason: 'fixture_does_not_support_pairing' },
    });
  }

  confirmPairing(_pairingId: string, _code: string): void {
    this.emit({
      type: 'pairing',
      pairing: { status: 'rejected', reason: 'fixture_does_not_support_pairing' },
    });
  }

  async decide(command: DecisionCommand): Promise<CommandAck> {
    const commandId = `fixture-${command.itemId}`;
    this.emit({ type: 'command_lifecycle', lifecycle: {
      commandId, itemId: command.itemId, phase: 'sending', reason: null, sourceEventId: 'fixture', finalEventId: null,
    } });
    this.snapshot = decideInboxItem(this.snapshot, command.itemId, command.decision);
    this.emit({ type: 'snapshot', snapshot: this.snapshot, snapshotTrust: createFixtureSnapshotTrust(new Date()) });
    const ack = {
      commandId,
      status: 'accepted' as const,
      phase: 'final' as const,
      reason: null,
      finalEventId: 'fixture',
      retryable: false,
    };
    this.emit({ type: 'command_lifecycle', lifecycle: {
      commandId, itemId: command.itemId, phase: 'confirmed', reason: null, sourceEventId: 'fixture', finalEventId: 'fixture',
    } });
    this.emit({ type: 'command_ack', ack });
    return ack;
  }

  private emit(event: ProviderEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}
