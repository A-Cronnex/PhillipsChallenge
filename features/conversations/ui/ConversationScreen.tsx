import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ErrorState } from '../../../components/ui/ScreenStates';
import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../../lib/theme';
import { MODEL_LABELS } from '../../../services/ai/models';
import { CAPTURE_FIELD_SPECS, REQUIRED_FIELDS } from '../domain/fields';
import { isKnown } from '../domain/conversation';
import { useConversation } from './useConversation';
import type { AiRuntime } from '../application/ports';

interface ConversationScreenProps {
  runtime: AiRuntime;
  userId: string;
}

/**
 * Capture conversation with the local agent (docs/ai-agent.md §3, §3a).
 *
 * Everything runs on the device. No input — text, photo or audio — leaves the
 * phone, and the screen never contacts the network.
 */
export function ConversationScreen({ runtime, userId }: ConversationScreenProps) {
  const chat = useConversation({ runtime, userId });
  const [draft, setDraft] = useState('');

  if (chat.runtimePhase === 'idle') {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Agente de captura</Text>
        <Text style={styles.body}>
          Los modelos se ejecutan en este dispositivo: {MODEL_LABELS.text} para
          el texto y {MODEL_LABELS.vision} para las fotos. La primera carga
          puede tardar.
        </Text>
        <Pressable
          onPress={() => void chat.prepare()}
          style={styles.primaryButton}
          accessibilityRole="button"
          accessibilityLabel="Cargar los modelos"
          testID="prepare-button"
        >
          <Text style={styles.primaryButtonText}>Cargar modelos</Text>
        </Pressable>
      </View>
    );
  }

  if (chat.runtimePhase === 'preparing') {
    return (
      <View style={styles.centered} accessibilityLiveRegion="polite">
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.body} testID="preparing">
          Cargando los modelos en el dispositivo…
        </Text>
      </View>
    );
  }

  if (chat.runtimePhase === 'unavailable') {
    return (
      <ErrorState
        title="No se pudieron cargar los modelos"
        message={
          chat.runtimeError ??
          'La inferencia local no está disponible en este dispositivo.'
        }
        onRetry={() => void chat.prepare()}
      />
    );
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    // The image stays on the device; only its local path is passed along.
    if (!result.canceled && result.assets[0]?.uri) {
      void chat.sendPhoto(result.assets[0].uri);
    }
  }

  function send() {
    const text = draft.trim();
    if (text.length === 0) return;
    setDraft('');
    void chat.sendText(text);
  }

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.transcript} contentContainerStyle={styles.transcriptContent}>
        {chat.conversation.turns.length === 0 ? (
          <Text style={styles.body} testID="conversation-empty">
            Describe el equipo que estás viendo, o toma una foto de la placa.
          </Text>
        ) : (
          chat.conversation.turns.map((turn, index) => (
            <View
              key={`${turn.at}-${index}`}
              style={[styles.turn, turn.role === 'agent' ? styles.agentTurn : styles.userTurn]}
            >
              <Text style={styles.turnRole}>
                {turn.role === 'agent' ? 'Agente' : 'Tú'}
                {turn.source !== 'text' ? ` · ${turn.source}` : ''}
              </Text>
              <Text style={styles.turnText}>{turn.text}</Text>
            </View>
          ))
        )}

        {chat.error ? (
          <View style={styles.errorBanner} accessibilityLiveRegion="polite" testID="turn-error">
            <Text style={styles.errorTitle}>No se pudo procesar</Text>
            <Text style={styles.turnText}>{chat.error}</Text>
            <Text style={styles.turnText}>
              Tu entrada se conservó. Puedes intentarlo de nuevo.
            </Text>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.progress} testID="field-progress">
        <Text style={styles.progressTitle}>Campos requeridos</Text>
        <View style={styles.chips}>
          {REQUIRED_FIELDS.map((field) => {
            const known = isKnown(chat.conversation.fields[field]);
            return (
              <View
                key={field}
                style={[styles.chip, known && styles.chipDone]}
                accessibilityLabel={`${CAPTURE_FIELD_SPECS[field].label}: ${
                  known ? 'capturado' : 'pendiente'
                }`}
              >
                <Text style={[styles.chipText, known && styles.chipTextDone]}>
                  {known ? '✓ ' : ''}
                  {CAPTURE_FIELD_SPECS[field].label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Escribe tu respuesta…"
          placeholderTextColor={colors.outline}
          editable={!chat.busy}
          accessibilityLabel="Mensaje para el agente"
          testID="composer-input"
        />
        {chat.cameraOffered ? (
          <Pressable
            onPress={() => void takePhoto()}
            disabled={chat.busy}
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel="Tomar una foto"
            testID="camera-button"
          >
            <Text style={styles.iconButtonText}>📷</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={send}
          disabled={chat.busy || draft.trim().length === 0}
          style={[
            styles.iconButton,
            (chat.busy || draft.trim().length === 0) && styles.iconButtonDisabled,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Enviar"
          accessibilityState={{ busy: chat.busy }}
          testID="send-button"
        >
          <Text style={styles.iconButtonText}>{chat.busy ? '…' : '➤'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { ...typography.titleLarge, color: colors.onSurface, textAlign: 'center' },
  body: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  primaryButtonText: { ...typography.titleMedium, color: colors.onPrimary },
  transcript: { flex: 1 },
  transcriptContent: { padding: spacing.md, gap: spacing.sm },
  turn: { padding: spacing.sm, borderRadius: 8, maxWidth: '90%' },
  agentTurn: { backgroundColor: colors.surfaceVariant, alignSelf: 'flex-start' },
  userTurn: { backgroundColor: colors.pendingContainer, alignSelf: 'flex-end' },
  turnRole: { ...typography.labelMedium, color: colors.onSurfaceVariant },
  turnText: { ...typography.bodyMedium, color: colors.onSurface, marginTop: 2 },
  errorBanner: {
    padding: spacing.sm,
    borderRadius: 4,
    backgroundColor: colors.errorContainer,
    gap: spacing.xs,
  },
  errorTitle: { ...typography.labelMedium, color: colors.error },
  progress: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
  },
  progressTitle: { ...typography.labelMedium, color: colors.onSurfaceVariant },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.outline,
  },
  chipDone: { backgroundColor: colors.successContainer, borderColor: colors.success },
  chipText: { ...typography.labelMedium, color: colors.onSurfaceVariant },
  chipTextDone: { color: colors.success },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.surfaceVariant,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.outline,
    borderRadius: 4,
    paddingHorizontal: spacing.md,
    color: colors.onSurface,
    ...typography.bodyLarge,
  },
  iconButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  iconButtonDisabled: { backgroundColor: colors.disabled },
  iconButtonText: { fontSize: 20, color: colors.onPrimary },
});
