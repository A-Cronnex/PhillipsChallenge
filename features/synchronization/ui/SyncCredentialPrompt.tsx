import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton } from '../../../components/ui/AppButton';
import { colors, MIN_TOUCH_TARGET, radii, spacing, typography } from '../../../lib/theme';

/**
 * Asks for the synchronization credential, only when one is actually needed.
 *
 * It used to be a permanent field on the dashboard (`SyncPanel`). That put a
 * password box in front of a user who, most of the time, is working offline and
 * has nothing to sync — so it was removed from that screen (product decision,
 * 2026-09-10) and the request moved here, to the moment the credential is
 * required.
 *
 * The value is handed to the caller and never stored by this component: it
 * lives in memory for the session only (`services/sync/session.ts`), which is
 * why it has to be asked for again after the app restarts.
 */
export function SyncCredentialPrompt({ visible, onSubmit, onCancel }: {
  visible: boolean;
  onSubmit: (token: string) => void;
  onCancel: () => void;
}) {
  const [token, setToken] = useState('');

  function submit() {
    const trimmed = token.trim();
    if (!trimmed) return;
    setToken('');
    onSubmit(trimmed);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cerrar">
        {/* Stops a tap inside the card from dismissing it. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title} accessibilityRole="header">Credencial de sincronización</Text>
          <Text style={styles.body}>
            Se guarda solo mientras la aplicación está abierta. Tus datos siguen
            guardados en el dispositivo aunque no sincronices.
          </Text>
          <TextInput
            accessibilityLabel="Credencial de sincronización"
            placeholder="Credencial"
            placeholderTextColor={colors.onSurfaceVariant}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            value={token}
            onChangeText={setToken}
            onSubmitEditing={submit}
            returnKeyType="go"
            style={styles.input}
            testID="sync-credential-input"
          />
          <AppButton title="Sincronizar" disabled={!token.trim()} onPress={submit} />
          <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button">
            <Text style={styles.link}>Cancelar</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000AA', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  card: { width: '100%', maxWidth: 420, gap: spacing.sm, padding: spacing.lg, borderRadius: radii.md,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { ...typography.titleMedium, color: colors.onSurface },
  body: { ...typography.bodyMedium, color: colors.onSurfaceVariant, lineHeight: 21 },
  input: { minHeight: MIN_TOUCH_TARGET, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm,
    paddingHorizontal: spacing.md, color: colors.onSurface, backgroundColor: colors.background, ...typography.bodyLarge },
  cancel: { minHeight: MIN_TOUCH_TARGET, alignItems: 'center', justifyContent: 'center' },
  link: { ...typography.bodyMedium, color: colors.primary },
});
