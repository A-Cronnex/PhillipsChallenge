import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../../lib/theme';
import type { ObservationRecord } from '../domain/observation-record';

/**
 * Shows the `notes` attribute of one observation (docs/domain-model.md §6),
 * verbatim — never generated, summarized or otherwise touched, per the
 * product decision that a captured note is field-user testimony, not
 * something to run through the AI runtime.
 *
 * A modal rather than a bottom sheet: no bottom-sheet library is installed,
 * and adding one for a single read-only panel would be a new dependency this
 * feature does not need. React Native's own `Modal` covers it.
 */
export function ObservationNoteModal({
  observation,
  onClose,
}: {
  observation: ObservationRecord | null;
  onClose: () => void;
}) {
  const visible = observation !== null;
  const note = observation?.notes?.trim() || null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      testID="observation-note-modal"
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Nota de la observación</Text>
          <ScrollView style={styles.body}>
            {note ? (
              <Text style={styles.noteText} testID="observation-note-text">
                {note}
              </Text>
            ) : (
              <Text style={styles.emptyText} testID="observation-note-empty">
                No hay notas registradas para esta observación.
              </Text>
            )}
          </ScrollView>
          <Pressable
            onPress={onClose}
            style={styles.closeButton}
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            testID="observation-note-close"
          >
            <Text style={styles.closeButtonText}>Cerrar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    padding: spacing.lg,
    maxHeight: '70%',
    gap: spacing.md,
  },
  title: { ...typography.titleMedium, color: colors.onSurface },
  body: { flexGrow: 0 },
  noteText: { ...typography.bodyLarge, color: colors.onSurface },
  emptyText: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    fontStyle: 'italic',
  },
  closeButton: {
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  closeButtonText: { ...typography.titleMedium, color: colors.onPrimary },
});
