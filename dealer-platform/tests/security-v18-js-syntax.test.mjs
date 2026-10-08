import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('session security guard has valid JavaScript syntax',()=>{
  const file=fileURLToPath(new URL('../session-security.js',import.meta.url));
  execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
});
