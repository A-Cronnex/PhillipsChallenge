import { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TextField } from '../../../components/forms/TextField';
import { ConfidenceSelector } from '../../../components/forms/ConfidenceSelector';
import { AppButton } from '../../../components/ui/AppButton';
import { colors, radii, spacing, typography } from '../../../lib/theme';
import { CAPTURE_FIELD_SPECS } from '../domain/fields';
import type { ExtractedValue } from '../domain/extraction';
import { validateNameplateEdits, type NameplateProposal } from '../application/nameplate-review';

export function NameplateReview({ proposal, busy, error, onAccept, onCancel }: {
  proposal: NameplateProposal; busy: boolean; error?: string;
  onAccept: (edits: ExtractedValue[]) => void; onCancel: () => void;
}) {
  const [rows, setRows] = useState(() => proposal.values.map(item => ({ ...item, input: item.value === null ? '' : String(item.value) })));
  const [validation, setValidation] = useState('');
  function accept() {
    try {
      const edits = rows.map(({ input, ...row }) => ({ ...row, value: !input.trim() ? null : CAPTURE_FIELD_SPECS[row.field].kind === 'integer' ? Number(input) : input.trim() }));
      onAccept(validateNameplateEdits(proposal, edits));
      setValidation('');
    } catch (caught) { setValidation(caught instanceof Error ? caught.message : 'Revisa los campos.'); }
  }
  return <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.eyebrow}>REVISIÓN DE PLACA</Text>
    <Text style={styles.title} accessibilityRole="header">Confirma lo que leí</Text>
    <Text style={styles.body}>Estos datos todavía no se han enviado a la conversación. Corrige lo necesario; lo que no se pudo leer seguirá pendiente.</Text>
    <Image source={{ uri: proposal.imagePath }} style={styles.preview} resizeMode="contain" accessibilityLabel="Fotografía de la placa que se está revisando" />
    {proposal.rejected.length ? <Text style={styles.notice}>Se descartaron valores que no superaron la validación.</Text> : null}
    {rows.map((row, index) => <View key={row.field} style={styles.card}>
      <TextField label={CAPTURE_FIELD_SPECS[row.field].label} value={row.input} placeholder="No se pudo leer"
        keyboardType={CAPTURE_FIELD_SPECS[row.field].kind === 'integer' ? 'numeric' : 'default'}
        onChangeText={input => { if (!busy) setRows(current => current.map((item, i) => i === index ? { ...item, input } : item)); }} />
      <Text style={styles.body}>{row.input === String(row.value ?? '') ? 'Origen: fotografía' : 'Origen: corrección del usuario'}</Text>
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
  card: { padding: spacing.md, gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.border },
  notice: { ...typography.bodyMedium, color: colors.pending },
  error: { ...typography.bodyMedium, color: colors.error },
});
