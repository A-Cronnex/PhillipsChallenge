import { AppButton as Button } from '../../../components/ui/AppButton';
import { useConversationReview } from './useConversationReview';
import { colors } from '../../../lib/theme';
import { ScrollView, Text } from 'react-native';
import { TextField } from '../../../components/forms/TextField';
import { ConfidenceSelector } from '../../../components/forms/ConfidenceSelector';
import { OptionPicker } from '../../../components/forms/OptionPicker';
import { SiteCreator } from '../../catalog/ui/SiteCreator';
import { EquipmentPicker } from '../../catalog/ui/EquipmentPicker';
import { CAPTURE_FIELD_SPECS } from '../domain/fields';
import { FIELD_CONFIDENCE_ATTRIBUTE } from '../domain/confidence';
import { type ConversationState } from '../domain/conversation';

export function ConversationReview({ conversation, onSaved, onCancel }: {
  conversation: ConversationState; onSaved: () => void; onCancel: () => void;
}) {
  const { sites, values, setValues, error, busy, loadSites, save } = useConversationReview(conversation, onSaved);
  return <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
    <Text style={{ fontSize: 24, color: colors.onSurface }}>Revisar observación</Text>
    <Text style={{ color: colors.onSurfaceVariant }}>Confirma el sitio y corrige los valores propuestos. Los campos desconocidos pueden quedar vacíos.</Text>
    <Text style={{ color: colors.onSurfaceVariant }}>Sitio mencionado: {String(conversation.fields.siteName.value ?? 'Sin indicar')}</Text>
    <OptionPicker label="Sitio" selected={values.siteId} options={sites.map(site => ({ value: site.id, label: site.name,
      detail: [site.city, site.country].filter(Boolean).join(', ') }))} onSelect={siteId => setValues(v => ({ ...v, siteId, equipmentId: null }))} emptyMessage="Registra un sitio" />
    <SiteCreator onCreated={async id => { await loadSites(); setValues(v => ({ ...v, siteId: id, equipmentId: null })); }} />
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
