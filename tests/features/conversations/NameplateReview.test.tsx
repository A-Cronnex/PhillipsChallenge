import { fireEvent, render, screen } from '@testing-library/react-native';
import { NameplateReview } from '../../../features/conversations/ui/NameplateReview';
import type { NameplateProposal } from '../../../features/conversations/application/nameplate-review';
const proposal: NameplateProposal = { imagePath: '/plate.jpg', rejected: [], values: [{ field: 'model', value: 'MX450', status: 'confirmed', confidence: 'medium' }] };
test('never submits on rendering or editing; submits only after explicit approval', () => {
  const accept = jest.fn();
  render(<NameplateReview proposal={proposal} busy={false} onAccept={accept} onCancel={jest.fn()} />);
  expect(accept).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('el modelo'), 'MX500');
  expect(accept).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Aceptar cambios y enviar'));
  expect(accept).toHaveBeenCalledWith([{ field: 'model', value: 'MX500', status: 'reported', confidence: 'medium' }]);
});
test('cancel does not apply the proposal', () => {
  const accept = jest.fn(); const cancel = jest.fn();
  render(<NameplateReview proposal={proposal} busy={false} onAccept={accept} onCancel={cancel} />);
  fireEvent.press(screen.getByText('Cancelar y volver al chat'));
  expect(cancel).toHaveBeenCalledTimes(1); expect(accept).not.toHaveBeenCalled();
});
test('keeps edited values across submitting and recoverable failure', () => {
  const props = { proposal, busy: false, onAccept: jest.fn(), onCancel: jest.fn() };
  const view = render(<NameplateReview {...props} />);
  fireEvent.changeText(screen.getByLabelText('el modelo'), 'MX500');
  view.rerender(<NameplateReview {...props} busy />);
  expect(screen.getByText('Incorporando al chat…')).toBeTruthy();
  view.rerender(<NameplateReview {...props} error="No se pudo guardar" />);
  expect(screen.getByLabelText('el modelo').props.value).toBe('MX500');
  expect(screen.getByText('No se pudo guardar')).toBeTruthy();
});
