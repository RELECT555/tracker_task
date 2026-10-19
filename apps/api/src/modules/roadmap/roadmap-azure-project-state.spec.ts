import { worstReadinessStatus, type ReadinessCheck } from './roadmap-azure-sync.service';

const check = (status: ReadinessCheck['status']): ReadinessCheck => ({
  key: status,
  label: status,
  status,
  detail: '',
});

describe('Azure project readiness state', () => {
  it('returns the worst persisted readiness status', () => {
    expect(worstReadinessStatus(null)).toBeNull();
    expect(worstReadinessStatus([check('ok')])).toBe('ok');
    expect(worstReadinessStatus([check('ok'), check('warning')])).toBe('warning');
    expect(worstReadinessStatus([check('warning'), check('error')])).toBe('error');
  });
});
