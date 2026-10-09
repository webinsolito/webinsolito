import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseCalendarPriority} from '../calendar-priority.js';

test('same-time appointments choose high priority without mutating input',()=>{
  const starts_at='2026-10-08T10:00:00Z';
  const rows=[{id:'regular',starts_at,priority:'NORMAL'},{id:'urgent',starts_at,priority:'HIGH'}];
  const result=chooseCalendarPriority(rows,new Date('2026-10-08T08:00:00Z'));
  assert.equal(result.eventId,'urgent');
  assert.equal(rows[0].id,'regular');
});
