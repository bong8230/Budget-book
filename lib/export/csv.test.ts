import { expect, it } from 'vitest';
import { csvCell } from '@/lib/export/csv';
it('quotes CSV fields and neutralizes spreadsheet formulas', () => {
  expect(csvCell('"a",b')).toBe('"""a"",b"');
  expect(csvCell(' =SUM(A1:A2)')).toBe('"\' =SUM(A1:A2)"');
  expect(csvCell(123)).toBe('"123"');
});
