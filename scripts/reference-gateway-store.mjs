import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';

const STORE_SCHEMA_VERSION = 2;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateState(state) {
  if (!isRecord(state) || state.schema_version !== STORE_SCHEMA_VERSION
    || !isRecord(state.snapshot) || !Array.isArray(state.history) || !Array.isArray(state.ledger)
    || !Array.isArray(state.devices) || !Array.isArray(state.revoked_credentials)) {
    throw new Error('reference_gateway_store_invalid');
  }
  return state;
}

export function createJsonGatewayStore(filePath) {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    throw new TypeError('reference_gateway_store_path_required');
  }

  return {
    load() {
      if (!existsSync(filePath)) return null;
      let parsed;
      try {
        parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      } catch {
        throw new Error('reference_gateway_store_invalid');
      }
      return validateState(parsed);
    },

    save(state) {
      const validated = validateState(state);
      const parentDirectory = dirname(filePath);
      mkdirSync(parentDirectory, { recursive: true });
      const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
      const serialized = JSON.stringify({
        ...validated,
        saved_at: new Date().toISOString(),
      }, null, 2);
      writeFileSync(temporaryPath, `${serialized}\n`, { mode: 0o600 });
      chmodSync(temporaryPath, 0o600);
      renameSync(temporaryPath, filePath);
      chmodSync(filePath, 0o600);
    },
  };
}

export const referenceGatewayStoreSchemaVersion = STORE_SCHEMA_VERSION;
