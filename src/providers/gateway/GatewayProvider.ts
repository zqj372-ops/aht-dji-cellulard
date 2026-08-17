import type { AhtProvider, CommandAck, DecisionCommand, ProviderEvent } from '../types';
import {
  applyGatewayEvent,
  toFixtureState,
} from './reducer';
import {
  createUnknownGatewaySnapshotTrust,
  deriveGatewaySnapshotTrust,
  getDecisionGate,
  markSnapshotTrustStale,
} from '../trust';
import type { ConnectionState, SnapshotTrust } from '../types';
import {
  gatewayProtocol,
  parseGatewayServerMessage,
  type GatewaySnapshot,
} from '../protocol';

export interface WebSocketLike {
  readyState: number;
  send(message: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: (() => void) | null;
  onclose: (() => void) | null;
}

export interface GatewayProviderOptions {
  url: string;
  clientId?: string;
  socketFactory?: (url: string) => WebSocketLike;
  reconnectDelaysMs?: number[];
  nowFn?: () => number;
  maxSnapshotAgeMs?: number;
  setTimeoutFn?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (timer: ReturnType<typeof setTimeout>) => void;
}

const defaultSocketFactory = (url: string): WebSocketLike => new WebSocket(url) as unknown as WebSocketLike;

export class GatewayProvider implements AhtProvider {
  readonly source = 'gateway' as const;
  private readonly url: string;
  private readonly clientId: string;
  private readonly socketFactory: (url: string) => WebSocketLike;
  private readonly reconnectDelaysMs: number[];
  private readonly nowFn: () => number;
  private readonly maxSnapshotAgeMs: number;
  private readonly setTimeoutFn: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  private readonly clearTimeoutFn: (timer: ReturnType<typeof setTimeout>) => void;
  private readonly listeners = new Set<(event: ProviderEvent) => void>();
  private readonly pendingCommands = new Map<string, (ack: CommandAck) => void>();
  private socket: WebSocketLike | null = null;
  private gatewaySnapshot: GatewaySnapshot | null = null;
  private lastEventId: string | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private commandSequence = 0;
  private manuallyDisconnected = false;
  private connectionState: ConnectionState = 'idle';
  private snapshotTrust: SnapshotTrust = createUnknownGatewaySnapshotTrust();

  constructor(options: GatewayProviderOptions) {
    this.url = options.url;
    this.clientId = options.clientId ?? 'aht-browser';
    this.socketFactory = options.socketFactory ?? defaultSocketFactory;
    this.reconnectDelaysMs = options.reconnectDelaysMs ?? [250, 500, 1000, 2000, 5000];
    this.nowFn = options.nowFn ?? (() => Date.now());
    this.maxSnapshotAgeMs = options.maxSnapshotAgeMs ?? 30_000;
    this.setTimeoutFn = options.setTimeoutFn ?? ((callback, delay) => setTimeout(callback, delay));
    this.clearTimeoutFn = options.clearTimeoutFn ?? ((timer) => clearTimeout(timer));
  }

