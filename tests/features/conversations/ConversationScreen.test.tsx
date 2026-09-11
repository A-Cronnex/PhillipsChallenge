import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ConversationScreen } from '../../../features/conversations/ui/ConversationScreen';
import { getRepositories } from '../../../lib/container';
import { pickNameplate } from '../../../services/capture/photo';
import { startMicrophone } from '../../../services/capture/microphone';
import type { AiRuntime, SpeechSession } from '../../../features/conversations/application/ports';
import type { AgentExtraction } from '../../../features/conversations/domain/extraction';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@expo/vector-icons', () => ({ MaterialIcons: () => null }));
jest.mock('../../../lib/container', () => ({ getRepositories: jest.fn() }));
jest.mock('../../../lib/id', () => ({ newId: () => 'conversation-1' }));
jest.mock('../../../services/capture/photo', () => ({ pickNameplate: jest.fn(), retainPhoto: () => '/camera.jpg' }));
jest.mock('../../../features/conversations/ui/NameplateCamera', () => ({
  NameplateCamera: ({ onCaptured, onCancel }: { onCaptured: (photo: unknown) => void; onCancel: () => void }) => {
    const { Button, View } = require('react-native');
    return <View><Button title="Usar fotografía" onPress={() => onCaptured({ uri: '/temp.jpg', width: 100, height: 100 })} /><Button title="Cerrar cámara" onPress={onCancel} /></View>;
  },
}));
jest.mock('../../../services/capture/microphone', () => ({ startMicrophone: jest.fn() }));
jest.mock('../../../features/conversations/ui/ConversationReview', () => ({ ConversationReview: () => null }));
let save: jest.Mock;
// Complete messages can now take over five seconds to reveal character by character.
jest.setTimeout(10_000);
function runtime(): AiRuntime {
  return { isReady: async () => true, prepare: async () => {}, extractFromText: jest.fn(async () => ({ values: [] })),
    extractFromImage: jest.fn(async (): Promise<AgentExtraction> => ({ nameplate: 'detected', values: [{ field: 'brand', value: 'Philips', status: 'confirmed', confidence: 'high' }] })),
    transcribe: jest.fn(async () => 'dos monitores') };
}
beforeEach(() => {
  save = jest.fn(async () => {});
  jest.mocked(getRepositories).mockResolvedValue({ conversations: { latest: async () => null, save } } as never);
  jest.mocked(pickNameplate).mockResolvedValue('/plate.jpg');
  jest.mocked(startMicrophone).mockResolvedValue({ stop: async () => '/audio.wav', cancel: jest.fn() });
});
afterEach(() => jest.clearAllMocks());
test('text messages remain the main flow and expose responding from actual inference', async () => {
  const ai = runtime();
  let finish: (value: { values: [] }) => void = () => {};
  let responding = () => {};
  ai.extractFromText = jest.fn(request => { responding = request.onResponding!;
    return new Promise(resolve => { finish = resolve; }); });
  render(<ConversationScreen userId="u1" runtime={ai} />);
  await waitFor(() => expect(screen.getByLabelText('Mensaje para el agente').props.editable).toBe(true));
  fireEvent.changeText(screen.getByLabelText('Mensaje para el agente'), 'dos monitores');
  fireEvent.press(screen.getByLabelText('Enviar mensaje'));
  await waitFor(() => expect(ai.extractFromText).toHaveBeenCalled());
  expect(screen.getByTestId('ai-orb-thinking')).toBeTruthy();
  act(() => responding());
  expect(screen.getByTestId('ai-orb-responding')).toBeTruthy();
  await act(async () => finish({ values: [] }));
  // Nothing captured yet, so the agent's turn is entirely the deterministic
  // missing-fields reminder plus the next question — MedPsy no longer
  // proposes its own follow-up text (removed from the schema, 2026-09-10).
  await waitFor(() => expect(screen.getByText(
    'Todavía necesito: la cantidad de equipos, el nombre del sitio, el país, la ciudad, la marca, la modalidad. ¿Puedes tomar una foto de la placa del equipo donde se vea la marca?'
  )).toBeTruthy(), { timeout: 6000 });
  expect(screen.getByTestId('ai-orb-idle')).toBeTruthy();
});
test('shows muted partial voice below the orb, then automatically sends the final transcript', async () => {
  const ai = runtime();
  let partial: (text: string) => void = () => {};
  const speech: SpeechSession = { write: jest.fn(), result: new Promise(() => {}), finish: async () => 'dos monitores', cancel: jest.fn() };
  ai.openSpeechSession = async callback => { partial = callback; return speech; };
  render(<ConversationScreen userId="u1" runtime={ai} />);
  await waitFor(() => expect(screen.getByLabelText('Mensaje para el agente').props.editable).toBe(true));
  fireEvent.press(screen.getByLabelText('Hablar con el agente'));
  await waitFor(() => expect(screen.getByTestId('ai-orb-listening')).toBeTruthy());
  act(() => partial('dos moni'));
  expect(screen.getByTestId('partial-transcript')).toHaveTextContent('dos moni');
  expect(screen.getByTestId('partial-transcript')).toHaveStyle({ fontWeight: '400' });
  fireEvent.press(screen.getByLabelText('Terminar grabación y enviar'));
  await waitFor(() => expect(ai.extractFromText).toHaveBeenCalledWith(expect.objectContaining({ text: 'dos monitores' })));
  // The agent's reply now leads with a missing-fields reminder, so its reveal
  // animation covers more characters and needs more time than the default.
  await waitFor(() => expect(screen.getByTestId('ai-orb-idle')).toBeTruthy(), { timeout: 6000 });
  expect(screen.getByText('dos monitores')).toBeTruthy();
  expect(ai.transcribe).not.toHaveBeenCalled();
  expect(save.mock.calls.some(([state]) => state.turns.some((turn: { reference?: string }) => turn.reference === '/audio.wav'))).toBe(true);
});
test('photo extraction waits for explicit edited approval before entering chat or persistence', async () => {
  const ai = runtime();
  render(<ConversationScreen userId="u1" runtime={ai} />);
  await waitFor(() => expect(screen.getByLabelText('Mensaje para el agente').props.editable).toBe(true));
  fireEvent.press(screen.getByLabelText('Capturar placa con cámara'));
  fireEvent.press(screen.getByText('Elegir de mis fotos'));
  await waitFor(() => expect(screen.getByText('Confirma lo que leí')).toBeTruthy());
  expect(save).toHaveBeenCalledTimes(1);
  expect(save.mock.calls[0][0].pendingImagePath).toBe('/plate.jpg');
  expect(save.mock.calls[0][0].fields.brand.value).toBeNull();
  fireEvent.changeText(screen.getByLabelText('la marca'), 'GE');
  expect(save).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByText('Aceptar cambios y enviar'));
  await waitFor(() => expect(screen.getByText('Placa revisada: la marca: GE')).toBeTruthy());
  const state = save.mock.calls.at(-1)![0];
  expect(state.fields.brand).toMatchObject({ value: 'GE', source: 'text', confidence: 'high', status: 'reported' });
  await waitFor(() => expect(screen.getByTestId('ai-orb-idle')).toBeTruthy(), { timeout: 5000 });
});

