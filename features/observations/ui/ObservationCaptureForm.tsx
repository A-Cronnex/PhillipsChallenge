import { AppButton as Button } from '../../../components/ui/AppButton';
import {  } from 'react-native';
import { SiteCreator } from '../../catalog/ui/SiteCreator';
import { EquipmentPicker } from '../../catalog/ui/EquipmentPicker';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ConfidenceSelector } from '../../../components/forms/ConfidenceSelector';
import { OptionPicker } from '../../../components/forms/OptionPicker';
import { TextField } from '../../../components/forms/TextField';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../../components/ui/ScreenStates';
import { SyncStatusBadge } from '../../../components/ui/SyncStatusBadge';
import { colors, MIN_TOUCH_TARGET, spacing, typography } from '../../../lib/theme';
import { issuesByField } from './messages';
import { setConfidence } from './form-mapping';
import { useObservationCapture } from './useObservationCapture';

/**
 * Manual observation capture.
 *
 * Keyboard entry only — no AI, no voice, no image. Everything on this screen
 * works with the network unavailable: the site list is read from the local
 * database and the observation is written locally, so nothing here waits on a
 * request (docs/offline-sync.md §2).
 */
export function ObservationCaptureForm() {
  const capture = useObservationCapture();
  const errors = issuesByField(capture.issues);

  if (capture.phase === 'loading') {
    return <LoadingState message="Abriendo la base de datos local…" />;
  }

  if (capture.phase === 'unavailable') {
    return (
      <ErrorState
        title="No se pudo abrir la base de datos local"
        message={
          capture.loadError ??
          'Ocurrió un error inesperado al preparar el almacenamiento local.'
        }
        onRetry={capture.reload}
      />
    );
  }

  if (!capture.currentUser) {
    // created_by is NOT NULL: an observation attributed to nobody cannot be
    // saved. Authentication is still an open decision (CLAUDE.md §18).
    return (
      <EmptyState
        title="No hay un usuario en este dispositivo"
        message="Todavía no se ha configurado el usuario local, así que no se puede registrar quién hace la observación."
      />
    );
  }

  if (capture.sites.length === 0) {
    return (
      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
        <Text style={{ color: colors.onSurfaceVariant }}>No hay sitios guardados. Registra el primero para comenzar.</Text>
        <Button title="Actualizar sitios" onPress={() => void capture.reload()} />
        <SiteCreator onCreated={async id => { await capture.reload(); capture.update({ siteId: id }); }} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID="capture-form"
    >
      <Text style={styles.title}>Nueva observación</Text>
      <Text style={styles.subtitle}>
        Captura manual. Se guarda en este dispositivo aunque no haya conexión.
      </Text>

      {capture.confirmation ? (
        <View style={styles.confirmation} accessibilityLiveRegion="polite" testID="save-confirmation">
          <Text style={styles.confirmationTitle}>Observación guardada</Text>
          <SyncStatusBadge status={capture.confirmation.syncStatus} showDescription />
        </View>
      ) : null}

      {capture.saveError ? (
        <View style={styles.saveError} accessibilityLiveRegion="polite" testID="save-error">
          <Text style={styles.saveErrorTitle}>No se pudo guardar</Text>
          <Text style={styles.saveErrorText}>{capture.saveError}</Text>
          <Text style={styles.saveErrorText}>
            Los datos que escribiste siguen en el formulario.
          </Text>
        </View>
      ) : null}

      <OptionPicker
        label="Sitio"
        required
        options={capture.sites.map((site) => ({
          value: site.id,
          label: site.name,
          detail: [site.city, site.country].filter(Boolean).join(', ') || undefined,
        }))}
        selected={capture.values.siteId}
        onSelect={(siteId) => capture.update({ siteId, equipmentId: null })}
        error={errors.siteId}
        emptyMessage="No hay sitios disponibles."
        testID="site-picker"
      />

      <SiteCreator onCreated={async id => { await capture.reload(); capture.update({ siteId: id, equipmentId: null }); }} />
      <EquipmentPicker key={capture.confirmation?.observationId ?? 'draft'} siteId={capture.values.siteId} selected={capture.values.equipmentId ?? null}
        onSelect={equipmentId => capture.update({ equipmentId })} />

      <TextField
        label="Fecha de la visita"
        required
        value={capture.values.visitDate}
        onChangeText={(visitDate) => capture.update({ visitDate })}
        placeholder="AAAA-MM-DD"
        hint="Formato AAAA-MM-DD."
        error={errors.visitDate}
        testID="input-visit-date"
      />

      <Text style={styles.sectionTitle}>Equipo</Text>

      <TextField
        label="Marca"
        value={capture.values.brand}
        onChangeText={(brand) => capture.update({ brand })}
        error={errors.brand}
        testID="input-brand"
      />
      {capture.values.brand.trim() ? (
        <ConfidenceSelector
          attributeLabel="marca"
          value={capture.values.attributeConfidence.brand}
          onChange={(level) =>
            capture.replaceValues(setConfidence(capture.values, 'brand', level))
          }
          testID="confidence-brand"
        />
      ) : null}

      <TextField
        label="Modelo"
        value={capture.values.model}
        onChangeText={(model) => capture.update({ model })}
        testID="input-model"
      />
      {capture.values.model.trim() ? (
        <ConfidenceSelector
          attributeLabel="modelo"
          value={capture.values.attributeConfidence.model}
          onChange={(level) =>
            capture.replaceValues(setConfidence(capture.values, 'model', level))
          }
          testID="confidence-model"
        />
      ) : null}

      <TextField
        label="Modalidad"
        value={capture.values.modality}
        onChangeText={(modality) => capture.update({ modality })}
        hint="Por ejemplo: Monitor, Ultrasonido, Rayos X."
        testID="input-modality"
      />
      {capture.values.modality.trim() ? (
        <ConfidenceSelector
          attributeLabel="modalidad"
          value={capture.values.attributeConfidence.modality}
          onChange={(level) =>
            capture.replaceValues(setConfidence(capture.values, 'modality', level))
          }
          testID="confidence-modality"
        />
      ) : null}

      <TextField
        label="Cantidad"
        value={capture.values.quantity}
        onChangeText={(quantity) => capture.update({ quantity })}
        keyboardType="number-pad"
        hint="Número de equipos iguales observados."
        error={errors.quantity}
        testID="input-quantity"
      />

      <Text style={styles.sectionTitle}>Antigüedad y estado</Text>

      <TextField
        label="Años de uso estimados"
        value={capture.values.estimatedYearsOfUse}
        onChangeText={(estimatedYearsOfUse) =>
          capture.update({ estimatedYearsOfUse })
        }
        keyboardType="number-pad"
        error={errors.estimatedYearsOfUse}
        testID="input-years-of-use"
      />

      <TextField
        label="Año de instalación estimado"
        value={capture.values.estimatedInstallationYear}
        onChangeText={(estimatedInstallationYear) =>
          capture.update({ estimatedInstallationYear })
        }
        keyboardType="number-pad"
        error={errors.estimatedInstallationYear}
        testID="input-installation-year"
      />
      {capture.values.estimatedInstallationYear.trim() ? (
        <ConfidenceSelector
          attributeLabel="año de instalación"
          value={capture.values.attributeConfidence.installation_year}
          onChange={(level) =>
            capture.replaceValues(
              setConfidence(capture.values, 'installation_year', level)
            )
          }
          testID="confidence-installation-year"
        />
      ) : null}

      <TextField
        label="Estado operativo"
        value={capture.values.operationalStatus}
        onChangeText={(operationalStatus) => capture.update({ operationalStatus })}
        hint="Texto libre: aún no hay una lista de valores definida."
        testID="input-operational-status"
      />
      {capture.values.operationalStatus.trim() ? (
        <ConfidenceSelector
          attributeLabel="estado operativo"
          value={capture.values.attributeConfidence.operational_status}
          onChange={(level) =>
            capture.replaceValues(
              setConfidence(capture.values, 'operational_status', level)
            )
          }
          testID="confidence-operational-status"
        />
      ) : null}

      <TextField
        label="Notas"
        value={capture.values.notes}
        onChangeText={(notes) => capture.update({ notes })}
        multiline
        hint="Se guardan en el idioma en que las escribas."
        testID="input-notes"
      />

      {errors['attributeConfidence.brand'] ??
      errors['attributeConfidence.model'] ??
      errors['attributeConfidence.modality'] ??
      errors['attributeConfidence.installation_year'] ??
      errors['attributeConfidence.operational_status'] ? (
        <Text style={styles.confidenceError} accessibilityLiveRegion="polite">
          {errors['attributeConfidence.brand'] ??
            errors['attributeConfidence.model'] ??
            errors['attributeConfidence.modality'] ??
            errors['attributeConfidence.installation_year'] ??
            errors['attributeConfidence.operational_status']}
        </Text>
      ) : null}

      <Pressable
        onPress={() => void capture.submit()}
        disabled={!capture.canSubmit}
        style={[styles.submit, !capture.canSubmit && styles.submitDisabled]}
        accessibilityRole="button"
        accessibilityLabel="Guardar observación"
        accessibilityState={{ disabled: !capture.canSubmit, busy: capture.saving }}
        testID="submit-button"
      >
        <Text style={styles.submitText}>
          {capture.saving ? 'Guardando…' : 'Guardar observación'}
        </Text>
      </Pressable>

      <Text style={styles.footnote}>
        La observación se guarda primero en este dispositivo. Todavía no existe
        un servidor configurado, así que permanecerá pendiente de sincronizar.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: spacing.xl },
  title: { ...typography.titleLarge, color: colors.onSurface },
  subtitle: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.titleMedium,
    color: colors.onSurface,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  confirmation: {
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.successContainer,
    gap: spacing.sm,
  },
  confirmationTitle: { ...typography.titleMedium, color: colors.success },
  saveError: {
    padding: spacing.md,
    marginBottom: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.errorContainer,
    gap: spacing.xs,
  },
  saveErrorTitle: { ...typography.titleMedium, color: colors.error },
  saveErrorText: { ...typography.bodyMedium, color: colors.onSurface },
  confidenceError: {
    ...typography.bodyMedium,
    color: colors.error,
    marginBottom: spacing.sm,
  },
  submit: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: colors.primary,
    marginTop: spacing.lg,
  },
  submitDisabled: { backgroundColor: colors.disabled },
  submitText: { ...typography.titleMedium, color: colors.onPrimary },
  footnote: {
    ...typography.bodyMedium,
    color: colors.onSurfaceVariant,
    marginTop: spacing.md,
  },
});
