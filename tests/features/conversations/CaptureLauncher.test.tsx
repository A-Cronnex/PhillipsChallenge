import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { CaptureLauncher } from '../../../features/conversations/ui/CaptureLauncher';
import type { AiRuntime } from '../../../features/conversations/application/ports';

jest.mock('../../../features/conversations/ui/ConversationScreen', () => {
  const { Text, Button } = require('react-native');
  return { ConversationScreen: ({ runtime, onManualCapture }: { runtime: AiRuntime; onManualCapture: () => void }) => <>
    <Text testID="agent-screen">Conversación</Text><Button title="Preparar agente" onPress={() => runtime.prepare()} /><Button title="Captura manual" onPress={onManualCapture} />
  </> };
});
jest.mock('../../../features/observations/ui/ObservationCaptureForm', () => {
  const { Text } = require('react-native');
  return { ObservationCaptureForm: () => <Text testID="manual-form">manual</Text> };
});
test('opens directly into conversation without importing QVAC before preparation', async () => {
  const runtime = { prepare: jest.fn(async () => {}) } as unknown as AiRuntime;
  const resolveRuntime = jest.fn(async () => runtime);
  render(<CaptureLauncher userId="u1" resolveRuntime={resolveRuntime} />);
  expect(screen.getByTestId('agent-screen')).toBeTruthy();
  expect(resolveRuntime).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Preparar agente'));
  await waitFor(() => expect(runtime.prepare).toHaveBeenCalledTimes(1));
});
test('keeps manual capture and return to conversation available', () => {
  render(<CaptureLauncher userId="u1" resolveRuntime={jest.fn()} />);
  fireEvent.press(screen.getByText('Captura manual'));
  expect(screen.getByTestId('manual-form')).toBeTruthy();
  fireEvent.press(screen.getByText('Volver al agente'));
  expect(screen.getByTestId('agent-screen')).toBeTruthy();
});
