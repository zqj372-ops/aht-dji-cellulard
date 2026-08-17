import { useCallback, useEffect, useMemo, useState } from 'react';
import { fixtureState } from '../providers/fixture/fixtureState';
import { emptyState } from '../providers/emptyState';
import { FixtureProvider } from '../providers/fixture/FixtureProvider';
import { GatewayProvider } from '../providers/gateway/GatewayProvider';
import type { AhtProvider, CommandAck, ConnectionState, DataSource, DecisionCommand } from '../providers/types';
import type { FixtureState } from './types';

const configuredSource: DataSource = import.meta.env.VITE_AHT_DATA_SOURCE === 'gateway' ? 'gateway' : 'fixture';
const gatewayUrl = import.meta.env.VITE_AHT_GATEWAY_URL ?? '';

export interface AhtRuntime {
  source: DataSource;
  connection: ConnectionState;
  state: FixtureState;
  stale: boolean;
  error: string | null;
  setSource: (source: DataSource) => void;
  decide: (command: DecisionCommand) => Promise<CommandAck>;
}

export function useAhtRuntime(): AhtRuntime {
  const [source, setSource] = useState<DataSource>(configuredSource);
  const [state, setState] = useState<FixtureState>(configuredSource === 'fixture' ? fixtureState : emptyState);
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provider = useMemo<AhtProvider>(
    () => source === 'fixture'
      ? new FixtureProvider()
      : new GatewayProvider({ url: gatewayUrl }),
    [source],
  );

  useEffect(() => {
    setState(source === 'fixture' ? fixtureState : emptyState);
    setConnection('idle');
    setStale(false);
    setError(null);
    const unsubscribe = provider.subscribe((event) => {
      if (event.type === 'connection') {
        setConnection(event.state);
        setStale(event.state === 'reconnecting' || event.state === 'disconnected');
        if (event.state === 'connected') setError(null);
        return;
      }
      if (event.type === 'snapshot') {
        setState(event.snapshot);
        setStale(Boolean(event.stale));
        setError(null);
        return;
      }
      if (event.type === 'error') {
        setConnection('error');
        setError(event.message);
      }
    });
    provider.connect();
    return () => {
      unsubscribe();
      provider.disconnect();
    };
  }, [provider, source]);

  const decide = useCallback((command: DecisionCommand) => provider.decide(command), [provider]);
  return { source, connection, state, stale, error, setSource, decide };
}
