export interface ReferenceGatewayStore {
  load(): unknown;
  save(state: unknown): void;
}

export interface ReferenceGatewaySocket {
  readyState: number;
  on(type: string, listener: (raw: unknown) => void): void;
  send(raw: string): void;
  close(): void;
}

export interface ReferenceGatewayHandle {
  attach(socket: ReferenceGatewaySocket): void;
  getSnapshot(): Record<string, unknown>;
  getHistory(): unknown[];
  getLedger(): Map<string, unknown>;
}

export function createReferenceGateway(options?: {
  deviceId?: string | null;
  nowFn?: () => number;
  historyLimit?: number;
  store?: ReferenceGatewayStore | null;
  sessionTtlMs?: number;
}): ReferenceGatewayHandle;
