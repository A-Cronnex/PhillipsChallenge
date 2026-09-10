import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SyncStatusBadge } from '../../../components/ui/SyncStatusBadge';
import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../../lib/theme';
import type { ObservationRecord } from '../domain/observation-record';
import {
  captureSourceLabel,
  confidenceLabel,
  formatTimestamp,
  formatVisitDate,
  NOT_RECORDED,
} from './observation-labels';

const ICON_SIZE = 22;

function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={styles.actionButton}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      hitSlop={8}
    >
      <MaterialIcons name={icon} size={ICON_SIZE} color={colors.onSurfaceVariant} />
    </Pressable>
  );
}

/**
 * One `Observation`, presented as a card rather than a table row — a row
 * wide enough for every field forces horizontal scrolling on a phone, which
 * CLAUDE.md §13 rules out.
 *
 * Fields shown are exactly the `Observation` attributes documented in
 * docs/domain-model.md §6; nothing here is computed or invented. `notes` is
 * deliberately excluded from both the compact and expanded field lists — it
 * is reached only through the notes action, per the product decision that a
 * note is read on request, not scanned as part of the list.
 */
export function ObservationCard({
  observation,
  expanded,
  selected,
  onToggleExpanded,
  onToggleSelected,
  onOpenNote,
  onEdit,
  onDelete,
}: {
  observation: ObservationRecord;
  expanded: boolean;
  selected: boolean;
  onToggleExpanded: () => void;
  onToggleSelected: () => void;
  onOpenNote: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.card} testID={`observation-card-${observation.id}`}>
      <View style={styles.header}>
        <Pressable
          onPress={onToggleSelected}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected }}
          accessibilityLabel="Seleccionar observación"
          testID={`observation-select-${observation.id}`}
          hitSlop={8}
        >
          <MaterialIcons
            name={selected ? 'check-box' : 'check-box-outline-blank'}
            size={ICON_SIZE}
            color={selected ? colors.primary : colors.onSurfaceVariant}
          />
        </Pressable>

        <View style={styles.headerTitle}>
          <Text style={styles.visitDate}>{formatVisitDate(observation.visitDate)}</Text>
          <Text style={styles.shortId}>#{observation.id.slice(0, 8)}</Text>
        </View>

        <View style={styles.actions}>
          <ActionButton
            icon={expanded ? 'visibility-off' : 'visibility'}
            label={expanded ? 'Ocultar detalle completo' : 'Ver detalle completo'}
            onPress={onToggleExpanded}
            testID={`observation-view-${observation.id}`}
          />
          <ActionButton
            icon="notes"
            label="Ver nota de la observación"
            onPress={onOpenNote}
            testID={`observation-note-${observation.id}`}
          />
          <ActionButton
            icon="edit"
            label="Editar observación"
            onPress={onEdit}
            testID={`observation-edit-${observation.id}`}
          />
          <ActionButton
            icon="delete"
            label="Eliminar observación"
            onPress={onDelete}
            testID={`observation-delete-${observation.id}`}
          />
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.fields}>
        <FieldRow label="Marca" value={observation.brand ?? NOT_RECORDED} />
        <FieldRow label="Modelo" value={observation.model ?? NOT_RECORDED} />
        <FieldRow label="Modalidad" value={observation.modality ?? NOT_RECORDED} />
        <FieldRow
          label="Cantidad"
          value={observation.quantity !== null ? String(observation.quantity) : NOT_RECORDED}
        />
        <FieldRow
          label="Años de uso estimados"
          value={
            observation.estimatedYearsOfUse !== null
              ? String(observation.estimatedYearsOfUse)
              : NOT_RECORDED
          }
        />
        <FieldRow
          label="Año de instalación estimado"
          value={
            observation.estimatedInstallationYear !== null
              ? String(observation.estimatedInstallationYear)
              : NOT_RECORDED
          }
        />
        <FieldRow label="Estado operativo" value={observation.operationalStatus ?? NOT_RECORDED} />
        <FieldRow label="Confianza general" value={confidenceLabel(observation.overallConfidence)} />
        <FieldRow label="Origen de la captura" value={captureSourceLabel(observation.captureSource)} />

        {expanded ? (
          <>
            <View style={styles.divider} />
            <FieldRow label="ID de la observación" value={observation.id} />
            <FieldRow label="Equipo vinculado" value={observation.equipmentId ?? 'Sin vincular'} />
            <FieldRow label="Registrado por" value={observation.createdByName ?? observation.createdBy} />
            <FieldRow label="Creado" value={formatTimestamp(observation.createdAt)} />
            <FieldRow label="Actualizado" value={formatTimestamp(observation.updatedAt)} />
          </>
        ) : null}

        {observation.syncStatus ? (
          <View style={styles.syncRow}>
            <SyncStatusBadge status={observation.syncStatus} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.surfaceVariant,
    borderRadius: 20,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
  },
  headerTitle: { flex: 1, minWidth: 0 },
  visitDate: { ...typography.titleMedium, color: colors.onSurface },
  shortId: { ...typography.labelMedium, color: colors.onSurfaceVariant },
  actions: { flexDirection: 'row' },
  actionButton: {
    minWidth: MIN_TOUCH_TARGET - 8,
    minHeight: MIN_TOUCH_TARGET - 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.surfaceVariant },
  fields: { padding: spacing.md, gap: spacing.sm },
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  fieldLabel: { ...typography.bodyMedium, color: colors.onSurfaceVariant, flexShrink: 0 },
  fieldValue: {
    ...typography.bodyMedium,
    color: colors.onSurface,
    flexShrink: 1,
    textAlign: 'right',
  },
  syncRow: { marginTop: spacing.xs, alignItems: 'flex-start' },
});
