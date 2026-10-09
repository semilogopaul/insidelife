import { describe, expect, it } from 'vitest';
import { csvCell, csvFilename, toCsv } from './csv.js';

describe('csv', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('Tolu, Bakare')).toBe('"Tolu, Bakare"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
  });

  it('neutralises formulas in text but keeps negative numbers', () => {
    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell(-5000)).toBe('-5000');
  });

  it('writes dates as ISO and objects as JSON', () => {
    expect(csvCell(new Date('2026-10-09T10:00:00.000Z'))).toBe('2026-10-09T10:00:00.000Z');
    expect(csvCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it('builds a document with a BOM, header row and CRLF', () => {
    const csv = toCsv(
      [
        { header: 'Handle', value: (row: { handle: string; amount: number }) => row.handle },
        { header: 'Amount', value: (row) => row.amount },
      ],
      [{ handle: 'tolu_b', amount: 2500 }],
    );
    expect(csv).toBe('﻿Handle,Amount\r\ntolu_b,2500\r\n');
  });

  it('names files safely', () => {
    expect(csvFilename('audit log', new Date('2026-10-09T10:30:59.000Z'))).toBe('audit-log-2026-10-09T1030.csv');
  });
});
