import { expect, it } from 'vitest';
import { authorizedCron } from '@/lib/recurring/cron-auth';
it('only accepts the configured bearer secret', () => {
  expect(authorizedCron('Bearer value','value')).toBe(true);
  expect(authorizedCron('Bearer value','')).toBe(false);
  expect(authorizedCron('Bearer different','value')).toBe(false);
  expect(authorizedCron(null,'value')).toBe(false);
});
