import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feeAmount, spd, fmtDate } from '../../src/lib/core/propozice.js';

test('fee amount only for a plain sum', () => {
  assert.equal(feeAmount('200 Kč'), 200);
  assert.equal(feeAmount('1 000 Kč'), 1000);
  assert.equal(feeAmount('1 000 Kč/rok, studenti 300 Kč'), null);
  assert.equal(feeAmount(null), null);
});

test('QR Platba string', () => {
  assert.equal(spd({ iban: 'CZ52 5500 0000 0002 5025 0256', amount: 200, message: 'Jarní 2027' }), 'SPD*1.0*ACC:CZ5255000000000250250256*AM:200.00*CC:CZK*MSG:JARNI 2027');
  assert.equal(spd({ iban: 'CZ52 5500 0000 0002 5025 0256', amount: null, message: '' }), 'SPD*1.0*ACC:CZ5255000000000250250256*CC:CZK');
});

test('dates', () => {
  assert.equal(fmtDate('2027-04-10', 'cs', true), 'sobota 10. 4. 2027');
  assert.equal(fmtDate('2027-04-10', 'en'), '10 April 2027');
});
