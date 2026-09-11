import { MaterialIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';

import { getRepositories } from '../../../lib/container';
import { colors, MIN_TOUCH_TARGET } from '../../../lib/theme';
import { isSyncConfigured } from '../../../services/sync/config';
import { getSyncToken, setSyncToken } from '../../../services/sync/session';
import { SyncCredentialPrompt } from './SyncCredentialPrompt';
import { runSynchronization } from '../application/synchronize';
import { runPull } from '../application/pull';

const RESULT_TITLE = 'Sincronización';

/**
 * One sentence for the upload, one for the download.
 *
 * Reported separately because they succeed and fail separately: an upload that
 * could not land must not be hidden behind a download that did, and a skipped
 * download is not a failure — it is client-wins keeping the user's own unsent
 * edit (docs/offline-sync.md §8).
 */
function messageFor(
  report: Awaited<ReturnType<typeof runSynchronization>>,
  pulled: Awaited<ReturnType<typeof runPull>> | null
): string {
  if (report.status === 'not_configured') {
    return 'Sin servidor configurado. Tus datos permanecen pendientes en este teléfono.';
  }
  const upload = report.status === 'nothing_pending'
    ? 'Sin cambios que subir.'
    : `Subidos ${report.synchronized}; ${report.rejected.length} rechazados; ${report.conflicts.length} conflictos resueltos usando la versión de este dispositivo.${
        report.transportError ? ` ${report.transportError}` : ''
      }`;

  if (!pulled || pulled.status === 'not_configured') return upload;
  if (pulled.status === 'transport_failed') {
    // `transportError` already ends in a period, so none is added here.
    return `${upload} No se pudo descargar: ${pulled.transportError ?? 'error de red.'}`;
  }
  const kept = pulled.skipped.filter(item => item.reason === 'local_pending').length;
  const download = pulled.applied === 0 && kept === 0
    ? 'Sin novedades del servidor.'
    : `Descargados ${pulled.applied}${kept ? `; ${kept} conservados con tu versión local` : ''}.${
        pulled.moreAvailable ? ' Quedan más; vuelve a sincronizar.' : ''
      }`;
  return `${upload} ${download}`;
}

/**
 * Sync action, reduced to a single icon (CLAUDE.md §13, corner placement per
 * product decision). It runs both directions — upload, then download — and
 * asks for the credential only when one is needed, through
 * `SyncCredentialPrompt`. The dashboard no longer carries a permanent
 * credential field (`SyncPanel`, removed 2026-09-10).
 *
 * `getSyncToken()`/`isSyncConfigured()` are plain module functions, not React
 * state (services/sync/session.ts), so nothing has to be shared with the
 * prompt beyond calling `setSyncToken`.
 */
export function SyncIconButton({
  onComplete,
}: {
  onComplete?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [askingCredential, setAskingCredential] = useState(false);
  const lock = useRef(false);

  async function sync() {
    if (lock.current) return;
    // The credential is asked for here rather than kept as a permanent field on
    // the dashboard (product decision, 2026-09-10). It is session-only, so this
    // is reached again after every restart.
    if (isSyncConfigured() && !getSyncToken().trim()) {
      setAskingCredential(true);
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const repositories = await getRepositories();
      const deviceId = await repositories.deviceIdentity.getOrCreateDeviceId(
        new Date().toISOString()
      );
      // Upload first: what this device captured is the authoritative version
      // under client-wins, so sending it before asking for the server's copy
      // avoids pulling a record we are about to overwrite anyway.
      const report = await runSynchronization({
        queue: repositories.syncQueue,
        transport: repositories.syncTransport,
        deviceId,
        now: () => new Date(),
      });
      const pulled = repositories.syncTransport
        ? await runPull({
            downloads: repositories.syncDownloads,
            transport: repositories.syncTransport,
            deviceId,
            now: () => new Date(),
          })
        : null;
      Alert.alert(RESULT_TITLE, messageFor(report, pulled));
      await onComplete?.();
    } catch (error) {
      // The user-facing message stays generic — a driver error can carry row
      // values (CLAUDE.md §15). `__DEV__` is false in release builds, so the
      // detail reaches the Metro terminal only while developing.
      if (__DEV__) console.error('[sync] run failed:', error);
      Alert.alert(RESULT_TITLE, 'No se pudo completar la sincronización. Puedes reintentar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <>
    <SyncCredentialPrompt
      visible={askingCredential}
      onCancel={() => setAskingCredential(false)}
      onSubmit={token => { setSyncToken(token); setAskingCredential(false); void sync(); }}
    />
    <Pressable
      onPress={() => void sync()}
      disabled={busy}
      style={styles.button}
      accessibilityRole="button"
      accessibilityLabel="Sincronizar ahora"
      accessibilityState={{ busy, disabled: busy }}
      testID="sync-icon-button"
      hitSlop={8}
    >
      {busy ? (
        <ActivityIndicator size="small" color={colors.onSurfaceVariant} />
      ) : (
        <MaterialIcons name="sync" size={24} color={colors.onSurfaceVariant} />
      )}
    </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
