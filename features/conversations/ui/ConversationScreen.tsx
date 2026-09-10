import { Button } from 'react-native';
import { ConversationReview } from './ConversationReview';
import { VoiceRecorder } from './VoiceRecorder';
import { retainArtifact } from '../../../services/capture/artifacts';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  /**
   * Open the camera as soon as the models are ready. Set by the capture
   * launcher's photo button, so that pressing it lands on the camera instead
   * of on an empty transcript.
   */
  photoFirst?: boolean;
  /**
   * Offered when local inference is unavailable: the keyboard form is the
   * documented fallback (docs/android-installation.md §7). The screen only
   * signals the intent; the caller decides what to mount.
   */
  onManualCapture?: () => void;
}

/**
 * Capture conversation with the local agent (docs/ai-agent.md §3, §3a).
 *
 * Everything runs on the device. No input — text, photo or audio — leaves the
 * phone, and the screen never contacts the network.
 */
export function ConversationScreen({
  runtime,
  userId,
  photoFirst = false,
  onManualCapture,
}: ConversationScreenProps) {
  const chat = useConversation({ runtime, userId });
  const [draft, setDraft] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mediaError, setMediaError] = useState('');

  const takePhoto = useCallback(async () => {
    setMediaError('');
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) { setMediaError('Permite la cámara en Ajustes para tomar una foto.'); return; }
      const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
      if (!result.canceled && result.assets[0]?.uri) {
        await chat.sendPhoto(retainArtifact(result.assets[0].uri, 'image'));
      }
    } catch { setMediaError('No se pudo conservar la foto. Inténtalo de nuevo.'); }
  }, [chat.sendPhoto]);

  // The camera is opened only once the models are ready: a nameplate photo is
  // useless without the vision model, and `runtimePhase` reaches 'ready' only
  // after the user has loaded them.
  const photoRequested = useRef(false);
  useEffect(() => {
    if (!photoFirst || photoRequested.current) return;
    if (chat.runtimePhase !== 'ready') return;
    photoRequested.current = true;
    void takePhoto();
  }, [photoFirst, chat.runtimePhase, takePhoto]);

  if (reviewing) return <ConversationReview conversation={chat.conversation}
    onSaved={() => { chat.markSaved(); setReviewing(false); }} onCancel={() => setReviewing(false)} />;
  if (chat.conversation.status === 'saved') return <View style={styles.centered}>
    <Text style={styles.title}>Observación guardada en este dispositivo</Text>
    <Text>Pendiente de sincronización. Puedes consultarla en el tablero y el mapa.</Text>
    <Button title="Nueva conversación" disabled={chat.busy || recording} onPress={() => void chat.newConversation()} />
  </View>;

  if (chat.runtimePhase === 'idle') {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>Agente de captura</Text>
        <Text style={styles.body}>
          Los modelos se ejecutan en este dispositivo: {MODEL_LABELS.text} para
          el texto y {MODEL_LABELS.vision} para las fotos. La primera carga
          requiere conexión para descargar los modelos y espacio libre. Después de descargarlos podrás usarlos sin conexión.
        </Text>
        {chat.error ? <Text accessibilityRole="alert">{chat.error}</Text> : null}
        {chat.conversation.turns.length ? <Button title="Revisar conversación recuperada" disabled={chat.busy || recording} onPress={() => setReviewing(true)} /> : null}
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
      <View style={{ flex: 1 }}><ErrorState
        title="No se pudieron cargar los modelos"
        message={
          chat.runtimeError ??
          'La inferencia local no está disponible en este dispositivo.'
        }
        onRetry={() => void chat.prepare()}
      />
      {chat.conversation.turns.length ? <Button title="Revisar sin inferencia" disabled={chat.busy} onPress={() => setReviewing(true)} /> : null}
      {onManualCapture ? (
        <Pressable
          onPress={onManualCapture}
          style={styles.manualFallback}
          accessibilityRole="button"
          accessibilityLabel="Capturar con el formulario manual"
          testID="manual-capture-button"
        >
          <Text style={styles.manualFallbackText}>Capturar con el formulario</Text>
        </Pressable>
      ) : null}
      </View>
    );
  }

  function send() {
    const text = draft.trim();
    if (!text) return;
    void chat.sendText(text).then(ok => { if (ok) setDraft(''); });
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
            <Text style={styles.turnText}>Tu entrada se conservó.</Text>
            <Button title="Reintentar última entrada" disabled={chat.busy || recording} onPress={() => void chat.retryLast()} />
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

      {mediaError ? <Text accessibilityRole="alert">{mediaError}</Text> : null}
      {chat.warning ? <Text accessibilityLiveRegion="polite">{chat.warning}</Text> : null}
      <Button title="Revisar y guardar" disabled={chat.busy || recording || !chat.conversation.turns.length} onPress={() => setReviewing(true)} />
      <VoiceRecorder disabled={chat.busy} onRecorded={chat.sendVoice} onRecordingChange={setRecording} />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder="Escribe tu respuesta…"
          placeholderTextColor={colors.outline}
          editable={!chat.busy && !recording}
          accessibilityLabel="Mensaje para el agente"
          testID="composer-input"
        />
        {chat.cameraOffered ? (
          <Pressable
            onPress={() => void takePhoto()}
            disabled={chat.busy || recording}
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
          disabled={chat.busy || recording || draft.trim().length === 0}
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
  manualFallback: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  manualFallbackText: { ...typography.titleMedium, color: colors.primary },
  iconButtonDisabled: { backgroundColor: colors.disabled },
  iconButtonText: { fontSize: 20, color: colors.onPrimary },
});
