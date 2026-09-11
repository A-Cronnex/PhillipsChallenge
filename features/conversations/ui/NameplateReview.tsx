import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextField } from '../../../components/forms/TextField';
import { ConfidenceSelector } from '../../../components/forms/ConfidenceSelector';
import { AppButton } from '../../../components/ui/AppButton';
import { colors, radii, spacing, typography } from '../../../lib/theme';
import { CAPTURE_FIELD_SPECS } from '../domain/fields';
import type { ConfidenceLevel } from '../../../types/domain';
import type { ExtractedValue } from '../domain/extraction';
import { describeUnreadable, validateNameplateEdits, type NameplateProposal } from '../application/nameplate-review';

interface Row {
  field: ExtractedValue['field'];
  input: string;
  status: ExtractedValue['status'];
  confidence: ConfidenceLevel;
  /** false = the model returned nothing for this field; the row starts empty. */
  read: boolean;
  value: string | number | null;
}

export function NameplateReview({ proposal, busy, error, onAccept, onCancel }: {
  proposal: NameplateProposal; busy: boolean; error?: string;
  onAccept: (edits: ExtractedValue[]) => void; onCancel: () => void;
}) {
  const [rows, setRows] = useState<Row[]>(() => [
    ...proposal.values.map(item => ({ ...item, input: item.value === null ? '' : String(item.value), read: true })),
    ...proposal.unreadable.map(field => ({
      field, input: '', value: null as string | number | null,
      status: 'unknown' as ExtractedValue['status'], confidence: 'low' as ConfidenceLevel, read: false,
    })),
  ]);
  const [validation, setValidation] = useState('');
  function accept() {
    try {
      const edits = rows.map(({ input, read, ...row }) => ({ ...row, value: !input.trim() ? null : CAPTURE_FIELD_SPECS[row.field].kind === 'integer' ? Number(input) : input.trim() }));
      onAccept(validateNameplateEdits(proposal, edits));
      setValidation('');
    } catch (caught) { setValidation(caught instanceof Error ? caught.message : 'Revisa los campos.'); }
  }
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>REVISIÓN DE PLACA</Text>
    <Text style={styles.title} accessibilityRole="header">Confirma lo que leí</Text>
    <Text style={styles.body}>Estos datos todavía no se han enviado a la conversación. Corrige lo necesario; lo que no se pudo leer seguirá pendiente.</Text>
    <Image source={{ uri: proposal.imagePath }} style={styles.preview} resizeMode="contain" accessibilityLabel="Fotografía de la placa que se está revisando" />
    <View style={styles.summary}>
      <Text style={styles.summaryLine} testID="vision-detected">Se detectó una placa de identificación.</Text>
      <Text style={styles.summaryLine} testID="vision-read-count">
        {proposal.values.length ? `Leí ${proposal.values.length} campo(s): ${proposal.values.map(v => CAPTURE_FIELD_SPECS[v.field].label).join(', ')}.` : 'No pude leer ningún campo de forma automática.'}
      </Text>
      {proposal.unreadable.length ? <Text style={[styles.summaryLine, styles.pending]} testID="vision-unreadable">
        No se pudo leer: {describeUnreadable(proposal.unreadable)}. Escríbelo abajo o toma otra foto.
      </Text> : null}
      {proposal.rejected.length ? <Text style={[styles.summaryLine, styles.pending]} testID="vision-rejected">
        Se descartaron {proposal.rejected.length} valor(es) que no superaron la validación.
      </Text> : null}
    </View>
    {rows.map((row, index) => <View key={row.field} style={styles.card}>
      <TextField label={CAPTURE_FIELD_SPECS[row.field].label} value={row.input} placeholder="No se pudo leer"
        keyboardType={CAPTURE_FIELD_SPECS[row.field].kind === 'integer' ? 'numeric' : 'default'}
        onChangeText={input => { if (!busy) setRows(current => current.map((item, i) => i === index ? { ...item, input } : item)); }} />
      <Text style={styles.body}>{!row.read ? 'Origen: sin leer — escríbelo tú' : row.input === String(row.value ?? '') ? 'Origen: fotografía' : 'Origen: corrección del usuario'}</Text>
      <ConfidenceSelector attributeLabel={CAPTURE_FIELD_SPECS[row.field].label} value={row.confidence}
        onChange={confidence => { if (!busy && confidence) setRows(current => current.map((item, i) => i === index ? { ...item, confidence } : item)); }} />
    </View>)}
    {validation || error ? <Text style={styles.error} accessibilityRole="alert">{validation || error}</Text> : null}
    <AppButton title={busy ? 'Incorporando al chat…' : 'Aceptar cambios y enviar'} disabled={busy} onPress={accept} />
    <Text style={styles.body}>Se incorpora al chat en este dispositivo. La observación se guarda después de su revisión final.</Text>
    <AppButton title="Cancelar y volver al chat" disabled={busy} onPress={onCancel} />
  </ScrollView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.md, width: '100%', maxWidth: 720, alignSelf: 'center' },
  eyebrow: { ...typography.labelMedium, color: colors.primary, letterSpacing: 1.5 },
  title: { ...typography.titleLarge, color: colors.onSurface },
  body: { ...typography.bodyMedium, color: colors.onSurfaceVariant, lineHeight: 21 },
  preview: { height: 180, width: '100%', backgroundColor: colors.surface, borderRadius: radii.md },
  summary: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.border },
  summaryLine: { ...typography.bodyMedium, color: colors.onSurface, lineHeight: 20 },
  pending: { color: colors.pending },
  card: { padding: spacing.md, gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.border },
  error: { ...typography.bodyMedium, color: colors.error },
});
