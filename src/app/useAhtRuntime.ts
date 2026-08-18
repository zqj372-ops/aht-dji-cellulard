import { useCallback, useEffect, useMemo, useState } from 'react';
import { fixtureState } from '../providers/fixture/fixtureState';
import { emptyState } from '../providers/emptyState';
import { FixtureProvider } from '../providers/fixture/FixtureProvider';
import { GatewayProvider } from '../providers/gateway/GatewayProvider';
import {
  createFixtureSnapshotTrust,
  createUnknownGatewaySnapshotTrust,
  getDecisionGate,
  markSnapshotTrustStale,
} from '../providers/trust';
import type {
  AhtProvider,
  CommandAck,
  ConnectionState,
  DataSource,
  DecisionCommand,
  DecisionGate,
  DecisionLifecycle,
  PairingState,
  ProviderAuthorization,
  SnapshotTrust,
} from '../providers/types';
import type { FixtureState } from './types';

const configuredSource: DataSource = import.meta.env.VITE_AHT_DATA_SOURCE === 'gateway' ? 'gateway' : 'fixture';
const gatewayUrl = import.meta.env.VITE_AHT_GATEWAY_URL ?? '';
const gatewayDeviceId = import.meta.env.VITE_AHT_DEVICE_ID ?? 'device-01';
const defaultGatewayProviderFactory = () => new GatewayProvider({ url: gatewayUrl, deviceId: gatewayDeviceId });
const defaultFixtureProviderFactory = () => new FixtureProvider();

export interface AhtRuntimeOptions {
  initialSource?: DataSource;
  gatewayProviderFactory?: () => AhtProvider;
  fixtureProviderFactory?: () => AhtProvider;
}

export interface AhtRuntime {
  source: DataSource;
  connection: ConnectionState;
  state: FixtureState;
  stale: boolean;
  error: string | null;
  snapshotTrust: SnapshotTrust;
  decisionGate: DecisionGate;
  authorization: ProviderAuthorization;
  decisionLifecycle: Record<string, DecisionLifecycle>;
  pairing: PairingState;
  setSource: (source: DataSource) => void;
  decide: (command: DecisionCommand) => Promise<CommandAck>;
  beginPairing: () => void;
  confirmPairing: (pairingId: string, code: string) => void;
}

