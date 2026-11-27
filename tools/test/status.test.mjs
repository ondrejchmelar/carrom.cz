import test from 'node:test';
import assert from 'node:assert/strict';
import { autoStatus } from '../../src/lib/core/model.js';

const T = { competition: { kind: 'tournament' } };
const L = { competition: { kind: 'league' } };
const today = '2027-03-10';

test('tournament: sign-up link opens registration until the deadline', () => {
  assert.equal(autoStatus({ ...T, status: 'planned', signup_url: 'https://forms.gle/x' }, null, today), 'registration_open');
  assert.equal(autoStatus({ ...T, status: 'planned', signup_url: 'https://forms.gle/x', signup_deadline: '2027-03-01' }, null, today), 'planned');
  assert.equal(autoStatus({ ...T, status: 'planned' }, null, today), 'planned');
});

test('tournament: results after the end date finish it, not before', () => {
  const res = { singles: [{ place: 1, player: 'a' }] };
  assert.equal(autoStatus({ ...T, status: 'registration_open', start_date: '2027-03-01', end_date: '2027-03-01', results: res }, null, today), 'finished');
  assert.equal(autoStatus({ ...T, status: 'registration_open', start_date: '2027-03-10', results: res }, null, today), 'registration_open');
  assert.equal(autoStatus({ ...T, status: 'planned', start_date: '2027-03-01' }, null, today), 'planned');
});

test('league: running after start, finished with a complete playoff', () => {
  assert.equal(autoStatus({ ...L, status: 'planned', start_date: '2027-01-20' }, { complete: false }, today), 'running');
  assert.equal(autoStatus({ ...L, status: 'running', start_date: '2027-01-20' }, { complete: true }, today), 'finished');
  assert.equal(autoStatus({ ...L, status: 'planned', start_date: '2027-04-01', links: { signup_url: 'https://forms.gle/x' } }, null, today), 'registration_open');
});

test('never moves a hand-set status back', () => {
  assert.equal(autoStatus({ ...T, status: 'finished' }, null, today), 'finished');
  assert.equal(autoStatus({ ...L, status: 'running', start_date: '2027-04-01' }, null, today), 'running');
});
