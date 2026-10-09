import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseCalendarPriority} from '../calendar-priority.js';
test('high priority wins same-time tie',()=>{
 const at='2026-10-08T09:00:00Z';
 const rows=[{id:'normal',starts_at:at},{id:'high',starts_at:at,priority:'HIGH'}];
 assert.equal(chooseCalendarPriority(rows).eventId,'high');
});
