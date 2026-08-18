import { mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { createJsonGatewayStore } from '../../scripts/reference-gateway-store.mjs';

const temporaryDirectories = [];

afterEach(() => {
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop(), { recursive: true, force: true });
  }
});

describe('reference Gateway JSON store', () => {
  test('atomically persists and reopens gateway state with private file permissions', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aht-gateway-store-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'state.json');
    const state = {
      schema_version: 2,
      snapshot: { revision: 2, event_id: 'evt-2' },
      history: [{ event_id: 'evt-2', revision: 2 }],
      ledger: [{ command_id: 'cmd-01', status: 'accepted', phase: 'final', finalEventId: 'evt-2' }],
      devices: [],
      revoked_credentials: [],
    };

    const store = createJsonGatewayStore(filePath);
    expect(store.load()).toBeNull();
    store.save(state);

    expect(createJsonGatewayStore(filePath).load()).toEqual(expect.objectContaining(state));
    expect(statSync(filePath).mode & 0o777).toBe(0o600);
  });

  test('fails closed when the persisted state is malformed', () => {
    const directory = mkdtempSync(join(tmpdir(), 'aht-gateway-store-'));
    temporaryDirectories.push(directory);
    const filePath = join(directory, 'state.json');
    writeFileSync(filePath, '{"schema_version":2}');

    expect(() => createJsonGatewayStore(filePath).load()).toThrow('reference_gateway_store_invalid');
  });
});
