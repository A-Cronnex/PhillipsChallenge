import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { AppButton } from '../../../components/ui/AppButton';
import { colors } from '../../../lib/theme';
import { deferredRuntime } from '../../../services/ai/deferred-runtime';
import { ObservationCaptureForm } from '../../observations/ui/ObservationCaptureForm';
import type { AiRuntime } from '../application/ports';
import { ConversationScreen } from './ConversationScreen';

export function CaptureLauncher({ userId, resolveRuntime }: { userId: string; resolveRuntime: () => Promise<AiRuntime> }) {
  const runtime = useMemo(() => deferredRuntime(resolveRuntime), [resolveRuntime]);
  const [mode, setMode] = useState<'agent' | 'manual'>('agent');
  return <View style={{ flex: 1, backgroundColor: colors.background }}>
    {mode === 'manual' ? <>
      <AppButton title="Volver al agente" onPress={() => setMode('agent')} />
      <ObservationCaptureForm />
    </> : <ConversationScreen runtime={runtime} userId={userId} onManualCapture={() => setMode('manual')} />}
  </View>;
}
