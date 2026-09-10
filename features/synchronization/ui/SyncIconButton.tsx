import { MaterialIcons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet } from 'react-native';

import { getRepositories } from '../../../lib/container';
import { colors, MIN_TOUCH_TARGET } from '../../../lib/theme';
import { isSyncConfigured } from '../../../services/sync/config';
import { getSyncToken } from '../../../services/sync/session';
import { runSynchronization } from '../application/synchronize';

const RESULT_TITLE = 'Sincronización';

function messageFor(report: Awaited<ReturnType<typeof runSynchronization>>): string {
  if (report.status === 'not_configured') {
    return 'Sin servidor configurado. Tus datos permanecen pendientes en este teléfono.';
  }
  if (report.status === 'nothing_pending') return 'No hay cambios pendientes.';
  return `${report.synchronized} sincronizados; ${report.rejected.length} rechazados; ${report.conflicts.length} conflictos resueltos usando la versión de este dispositivo.${
    report.transportError ? ` ${report.transportError}` : ''
  }`;
}

/**
 * Sync action, reduced to a single icon (CLAUDE.md §13, corner placement per
 * product decision): the credential itself is still entered in
 * SyncPanel — this only triggers a run and reports what happened.
 *
 * `getSyncToken()`/`isSyncConfigured()` are plain module functions, not React
 * state (services/sync/session.ts), so this button needs no state shared with
 * wherever the credential field lives.
 */
export function SyncIconButton({
  onComplete,
}: {
  onComplete?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);

  async function sync() {
    if (lock.current) return;
    if (isSyncConfigured() && !getSyncToken().trim()) {
      Alert.alert(RESULT_TITLE, 'Introduce la credencial asignada a este dispositivo.');
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const repositories = await getRepositories();
      const deviceId = await repositories.deviceIdentity.getOrCreateDeviceId(
        new Date().toISOString()
      );
      const report = await runSynchronization({
        queue: repositories.syncQueue,
        transport: repositories.syncTransport,
        deviceId,
        now: () => new Date(),
      });
      Alert.alert(RESULT_TITLE, messageFor(report));
      await onComplete?.();
    } catch {
      Alert.alert(RESULT_TITLE, 'No se pudo completar la sincronización. Puedes reintentar.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
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
