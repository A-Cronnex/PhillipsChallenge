import { validateSite } from '../../../features/catalog/application/ports';
const site = { name: 'Hospital de prueba', city: 'Panamá', country: 'Panamá', address: '', latitude: null, longitude: null };
test('allows a site without coordinates for offline capture', () => expect(() => validateSite(site)).not.toThrow());
test('rejects missing name and partial or invalid coordinates', () => {
  expect(() => validateSite({ ...site, name: ' ' })).toThrow();
  expect(() => validateSite({ ...site, latitude: 8 })).toThrow();
  expect(() => validateSite({ ...site, latitude: NaN, longitude: 0 })).toThrow();
  expect(() => validateSite({ ...site, latitude: 91, longitude: 0 })).toThrow();
});
