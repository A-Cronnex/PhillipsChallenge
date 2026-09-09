import { useEffect, useState } from 'react';
import { SafeAreaView, StyleSheet } from 'react-native';

import { ErrorState, LoadingState } from '../../../components/ui/ScreenStates';
import { ConversationScreen } from '../../../features/conversations/ui/ConversationScreen';
import type { AiRuntime } from '../../../features/conversations/application/ports';
import { getRepositories } from '../../../lib/container';
import { getAiRuntime } from '../../../lib/ai-runtime';

/**
 * Conversations route.
 *
 * Resolves the local user and the inference runtime, then hands both to the
 * feature screen. The runtime is only constructed here, never inside the
 * screen, so the screen stays testable without QVAC.
 */
export default function ConversationsRoute() {
  const [runtime, setRuntime] = useState<AiRuntime | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const [ai, repositories] = await Promise.all([
          getAiRuntime(),
          getRepositories(),
        ]);
        const user = await repositories.users.getCurrentUser();
        if (cancelled) return;

        if (!user) {
          setError(
            'No hay un usuario configurado en este dispositivo, así que no se puede registrar quién hace la captura.'
          );
          return;
        }
        setRuntime(ai);
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
    return <ErrorState title="No se pudo abrir el agente" message={error} />;
  }

  if (!runtime || !userId) {
    return <LoadingState message="Preparando el agente local…" />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ConversationScreen runtime={runtime} userId={userId} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({ safeArea: { flex: 1 } });
