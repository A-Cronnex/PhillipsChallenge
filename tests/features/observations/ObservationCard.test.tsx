import { fireEvent, render, screen } from '@testing-library/react-native';

import { ObservationCard } from '../../../features/observations/ui/ObservationCard';
import type { ObservationRecord } from '../../../features/observations/domain/observation-record';

// Icon glyphs render nothing testable and the font loads asynchronously
// outside act() (see tests/features/conversations/CaptureLauncher.test.tsx
// for the same reasoning); actions are found by accessibility label instead.
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => <Text>{name}</Text> };
});

function record(overrides: Partial<ObservationRecord> = {}): ObservationRecord {
  return {
    id: 'a1b2c3d4-0000-0000-0000-000000000000',
    equipmentId: 'eq-1',
    siteId: 'site-1',
    visitDate: '2026-08-18',
    quantity: 2,
    brand: 'NovaMed',
    model: 'NM-MR 700',
    modality: 'MR',
    estimatedYearsOfUse: 7,
    estimatedInstallationYear: 2019,
    operationalStatus: null,
    captureSource: 'voice',
    notes: 'Two MR systems observed.',
    overallConfidence: 'high',
    createdBy: 'user-1',
    createdByName: 'Field User 01',
    createdAt: '2026-08-18T12:00:00.000Z',
    updatedAt: '2026-08-18T12:00:00.000Z',
    syncStatus: 'pending',
    ...overrides,
  };
}

function renderCard(overrides: Partial<ObservationRecord> = {}, props: Partial<Parameters<typeof ObservationCard>[0]> = {}) {
  const handlers = {
    onToggleExpanded: jest.fn(),
    onToggleSelected: jest.fn(),
    onOpenNote: jest.fn(),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
  };
  render(
    <ObservationCard
      observation={record(overrides)}
      expanded={false}
      selected={false}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

describe('ObservationCard', () => {
  it('shows the real Observation fields, not the equipment/site row it belongs to', () => {
    renderCard();

    expect(screen.getByText('18/08/2026')).toBeTruthy();
    expect(screen.getByText('NovaMed')).toBeTruthy();
    expect(screen.getByText('NM-MR 700')).toBeTruthy();
    expect(screen.getByText('MR')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('Alta')).toBeTruthy(); // overall_confidence: high
    expect(screen.getByText('Voz')).toBeTruthy(); // capture_source: voice
  });

  it('never renders the note text inline — only through the note action', () => {
    renderCard({ notes: 'A very specific phrase nobody else would type.' });
    expect(screen.queryByText('A very specific phrase nobody else would type.')).toBeNull();
  });

  it('does not offer a duplicate action', () => {
    renderCard();
    expect(screen.queryByLabelText(/duplicar/i)).toBeNull();
    expect(screen.queryByLabelText(/copiar/i)).toBeNull();
  });

  it('hides audit fields when collapsed', () => {
    renderCard({}, { expanded: false });
    expect(screen.queryByText('Field User 01')).toBeNull();
  });

  it('shows audit fields when expanded', () => {
    renderCard({}, { expanded: true });
    expect(screen.getByText('Field User 01')).toBeTruthy();
  });

  it('calls the matching handler for each header action', () => {
    const handlers = renderCard();

    fireEvent.press(screen.getByLabelText('Ver detalle completo'));
    expect(handlers.onToggleExpanded).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('Ver nota de la observación'));
    expect(handlers.onOpenNote).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('Editar observación'));
    expect(handlers.onEdit).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('Eliminar observación'));
    expect(handlers.onDelete).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('Seleccionar observación'));
    expect(handlers.onToggleSelected).toHaveBeenCalledTimes(1);
  });

  it('shows the synchronization state via the shared badge', () => {
    renderCard({ syncStatus: 'pending' });
    expect(screen.getByTestId('sync-badge-pending')).toBeTruthy();
  });

  it('renders a placeholder for every unset field rather than hiding the row', () => {
    renderCard({
      brand: null,
      model: null,
      modality: null,
      operationalStatus: null,
      overallConfidence: null,
      captureSource: null,
    });
    // Six unset fields above; NOT_RECORDED ('—') appears at least that many times.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(6);
  });
});
