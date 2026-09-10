import { useState } from 'react';
import { View, Text, Button } from 'react-native';
import { TextField } from '../../../components/forms/TextField';
import { getRepositories } from '../../../lib/container';

export function SiteCreator({ onCreated }: { onCreated: (id: string) => void | Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ name: '', city: '', country: '', address: '', latitude: '', longitude: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!open) return <Button title="Registrar sitio" onPress={() => setOpen(true)} />;
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const id = await (await getRepositories()).catalog.createSite({ ...values,
        latitude: values.latitude.trim() ? Number(values.latitude) : null,
        longitude: values.longitude.trim() ? Number(values.longitude) : null });
      await onCreated(id); setOpen(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No se pudo guardar el sitio.'); }
    finally { setBusy(false); }
  }
  const labels = { name: 'Nombre del sitio', city: 'Ciudad', country: 'País', address: 'Dirección', latitude: 'Latitud (opcional)', longitude: 'Longitud (opcional)' };
  return <View style={{ gap: 8 }}>
    {Object.entries(labels).map(([key, label]) => <TextField key={key} label={label}
      value={values[key as keyof typeof values]} onChangeText={value => setValues(current => ({ ...current, [key]: value }))} />)}
    <Text>Sin coordenadas, el sitio se guarda pero no aparece como punto en el mapa.</Text>
    {error ? <Text accessibilityRole="alert">{error}</Text> : null}
    <Button title={busy ? 'Guardando…' : 'Guardar sitio'} disabled={busy} onPress={() => void save()} />
    <Button title="Cancelar" disabled={busy} onPress={() => setOpen(false)} />
  </View>;
}
