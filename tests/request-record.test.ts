import assert from 'node:assert/strict';
import test from 'node:test';
import { historyAction } from '../src/server/request-record';

test('command actions map to canonical immutable approval history actions', () => {
  assert.equal(historyAction('submit'), 'submitted');
  assert.equal(historyAction('approve'), 'approved');
  assert.equal(historyAction('return'), 'returned');
  assert.equal(historyAction('reject'), 'rejected');
  assert.equal(historyAction('cancel'), 'cancelled');
  assert.equal(historyAction('finance_verify'), 'finance_verified');
  assert.equal(historyAction('finance_return'), 'finance_returned');
});
