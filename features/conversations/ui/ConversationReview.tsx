import { AppButton as Button } from '../../../components/ui/AppButton';
import { useConversationReview } from './useConversationReview';
import { colors, radii, spacing, typography } from '../../../lib/theme';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { TextField } from '../../../components/forms/TextField';
import { ConfidenceSelector } from '../../../components/forms/ConfidenceSelector';
import { OptionPicker } from '../../../components/forms/OptionPicker';
import { SiteCreator } from '../../catalog/ui/SiteCreator';
import { EquipmentPicker } from '../../catalog/ui/EquipmentPicker';
import { CAPTURE_FIELD_SPECS } from '../domain/fields';
import { FIELD_CONFIDENCE_ATTRIBUTE } from '../domain/confidence';
import { describeSite } from '../application/site-resolution';
import { type ConversationState } from '../domain/conversation';

export function ConversationReview({ conversation, onSaved, onCancel }: {
  conversation: ConversationState; onSaved: () => void; onCancel: () => void;
}) {
  const { sites, loadedSites, values, setValues, error, busy, loadSites, save,
    resolution, browsingAll, setBrowsingAll, createResolvedSite } = useConversationReview(conversation, onSaved);

  const selectSite = (siteId: string | null) => setValues(v => ({ ...v, siteId, equipmentId: null }));
  const browseLink = <Pressable accessibilityRole="button" onPress={() => setBrowsingAll(true)} testID="browse-all-sites">
    <Text style={styles.link}>No es este sitio — elegir otro</Text>
  </Pressable>;

  /**
   * Only the site the conversation actually named is shown. Listing every
   * other hospital here is what let an observation be attached to the wrong
   * customer (see `application/site-resolution.ts`), so the full catalogue is
   * behind `browsingAll`.
   */
  function siteSection() {
    if (browsingAll || resolution.kind === 'unnamed') {
      return <View style={styles.block} testID="site-browser">
        <Text style={styles.body}>
          {resolution.kind === 'unnamed'
            ? 'El agente no registró el nombre del sitio. Elígelo o regístralo.'
            : 'Elige el sitio al que pertenece esta observación.'}
        </Text>
        <OptionPicker label="Sitio" selected={values.siteId} options={sites.map(site => ({ value: site.id, label: site.name,
          detail: [site.city, site.country].filter(Boolean).join(', ') }))} onSelect={selectSite} emptyMessage="Registra un sitio" />
        <SiteCreator onCreated={async id => { await loadSites(); selectSite(id); }} />
      </View>;
    }
    if (!loadedSites) return <Text style={styles.body} testID="site-loading">Buscando el sitio en el catálogo local…</Text>;
    if (resolution.kind === 'matched') {
      return <View style={styles.block} testID="site-matched">
        <Text style={styles.label}>SITIO DE LA OBSERVACIÓN</Text>
        <Text style={styles.siteName}>{describeSite(resolution.site)}</Text>
        <Text style={styles.body}>Es el sitio que mencionaste en la conversación. La observación se guardará aquí.</Text>
        {browseLink}
      </View>;
    }
    if (resolution.kind === 'ambiguous') {
      return <View style={styles.block} testID="site-ambiguous">
        <Text style={styles.label}>SITIO DE LA OBSERVACIÓN</Text>
        <Text style={styles.body}>Hay {resolution.candidates.length} sitios registrados con el nombre «{resolution.capturedName}». Indica cuál es.</Text>
        <OptionPicker label="Sitio" selected={values.siteId} options={resolution.candidates.map(site => ({ value: site.id, label: site.name,
          detail: [site.city, site.country].filter(Boolean).join(', ') }))} onSelect={selectSite} emptyMessage="Registra un sitio" />
        {browseLink}
      </View>;
    }
    // kind === 'new'
    const created = values.siteId !== null;
    return <View style={styles.block} testID="site-new">
      <Text style={styles.label}>SITIO DE LA OBSERVACIÓN</Text>
      <Text style={styles.siteName}>{describeSite(resolution.draft)}</Text>
      {created
        ? <Text style={styles.body} testID="site-created">Sitio creado en este dispositivo. La observación se guardará aquí.</Text>
        : <>
          <Text style={styles.body}>Este sitio todavía no está en el catálogo local. Se creará con el nombre que mencionaste.</Text>
          <Button title={busy ? 'Creando…' : 'Crear y usar este sitio'} disabled={busy} onPress={() => void createResolvedSite()} />
        </>}
      {browseLink}
    </View>;
  }

  return <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
    <Text style={{ fontSize: 24, color: colors.onSurface }}>Revisar observación</Text>
    <Text style={styles.body}>Confirma el sitio y corrige los valores propuestos. Los campos desconocidos pueden quedar vacíos.</Text>
    {siteSection()}
    <EquipmentPicker siteId={values.siteId} selected={values.equipmentId ?? null} onSelect={equipmentId => setValues(v => ({ ...v, equipmentId }))} />
    <TextField label="Fecha de visita (AAAA-MM-DD)" value={values.visitDate} onChangeText={visitDate => setValues(v => ({ ...v, visitDate }))} />
    {Object.entries(CAPTURE_FIELD_SPECS).filter(([field]) => field in values).map(([field, spec]) => {
      const key = field as keyof typeof conversation.fields;
      const attribute = FIELD_CONFIDENCE_ATTRIBUTE[key];
      const value = String(values[field as keyof typeof values] ?? '');
      return <ScrollView key={field} scrollEnabled={false}>
        <TextField label={spec.label} value={value} onChangeText={text => setValues(v => ({ ...v, [field]: text,
          attributeConfidence: attribute && !text.trim() ? { ...v.attributeConfidence, [attribute]: undefined } : v.attributeConfidence }))} />
        {attribute && value.trim() ? <ConfidenceSelector attributeLabel={spec.label} value={values.attributeConfidence[attribute]}
          onChange={level => setValues(v => ({ ...v, attributeConfidence: { ...v.attributeConfidence, [attribute]: level } }))} /> : null}
      </ScrollView>;
    })}
    {error ? <Text style={{ color: colors.error }} accessibilityRole="alert">{error}</Text> : null}
    <Button title={busy ? 'Guardando…' : 'Confirmar y guardar en el dispositivo'} disabled={busy} onPress={() => void save()} />
    <Button title="Volver a la conversación" disabled={busy} onPress={onCancel} />
  </ScrollView>;
}

const styles = {
  block: { gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.border },
  label: { ...typography.labelMedium, color: colors.onSurfaceVariant, letterSpacing: 1.2 },
  siteName: { ...typography.titleMedium, color: colors.onSurface },
  body: { ...typography.bodyMedium, color: colors.onSurfaceVariant, lineHeight: 21 },
  link: { ...typography.bodyMedium, color: colors.primary, paddingVertical: spacing.xs },
} as const;
