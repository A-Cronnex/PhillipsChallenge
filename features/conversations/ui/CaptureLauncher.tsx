import { MaterialIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ErrorState } from '../../../components/ui/ScreenStates';
import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../../lib/theme';
import { ObservationCaptureForm } from '../../observations/ui/ObservationCaptureForm';
import { ConversationScreen } from './ConversationScreen';
import type { AiRuntime } from '../application/ports';

interface CaptureLauncherProps {
  userId: string;
  /**
   * Builds the inference runtime. Passed as a thunk, not as a value, so the
   * launcher paints immediately: `@qvac/sdk` pulls in the Bare runtime and is
   * only touched once the field user asks for the agent (lib/ai-runtime.ts).
   */
  resolveRuntime: () => Promise<AiRuntime>;
}

type Mode =
  | { kind: 'launcher' }
  | { kind: 'agent'; runtime: AiRuntime; photoFirst: boolean }
  | { kind: 'manual' };

/**
 * Capture entry point (CLAUDE.md §13).
 *
 * Capture starts with the agent, not with a form: the field user presses one
 * button and describes what they are looking at. The keyboard form stays
 * reachable as the documented fallback for when local inference is not
 * available (docs/android-installation.md §7), but it is no longer the first
 * thing the screen offers.
 */
export function CaptureLauncher({ userId, resolveRuntime }: CaptureLauncherProps) {
  const [mode, setMode] = useState<Mode>({ kind: 'launcher' });
  const [opening, setOpening] = useState<'voice' | 'photo' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function openAgent(intent: 'voice' | 'photo') {
    if (opening) return;
    setOpening(intent);
    setError(null);
    try {
      const runtime = await resolveRuntime();
      setMode({ kind: 'agent', runtime, photoFirst: intent === 'photo' });
    } catch {
      setError(
        'No se pudo preparar el agente en este dispositivo. Puedes capturar con el formulario mientras tanto.'
      );
    } finally {
      setOpening(null);
    }
  }

  if (mode.kind === 'agent' || mode.kind === 'manual') {
    return (
      <View style={styles.hosted}>
        <Pressable
          onPress={() => setMode({ kind: 'launcher' })}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Volver a Captura"
          testID="back-to-launcher"
        >
          <MaterialIcons name="arrow-back" size={24} color={colors.onSurface} />
          <Text style={styles.backText}>Captura</Text>
        </Pressable>
        {mode.kind === 'agent' ? (
          <ConversationScreen
            runtime={mode.runtime}
            userId={userId}
            photoFirst={mode.photoFirst}
            onManualCapture={() => setMode({ kind: 'manual' })}
          />
        ) : (
          <ObservationCaptureForm />
        )}
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.hosted}>
        <ErrorState
          title="No se pudo abrir el agente"
          message={error}
          onRetry={() => void openAgent('voice')}
        />
        <Pressable
          onPress={() => setMode({ kind: 'manual' })}
          style={styles.textAction}
          accessibilityRole="button"
          accessibilityLabel="Abrir la captura manual"
          testID="manual-fallback"
        >
          <Text style={styles.textActionLabel}>Captura manual</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.launcher} testID="capture-launcher">
      <Text style={styles.title}>Captura</Text>
      <Text style={styles.body}>
        Describe el equipo en voz alta o fotografía su placa. El agente propone
        los datos y tú los revisas antes de guardarlos en este dispositivo.
      </Text>

      <Pressable
        onPress={() => void openAgent('voice')}
        disabled={opening !== null}
        style={({ pressed }) => [
          styles.micButton,
          pressed && styles.micButtonPressed,
          opening !== null && styles.micButtonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Hablar con el agente"
        accessibilityState={{ busy: opening === 'voice', disabled: opening !== null }}
        testID="voice-capture-button"
      >
        {opening === 'voice' ? (
          <ActivityIndicator size="large" color={colors.onPrimary} />
        ) : (
          <MaterialIcons name="mic" size={72} color={colors.onPrimary} />
        )}
      </Pressable>
      <Text style={styles.micLabel}>Hablar con el agente</Text>

      <Pressable
        onPress={() => void openAgent('photo')}
        disabled={opening !== null}
        style={({ pressed }) => [
          styles.photoButton,
          pressed && styles.photoButtonPressed,
          opening !== null && styles.photoButtonDisabled,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Fotografiar la placa del equipo"
        accessibilityState={{ busy: opening === 'photo', disabled: opening !== null }}
        testID="photo-capture-button"
      >
        <MaterialIcons name="photo-camera" size={24} color={colors.primary} />
        <Text style={styles.photoLabel}>Foto de la placa</Text>
      </Pressable>

      {opening ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite" testID="opening-agent">
          Abriendo el agente…
        </Text>
      ) : null}
    </View>
  );
}

const MIC_DIAMETER = 160;

const styles = StyleSheet.create({
  launcher: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
    backgroundColor: colors.background,
  },
  hosted: { flex: 1, backgroundColor: colors.background },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
  },
  backText: { ...typography.titleMedium, color: colors.onSurface },
  title: { ...typography.titleLarge, color: colors.onSurface, textAlign: 'center' },
  body: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  micButton: {
    width: MIC_DIAMETER,
    height: MIC_DIAMETER,
    borderRadius: MIC_DIAMETER / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    elevation: 6,
  },
  micButtonPressed: { opacity: 0.85 },
  micButtonDisabled: { backgroundColor: colors.disabled },
  micLabel: {
    ...typography.titleMedium,
    color: colors.onSurface,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.primary,
    backgroundColor: colors.surface,
  },
  photoButtonPressed: { opacity: 0.85 },
  photoButtonDisabled: { borderColor: colors.disabled },
  photoLabel: { ...typography.titleMedium, color: colors.primary },
  hint: { ...typography.bodyMedium, color: colors.onSurfaceVariant },
  textAction: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textActionLabel: { ...typography.titleMedium, color: colors.primary },
});