test('can capture and review a plate without preparing the text model first', async () => {
  const ai = runtime(); ai.isReady = async () => false; ai.prepare = jest.fn(async () => {});
  render(<ConversationScreen userId="u1" runtime={ai} />);
  await waitFor(() => expect(screen.getByLabelText('Capturar placa con cámara').props.accessibilityState.disabled).toBe(false));
  fireEvent.press(screen.getByLabelText('Capturar placa con cámara'));
  fireEvent.press(screen.getByText('Tomar fotografía'));
  expect(screen.getByText('Usar fotografía')).toBeTruthy();
  expect(ai.extractFromImage).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Usar fotografía'));
  await waitFor(() => expect(screen.getByText('Confirma lo que leí')).toBeTruthy());
  expect(ai.prepare).not.toHaveBeenCalled();
  expect(ai.extractFromImage).toHaveBeenCalled();
});

test('preparation is labelled separately and never reports recording before microphone start', async () => {
  const ai = runtime();
  ai.openSpeechSession = () => new Promise(() => {});
  render(<ConversationScreen userId="u1" runtime={ai} />);
  await waitFor(() => expect(screen.getByLabelText('Mensaje para el agente').props.editable).toBe(true));
  fireEvent.press(screen.getByLabelText('Hablar con el agente'));
  expect(screen.getByText('Preparando voz')).toBeTruthy();
  expect(screen.getByLabelText('Cancelar preparación de voz')).toBeTruthy();
  expect(screen.queryByLabelText('Cancelar grabación')).toBeNull();
  expect(screen.queryByTestId('ai-orb-listening')).toBeNull();
  expect(startMicrophone).not.toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText('Cancelar preparación de voz'));
  expect(screen.getByTestId('ai-orb-idle')).toBeTruthy();
});
