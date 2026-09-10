import { useEffect, useState } from 'react';
import { ScrollView, Text, Button } from 'react-native';
import { TextField } from '../../../components/forms/TextField';
import { ConfidenceSelector } from '../../../components/forms/ConfidenceSelector';
import { OptionPicker } from '../../../components/forms/OptionPicker';
import { SiteCreator } from '../../catalog/ui/SiteCreator';
import { EquipmentPicker } from '../../catalog/ui/EquipmentPicker';
import type { SiteSummary } from '../../sites/application/ports';
import { getRepositories } from '../../../lib/container';
import { newId } from '../../../lib/id';
import { emptyFormValues, toDraft } from '../../observations/ui/form-mapping';
import { CAPTURE_FIELD_SPECS } from '../domain/fields';
import { FIELD_CONFIDENCE_ATTRIBUTE, attributeConfidenceRecords } from '../domain/confidence';
import { isKnown, type ConversationState } from '../domain/conversation';
import { saveConversation } from '../application/save-conversation';

export function ConversationReview({ conversation, onSaved, onCancel }: {
  conversation: ConversationState; onSaved: () => void; onCancel: () => void;
}) {
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [values, setValues] = useState(() => {
    const initial = emptyFormValues({ visitDate: new Date().toISOString().slice(0, 10) });
    for (const field of Object.keys(initial)) {
      const state = conversation.fields[field as keyof typeof conversation.fields];
      if (state && isKnown(state)) Object.assign(initial, { [field]: String(state.value) });
    }
    for (const row of attributeConfidenceRecords(conversation)) initial.attributeConfidence[row.attributeName] = row.confidenceLevel;
    return initial;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function loadSites() { setSites(await (await getRepositories()).sites.listSites()); }
  useEffect(() => { void loadSites().catch(() => setError('No se pudieron cargar los sitios.')); }, []);
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await saveConversation(conversation, toDraft(values), { repository: (await getRepositories()).conversations, now: () => new Date(), newId });
      onSaved();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  return <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} keyboardShouldPersistTaps="handled">
    <Text style={{ fontSize: 24 }}>Revisar observación</Text>
    <Text>Confirma el sitio y corrige los valores propuestos. Los campos desconocidos pueden quedar vacíos.</Text>
    <Text>Sitio mencionado: {String(conversation.fields.siteName.value ?? 'Sin indicar')}</Text>
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
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    <Button title={busy ? 'Guardando…' : 'Confirmar y guardar en el dispositivo'} disabled={busy} onPress={() => void save()} />
    <Button title="Volver a la conversación" disabled={busy} onPress={onCancel} />
  </ScrollView>;
}
