/**
 * Quick test for extended compiler capabilities
 */
import { tryCompile } from '../lib/superforth/compiler.js';

const cases = [
  { code: 'dup * swap dup * + dup 100 > if drop 100 else then', sig: { in: ['int','int'], out: ['int'] }, ok: true },
  { code: 'dup * swap dup * + 100 > if 100 then', sig: { in: ['int','int'], out: ['int'] }, ok: false },
  { code: 'over over * swap * +', sig: { in: ['int','int'], out: ['int'] }, ok: true },
  { code: 'dup dup * swap dup * + -', sig: { in: ['int','int'], out: ['int'] }, ok: true },
  { code: '1 2 = if 3 else 4 then', sig: { in: [], out: ['int'] }, ok: true }
];

for (const c of cases) {
  const res = tryCompile(c.code, c.sig);
  console.log(`Code: ${c.code}`);
  console.log(res.ok ? 'OK' : `ERR: ${res.error}`);
  console.log('---');
}
