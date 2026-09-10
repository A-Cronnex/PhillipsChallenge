import { colors } from '../../../lib/theme';
import { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { OptionPicker } from '../../../components/forms/OptionPicker';
import { getRepositories } from '../../../lib/container';
import type { EquipmentSummary } from '../application/ports';

export function EquipmentPicker({ siteId, selected, onSelect }: {
  siteId: string | null; selected: string | null; onSelect: (id: string | null) => void;
}) {
  const [items, setItems] = useState<EquipmentSummary[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setItems([]); setError('');
    if (siteId) void getRepositories().then(r => r.catalog.listEquipment(siteId)).then(rows => {
      if (active) setItems(rows);
    }).catch(() => { if (active) setError('No se pudieron leer los equipos existentes.'); });
    return () => { active = false; };
  }, [siteId]);
  if (!siteId) return null;
  return <View>
    <OptionPicker label="Registro de equipo" selected={selected ?? 'new'}
      options={[{ value: 'new', label: 'Registrar equipo o grupo nuevo' }, ...items.map(item => ({ value: item.id,
        label: [item.brand, item.model, item.modality].filter(Boolean).join(' · ') || item.id,
        detail: item.id }))]}
      onSelect={id => onSelect(id === 'new' ? null : id)} emptyMessage="Sin equipos" />
    <Text style={{ color: colors.onSurfaceVariant }}>Si ya existe, selecciónalo para añadir otra observación a su historial. Revisa la lista para evitar duplicados.</Text>
    {error ? <Text style={{ color: colors.error }} accessibilityRole="alert">{error}</Text> : null}
  </View>;
}