  subscribe(listener: (event: ProviderEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connect(): void {
    this.manuallyDisconnected = false;
    if (this.socket && this.socket.readyState === 1) return;
    this.openSocket();
  }

  disconnect(): void {
    this.manuallyDisconnected = true;
    if (this.reconnectTimer) {
      this.clearTimeoutFn(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this.pendingCommands.forEach((resolve, commandId) => {
      resolve({ commandId, status: 'rejected', reason: 'gateway_disconnected' });
    });
    this.pendingCommands.clear();
    this.emitConnection('disconnected', 'client_stopped');
  }

  decide(command: DecisionCommand): Promise<CommandAck> {
    const commandId = `${this.clientId}-${String(++this.commandSequence).padStart(4, '0')}`;
    this.refreshSnapshotTrustForDecision();
    const gate = getDecisionGate('gateway', this.connectionState, this.snapshotTrust);
    if (!gate.allowed) {
      return Promise.resolve({ commandId, status: 'rejected', reason: gate.reason ?? 'gateway_not_connected' });
    }
    if (!this.socket || this.socket.readyState !== 1 || !this.gatewaySnapshot) {
      return Promise.resolve({ commandId, status: 'rejected', reason: 'gateway_not_connected' });
    }

    const target = this.gatewaySnapshot.needs_you.find((item) => item.id === command.itemId);
    if (!target || target.agent_id !== command.agentId || target.status !== 'pending') {
      return Promise.resolve({ commandId, status: 'rejected', reason: 'invalid_target' });
    }
    if (!target.actions.includes(command.decision)) {
      return Promise.resolve({ commandId, status: 'rejected', reason: 'action_not_allowed' });
    }

    const message = {
      protocol: gatewayProtocol,
      type: 'command' as const,
      command_id: commandId,
      command: command.decision,
      target: { needs_you_id: command.itemId, agent_id: command.agentId },
    };

    return new Promise((resolve) => {
      this.pendingCommands.set(commandId, resolve);
      try {
        this.socket?.send(JSON.stringify(message));
      } catch {
        this.pendingCommands.delete(commandId);
        resolve({ commandId, status: 'rejected', reason: 'send_failed' });
      }
    });
  }

  private openSocket(): void {
    if (!this.url) {
      this.emitConnection('error', 'gateway_url_missing');
      this.emit({ type: 'error', code: 'gateway_url_missing', message: 'Gateway 地址未配置', retryable: false });
      return;
    }
    this.emitConnection(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');
    try {
      const socket = this.socketFactory(this.url);
      this.socket = socket;
      socket.onopen = () => this.handleOpen();
      socket.onmessage = (event) => this.handleMessage(event.data);
      socket.onerror = () => {
        this.snapshotTrust = markSnapshotTrustStale(this.snapshotTrust, 'gateway_socket_error');
        this.emitConnection('error', 'gateway_socket_error');
        this.emit({
          type: 'error', code: 'gateway_socket_error', message: 'Gateway WebSocket 出现错误', retryable: true,
        });
      };
      socket.onclose = () => this.handleClose();
    } catch {
      this.snapshotTrust = markSnapshotTrustStale(this.snapshotTrust, 'gateway_unavailable');
      this.emit({ type: 'error', code: 'gateway_unavailable', message: 'Gateway WebSocket 无法建立', retryable: true });
      this.scheduleReconnect();
    }
  }

  private handleOpen(): void {
    const hello: { protocol: typeof gatewayProtocol; type: 'hello'; client_id: string; resume_after?: string } = {
      protocol: gatewayProtocol,
      type: 'hello',
      client_id: this.clientId,
    };
    if (this.lastEventId) hello.resume_after = this.lastEventId;
    try {
      this.socket?.send(JSON.stringify(hello));
    } catch {
      this.emit({ type: 'error', code: 'hello_send_failed', message: 'Gateway hello 发送失败', retryable: true });
    }
  }

  private handleMessage(data: unknown): void {
    let input: unknown;
    try {
      input = typeof data === 'string' ? JSON.parse(data) : data;
    } catch {
      this.snapshotTrust = markSnapshotTrustStale(this.snapshotTrust, 'invalid_json');
      this.emit({ type: 'error', code: 'invalid_json', message: 'Gateway 返回了非法 JSON', retryable: false });
      return;
    }

    const message = parseGatewayServerMessage(input);
    if (message.type === 'protocol_error') {
      this.snapshotTrust = markSnapshotTrustStale(this.snapshotTrust, 'gateway_protocol_error');
      this.emit({ type: 'error', code: message.code, message: message.message, retryable: false });
      return;
    }

    switch (message.type) {
      case 'hello_ack':
        this.reconnectAttempt = 0;
        this.emitConnection('connected');
        break;
      case 'snapshot':
        this.gatewaySnapshot = message.snapshot;
        this.lastEventId = message.event_id;
        const snapshotReceivedAt = this.nowFn();
        this.snapshotTrust = deriveGatewaySnapshotTrust(
          message.snapshot,
          snapshotReceivedAt,
          snapshotReceivedAt,
          this.maxSnapshotAgeMs,
        );
        this.emitSnapshot();
        break;
      case 'event':
        if (!this.gatewaySnapshot) {
          this.emit({ type: 'error', code: 'snapshot_required', message: 'Gateway event 尚未有 snapshot 基线', retryable: true });
          break;
        }
        this.gatewaySnapshot = {
          ...applyGatewayEvent(this.gatewaySnapshot, message.event),
          revision: message.revision,
          event_id: message.event_id,
          generated_at: message.generated_at,
        };
        this.lastEventId = message.event_id;
        const receivedAt = this.nowFn();
        this.snapshotTrust = deriveGatewaySnapshotTrust(
          this.gatewaySnapshot,
          receivedAt,
          receivedAt,
          this.maxSnapshotAgeMs,
        );
        this.emitSnapshot();
        break;
      case 'command_ack': {
        const ack: CommandAck = {
          commandId: message.command_id,
          status: message.status,
          ...(message.reason ? { reason: message.reason } : {}),
        };
        this.pendingCommands.get(message.command_id)?.(ack);
        this.pendingCommands.delete(message.command_id);
        this.emit({ type: 'command_ack', ack });
        break;
      }
      case 'resync_required':
        this.lastEventId = null;
        this.gatewaySnapshot = null;
        this.snapshotTrust = createUnknownGatewaySnapshotTrust(`resync_required:${message.reason}`);
        this.emitConnection('reconnecting', `resync_required:${message.reason}`);
        this.sendHello();
        break;
      case 'error':
        this.snapshotTrust = markSnapshotTrustStale(this.snapshotTrust, message.code);
        this.emit({ type: 'error', code: message.code, message: message.message, retryable: message.retryable });
        break;
    }
  }

  private sendHello(): void {
    if (!this.socket || this.socket.readyState !== 1) return;
    const hello: { protocol: typeof gatewayProtocol; type: 'hello'; client_id: string; resume_after?: string } = {
      protocol: gatewayProtocol,
      type: 'hello',
      client_id: this.clientId,
    };
    if (this.lastEventId) hello.resume_after = this.lastEventId;
    this.socket.send(JSON.stringify(hello));
  }

  private handleClose(): void {
    this.socket = null;
    if (this.manuallyDisconnected) return;
    this.snapshotTrust = markSnapshotTrustStale(this.snapshotTrust, 'gateway_closed');
    this.emitConnection('reconnecting', 'gateway_closed');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.manuallyDisconnected || this.reconnectTimer || this.reconnectDelaysMs.length === 0) return;
    const delayIndex = Math.min(this.reconnectAttempt, this.reconnectDelaysMs.length - 1);
    const delay = this.reconnectDelaysMs[delayIndex] ?? 5000;
    this.reconnectAttempt += 1;
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null;
      if (!this.manuallyDisconnected) this.openSocket();
    }, delay);
  }

  private emit(event: ProviderEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }

  private refreshSnapshotTrustForDecision(): void {
    if (!this.gatewaySnapshot || this.snapshotTrust.freshness !== 'fresh') return;
    const receivedAtMs = this.snapshotTrust.receivedAt ? Date.parse(this.snapshotTrust.receivedAt) : Number.NaN;
    if (!Number.isFinite(receivedAtMs)) return;
    this.snapshotTrust = deriveGatewaySnapshotTrust(
      this.gatewaySnapshot,
      receivedAtMs,
      this.nowFn(),
      this.maxSnapshotAgeMs,
    );
    if (this.snapshotTrust.freshness !== 'fresh') this.emitSnapshot();
  }

  private emitConnection(state: ConnectionState, reason?: string): void {
    this.connectionState = state;
    this.emit({ type: 'connection', state, ...(reason ? { reason } : {}) });
  }

  private emitSnapshot(): void {
    if (!this.gatewaySnapshot) return;
    this.emit({
      type: 'snapshot',
      snapshot: toFixtureState(this.gatewaySnapshot),
      snapshotTrust: this.snapshotTrust,
      eventId: this.lastEventId ?? undefined,
      stale: this.snapshotTrust.freshness !== 'fresh',
    });
  }
}
