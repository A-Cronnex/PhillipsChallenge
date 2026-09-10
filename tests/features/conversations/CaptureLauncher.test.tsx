import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { CaptureLauncher } from '../../../features/conversations/ui/CaptureLauncher';
import type { AiRuntime } from '../../../features/conversations/application/ports';

// The icon font loads asynchronously and calls setState outside act(), which
// floods the output with warnings. The buttons are found by accessibility
// label, not by glyph, so a stand-in costs the suite nothing.
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return { MaterialIcons: ({ name }: { name: string }) => <Text>{name}</Text> };
});

/**
 * The launcher is tested without the agent and without the manual form: both
 * pull in QVAC or the database, and what matters here is which one the screen
 * mounts, with which intent.
 */
jest.mock('../../../features/conversations/ui/ConversationScreen', () => {
  const { Text } = require('react-native');
  return {
    ConversationScreen: ({ photoFirst }: { photoFirst?: boolean }) => (
      <Text testID="agent-screen">{photoFirst ? 'agent:photo' : 'agent:voice'}</Text>
    ),
  };
});

jest.mock('../../../features/observations/ui/ObservationCaptureForm', () => {
  const { Text } = require('react-native');
  return { ObservationCaptureForm: () => <Text testID="manual-form">manual</Text> };
});

const runtime = {} as AiRuntime;

it('offers the microphone and the camera before anything is loaded', () => {
  const resolveRuntime = jest.fn().mockResolvedValue(runtime);
  render(<CaptureLauncher userId="user-1" resolveRuntime={resolveRuntime} />);

  expect(screen.getByTestId('capture-launcher')).toBeTruthy();
  expect(screen.getByLabelText('Hablar con el agente')).toBeTruthy();
  expect(screen.getByLabelText('Fotografiar la placa del equipo')).toBeTruthy();
  // The runtime is the expensive part: it must not be built to paint buttons.
  expect(resolveRuntime).not.toHaveBeenCalled();
});

it('opens the agent for voice when the microphone is pressed', async () => {
  const resolveRuntime = jest.fn().mockResolvedValue(runtime);
  render(<CaptureLauncher userId="user-1" resolveRuntime={resolveRuntime} />);

  fireEvent.press(screen.getByLabelText('Hablar con el agente'));

  await waitFor(() => expect(screen.getByTestId('agent-screen')).toBeTruthy());
  expect(screen.getByTestId('agent-screen')).toHaveTextContent('agent:voice');
  expect(resolveRuntime).toHaveBeenCalledTimes(1);
});

it('opens the agent straight into the camera when the photo button is pressed', async () => {
  const resolveRuntime = jest.fn().mockResolvedValue(runtime);
  render(<CaptureLauncher userId="user-1" resolveRuntime={resolveRuntime} />);

  fireEvent.press(screen.getByLabelText('Fotografiar la placa del equipo'));

  await waitFor(() => expect(screen.getByTestId('agent-screen')).toBeTruthy());
  expect(screen.getByTestId('agent-screen')).toHaveTextContent('agent:photo');
});

it('returns to the launcher from the agent', async () => {
  const resolveRuntime = jest.fn().mockResolvedValue(runtime);
  render(<CaptureLauncher userId="user-1" resolveRuntime={resolveRuntime} />);

  fireEvent.press(screen.getByLabelText('Hablar con el agente'));
  await waitFor(() => expect(screen.getByTestId('agent-screen')).toBeTruthy());

  fireEvent.press(screen.getByTestId('back-to-launcher'));

  expect(screen.getByTestId('capture-launcher')).toBeTruthy();
  expect(screen.queryByTestId('agent-screen')).toBeNull();
});

it('keeps the manual form reachable when the runtime cannot be built', async () => {
  const resolveRuntime = jest.fn().mockRejectedValue(new Error('no QVAC'));
  render(<CaptureLauncher userId="user-1" resolveRuntime={resolveRuntime} />);

  fireEvent.press(screen.getByLabelText('Hablar con el agente'));

  await waitFor(() => expect(screen.getByTestId('error-state')).toBeTruthy());
  fireEvent.press(screen.getByTestId('manual-fallback'));

  expect(screen.getByTestId('manual-form')).toBeTruthy();
});

it('ignores a second press while the runtime is still resolving', async () => {
  let release: (value: AiRuntime) => void = () => {};
  const resolveRuntime = jest
    .fn()
    .mockReturnValue(new Promise<AiRuntime>((resolve) => (release = resolve)));
  render(<CaptureLauncher userId="user-1" resolveRuntime={resolveRuntime} />);

  fireEvent.press(screen.getByLabelText('Hablar con el agente'));
  await waitFor(() => expect(screen.getByTestId('opening-agent')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Fotografiar la placa del equipo'));

  expect(resolveRuntime).toHaveBeenCalledTimes(1);

  release(runtime);
  await waitFor(() => expect(screen.getByTestId('agent-screen')).toHaveTextContent('agent:voice'));
});
