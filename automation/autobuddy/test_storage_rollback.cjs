const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('autobuddy/index.html', 'utf8');
const start = html.indexOf('let lastSaveFailed=false;');
const end = html.indexOf('function uid()', start);
assert.ok(start >= 0 && end > start, 'AutoBuddy persistence guard must exist');
const code = html.slice(start, end);

test('quota error restores persisted Garage and shows failure instead of success', () => {
  const previous = { version: 2, vehicles: [{ id: 1, plate: 'AA111AA' }] };
  const edited = { version: 2, vehicles: [{ id: 2, plate: 'BB222BB' }] };
  const messages = [];
  let rendered = null;
  const context = {
    S: edited,
    localStorage: { setItem() { throw Error('quota'); } },
    load() { return previous; },
    render() { rendered = context.S; },
    alert(message) { messages.push(message); }
  };
  vm.createContext(context);
  vm.runInContext(code + 'save();', context);
  assert.equal(rendered, previous);
  assert.equal(context.S, previous);
  assert.match(messages[0], /Impossibile salvare/);
  assert.equal(vm.runInContext('lastSaveFailed', context), true);
});

test('successful storage write renders new Garage', () => {
  const edited = { version: 2, vehicles: [{ id: 2, plate: 'BB222BB' }] };
  let saved = '', rendered = null;
  const context = {
    S: edited,
    localStorage: { setItem(key, value) { assert.equal(key, 'autobuddy.v2'); saved = value; } },
    load() { throw Error('must not reload'); },
    render() { rendered = context.S; },
    alert() { throw Error('unexpected alert'); }
  };
  vm.createContext(context);
  vm.runInContext("const KEY='autobuddy.v2';" + code + 'save();', context);
  assert.equal(JSON.parse(saved).vehicles[0].plate, 'BB222BB');
  assert.equal(rendered, edited);
  assert.equal(vm.runInContext('lastSaveFailed', context), false);
});
