import assert from 'assert';
import { tryCompile } from '../lib/superforth/compiler.js';

function ok(code, sig){
  const res = tryCompile(code, sig);
  assert.ok(res.ok, `Expected OK, got error: ${res.error}`);
}

function err(code, sig){
  const res = tryCompile(code, sig);
  assert.ok(!res.ok, `Expected error, got OK`);
}

// Basic arithmetic
ok('1 2 +', { in: [], out: ['int'] });
ok('3 4 *', { in: [], out: ['int'] });
ok('7 2 -', { in: [], out: ['int'] });
ok('8 2 /', { in: [], out: ['int'] });

// Stack ops
ok('1 2 swap +', { in: [], out: ['int'] });
ok('5 dup +', { in: [], out: ['int'] });

// Conditional without else (branches must match)
ok('1 2 + dup 100 > if drop 100 then', { in: [], out: ['int'] });
err('1 2 + 100 > if 100 then', { in: [], out: ['int'] }); // false branch leaves empty stack

// Conditional with else
ok('1 2 + dup 100 > if drop 100 else then', { in: [], out: ['int'] });

// Example from AI loop (binary function)
ok('dup * swap dup * + dup 100 > if drop 100 then', { in: ['int','int'], out: ['int'] });

// New comparisons
ok('3 5 <', { in: [], out: ['bool'] });
ok('5 5 <=', { in: [], out: ['bool'] });
ok('5 3 >=', { in: [], out: ['bool'] });
ok('4 4 !=', { in: [], out: ['bool'] });

// min/max
ok('3 5 min', { in: [], out: ['int'] });
ok('3 5 max', { in: [], out: ['int'] });
err('5 min', { in: [], out: ['int'] }); // insufficient depth

// clamp: expects x lo hi (top=hi)
ok('1 0 10 clamp', { in: [], out: ['int'] });
ok('clamp', { in: ['int','int','int'], out: ['int'] });

// Conditionals with new comparisons
ok('10 20 < if 1 else 0 then', { in: [], out: ['int'] });

console.log('Super-Forth compiler tests: OK');
