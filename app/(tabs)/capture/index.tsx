import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';

import { ErrorState, LoadingState } from '../../../components/ui/ScreenStates';
import { CaptureLauncher } from '../../../features/conversations/ui/CaptureLauncher';
import { getAiRuntime } from '../../../lib/ai-runtime';
import { getRepositories } from '../../../lib/container';

/**
 * Capture route.
 *
 * Composition root for the section: it resolves the local user and hands the
 * runtime factory down. The factory is passed unresolved on purpose — the
 * launcher must paint its buttons without waiting on QVAC, which is only
 * constructed when the user actually asks for the agent.
 */
export default function CaptureRoute() {
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const repositories = await getRepositories();
        const user = await repositories.users.getCurrentUser();
        if (cancelled) return;

        if (!user) {
          setError(
            'No hay un usuario configurado en este dispositivo, así que no se puede registrar quién hace la captura.'
          );
          return;
        }
        setUserId(user.id);
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return <ErrorState title="No se pudo abrir la captura" message={error} />;
  }

  if (!userId) {
    return <LoadingState message="Abriendo datos locales…" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <CaptureLauncher userId={userId} resolveRuntime={getAiRuntime} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
});