export function useAhtRuntime(options: AhtRuntimeOptions = {}): AhtRuntime {
  const initialSource = options.initialSource ?? configuredSource;
  const gatewayProviderFactory = options.gatewayProviderFactory ?? defaultGatewayProviderFactory;
  const fixtureProviderFactory = options.fixtureProviderFactory ?? defaultFixtureProviderFactory;
  const [source, setSource] = useState<DataSource>(initialSource);
  const [state, setState] = useState<FixtureState>(initialSource === 'fixture' ? fixtureState : emptyState);
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [stale, setStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapshotTrust, setSnapshotTrust] = useState<SnapshotTrust>(
    initialSource === 'fixture'
      ? createFixtureSnapshotTrust(new Date())
      : createUnknownGatewaySnapshotTrust(),
  );
  const [authorization, setAuthorization] = useState<ProviderAuthorization>({
    status: initialSource === 'fixture' ? 'authorized' : 'unauthorized',
    sessionId: initialSource === 'fixture' ? 'fixture-session' : null,
    principalId: initialSource === 'fixture' ? 'fixture-user' : null,
    tenantId: initialSource === 'fixture' ? 'fixture-tenant' : null,
    deviceId: gatewayDeviceId,
    expiresAt: null,
    permissionScope: initialSource === 'fixture' ? ['development:fixture', 'needs_you:write'] : [],
    reason: null,
  });
  const [decisionLifecycle, setDecisionLifecycle] = useState<Record<string, DecisionLifecycle>>({});
  const [pairing, setPairing] = useState<PairingState>({ status: 'idle' });
  const provider = useMemo<AhtProvider>(
    () => source === 'fixture' ? fixtureProviderFactory() : gatewayProviderFactory(),
    [fixtureProviderFactory, gatewayProviderFactory, source],
  );

  useEffect(() => {
    setState(source === 'fixture' ? fixtureState : emptyState);
    setConnection('idle');
    setStale(false);
    setError(null);
    setDecisionLifecycle({});
    setPairing({ status: 'idle' });
    setAuthorization({
      status: source === 'fixture' ? 'authorized' : 'unauthorized',
      sessionId: source === 'fixture' ? 'fixture-session' : null,
      principalId: source === 'fixture' ? 'fixture-user' : null,
      tenantId: source === 'fixture' ? 'fixture-tenant' : null,
      deviceId: gatewayDeviceId,
      expiresAt: null,
      permissionScope: source === 'fixture' ? ['development:fixture', 'needs_you:write'] : [],
      reason: null,
    });
    setSnapshotTrust(
      source === 'fixture'
        ? createFixtureSnapshotTrust(new Date())
        : createUnknownGatewaySnapshotTrust(),
    );
    const unsubscribe = provider.subscribe((event) => {
      if (event.type === 'connection') {
        setConnection(event.state);
        setStale(source === 'gateway' && event.state !== 'connected');
        if (source === 'gateway' && event.state !== 'connected') {
          setDecisionLifecycle((current) => Object.fromEntries(
            Object.entries(current).map(([itemId, lifecycle]) => (
              lifecycle.phase === 'gateway_accepted' || lifecycle.phase === 'waiting_final_event'
                ? [itemId, { ...lifecycle, phase: 'result_pending', reason: event.reason ?? event.state }]
                : [itemId, lifecycle]
            )),
          ));
        }
        if (source === 'gateway' && event.state !== 'connected') {
          setSnapshotTrust((current) => markSnapshotTrustStale(current, event.reason ?? event.state));
        }
        if (event.state === 'connected') setError(null);
        return;
      }
      if (event.type === 'authorization') {
        setAuthorization(event.authorization);
        return;
      }
      if (event.type === 'snapshot') {
        setState(event.snapshot);
        setSnapshotTrust(event.snapshotTrust);
        setStale(event.snapshotTrust.freshness !== 'fresh');
        setError(null);
        return;
      }
      if (event.type === 'command_lifecycle') {
        setDecisionLifecycle((current) => ({
          ...current,
          [event.lifecycle.itemId]: event.lifecycle,
        }));
        return;
      }
      if (event.type === 'command_ack') {
        if (event.ack.status === 'rejected') {
          setDecisionLifecycle((current) => {
            const item = Object.values(current).find((lifecycle) => lifecycle.commandId === event.ack.commandId);
            if (!item) return current;
            return {
              ...current,
              [item.itemId]: {
                ...item,
                phase: 'rejected',
                reason: event.ack.reason,
                finalEventId: event.ack.finalEventId,
              },
            };
          });
        }
        return;
      }
      if (event.type === 'pairing') {
        setPairing(event.pairing);
        return;
      }
      if (event.type === 'error') {
        if (event.code !== 'pairing_required' && event.code !== 'unauthorized') {
          setConnection('error');
        }
        setError(event.message);
        if (source === 'gateway') {
          setSnapshotTrust((current) => markSnapshotTrustStale(current, event.code));
          setStale(true);
        }
      }
    });
    provider.connect();
    return () => {
      unsubscribe();
      provider.disconnect();
    };
  }, [provider, source]);

  const decide = useCallback((command: DecisionCommand) => provider.decide(command), [provider]);
  const beginPairing = useCallback(() => provider.beginPairing(), [provider]);
  const confirmPairing = useCallback((pairingId: string, code: string) => provider.confirmPairing(pairingId, code), [provider]);
  const decisionGate = useMemo(
    () => getDecisionGate(source, connection, snapshotTrust),
    [connection, snapshotTrust, source],
  );
  return {
    source, connection, state, stale, error, snapshotTrust, decisionGate, authorization, decisionLifecycle, pairing,
    setSource, decide, beginPairing, confirmPairing,
  };
}
