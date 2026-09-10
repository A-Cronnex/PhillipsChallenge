/**
 * Turns one server result into the local state change it implies.
 *
 * Pure, and separate from the orchestrator, because this is where the
 * client-wins policy becomes visible to the user and where a mistake would
 * either lose a record or claim a record is safe when it is not.
 *
 * The rule behind every branch: a change is marked `synchronized` only when
 * the server has confirmed it holds that exact record. Anything else leaves
 * the local row queued or failed, never quietly dropped
 * (docs/offline-sync.md §6).
 */
import type { SyncStatus } from '../../../types/domain';
import type { SyncRejectionCode, SyncResult } from '../../../types/sync-contract';

export type LocalOutcome =
  | {
      kind: 'synchronized';
      status: Extract<SyncStatus, 'synchronized'>;
      serverVersion: number;
      /**
       * True when client-wins overrode a diverged server version. The record
       * is stored and synchronized either way — this flag exists so the run
       * can report it rather than resolve it silently
       * (docs/offline-sync.md §11).
       */
      overwroteServer: boolean;
      previousServerVersion: number | null;
    }
  | {
      kind: 'failed';
      status: Extract<SyncStatus, 'failed'>;
      /** Stored in `sync_records.last_error` and shown to the user. */
      message: string;
      /** True when retrying the same payload can plausibly succeed. */
      retryable: boolean;
    };

/**
 * Spanish text per rejection code, matching the rest of the UI.
 *
 * The server's own `reason` is English and written for an operator; these are
 * written for the field user, which is why the contract carries a machine
 * `code` alongside the prose (types/sync-contract.ts).
 */
const REJECTION_MESSAGES: Record<SyncRejectionCode, { message: string; retryable: boolean }> =
  {
    invalid_payload: {
      message:
        'El servidor rechazó este registro por datos inválidos. Corrígelo antes de reintentar.',
      retryable: false,
    },
    unsupported_operation: {
      message: 'El servidor no acepta esta operación todavía.',
      retryable: false,
    },
    not_owned_by_principal: {
      message: 'Este registro pertenece a otro usuario y no se puede enviar desde esta sesión.',
      retryable: false,
    },
    missing_reference: {
      message:
        'Falta sincronizar un registro relacionado (por ejemplo, el sitio). Se reintentará.',
      retryable: true,
    },
    storage_error: {
      message: 'El servidor no pudo guardar el registro. Se reintentará.',
      retryable: true,
    },
  };

/** Used when the batch never reached the server, or its response was unusable. */
export const TRANSPORT_FAILURE_MESSAGE =
  'No se pudo contactar al servidor. El registro sigue guardado en este dispositivo.';

/**
 * Used when the server answered but said nothing about this record.
 *
 * Treated as a failure rather than as success: assuming a silent result means
 * "stored" is exactly how a record gets marked synchronized while existing
 * only on the device.
 */
export const MISSING_RESULT_MESSAGE =
  'El servidor no confirmó este registro. Sigue pendiente en este dispositivo.';

export function mapResultToLocalOutcome(result: SyncResult): LocalOutcome {
  switch (result.outcome) {
    case 'synchronized':
      return {
        kind: 'synchronized',
        status: 'synchronized',
        serverVersion: result.serverVersion,
        overwroteServer: false,
        previousServerVersion: null,
      };
    case 'conflict_overwritten':
      // Not the local `conflict` status. Under client-wins the device version
      // is what the server now holds, so the record IS synchronized; marking
      // it `conflict` would leave it queued forever and re-uploaded on every
      // run. See docs/sync-api.md §8 for why no durable local conflict flag is
      // written.
      return {
        kind: 'synchronized',
        status: 'synchronized',
        serverVersion: result.serverVersion,
        overwroteServer: true,
        previousServerVersion: result.previousServerVersion,
      };
    case 'rejected': {
      const known = REJECTION_MESSAGES[result.code];
      return {
        kind: 'failed',
        status: 'failed',
        message: known?.message ?? 'El servidor rechazó este registro.',
        retryable: known?.retryable ?? false,
      };
    }
  }
}
