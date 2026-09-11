import {
  getDashboardScopeSite,
  setDashboardScopeSite,
  subscribeDashboardScope,
} from '../../lib/dashboard-scope';

afterEach(() => {
  setDashboardScopeSite(null);
});

describe('dashboard-scope', () => {
  it('starts with no scoped site', () => {
    expect(getDashboardScopeSite()).toBeNull();
  });

  it('stores and returns the scoped site set by the map', () => {
    setDashboardScopeSite({ siteId: 's1', name: 'Hospital Alfa', city: null, country: null });
    expect(getDashboardScopeSite()).toEqual({
      siteId: 's1',
      name: 'Hospital Alfa',
      city: null,
      country: null,
    });
  });

  it('notifies subscribers when the scope changes', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeDashboardScope(listener);

    setDashboardScopeSite({ siteId: 's1', name: 'Hospital Alfa', city: null, country: null });
    expect(listener).toHaveBeenCalledTimes(1);

    setDashboardScopeSite(null);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setDashboardScopeSite({ siteId: 's2', name: 'Hospital Beta', city: null, country: null });
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
