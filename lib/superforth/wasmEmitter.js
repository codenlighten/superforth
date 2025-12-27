// WASM emitter scaffold for Super-Forth
// Converts verified Super-Forth code into WebAssembly Text (WAT) skeleton.
// Note: This is a scaffold. Future work will map each word to stack machine ops.

import { tryCompile } from './compiler.js';

function tokenize(source) {
  return source.split(/\s+/).map(s => s.trim()).filter(Boolean);
}

function parseConditional(tokens, startIndex) {
  let depth = 1;
  let j = startIndex + 1;
  const trueBranch = [];
  const falseBranch = [];
  let inTrue = true;
  for (; j < tokens.length; j++) {
    const tk = tokens[j];
    if (tk === 'if') depth++;
    if (tk === 'then') {
      depth--;
      if (depth === 0) break;
    }
    if (tk === 'else' && depth === 1) {
      inTrue = false;
      continue;
    }
    (inTrue ? trueBranch : falseBranch).push(tk);
  }
  if (depth !== 0) throw new Error("Missing 'then' for 'if'");
  return { endIndex: j, trueBranch, falseBranch };
}

export function emitWAT(source, signature = { in: ['int','int'], out: ['int'] }) {
  const res = tryCompile(source, signature);
  if (!res.ok) {
    throw new Error(`Source not verified: ${res.error}`);
  }
  const tokens = tokenize(source);

  const inParams = signature.in.map((_t, i) => `(param $p${i} i32)`).join(' ');
  const outParams = signature.out.map((_t) => `(result i32)`).join(' ');

  const header = [
    ';; Super-Forth WAT generated module',
    '(module',
    '  (memory (export "mem") 1)',
    '  (global $sp (mut i32) (i32.const 0))',
    '  (func $push (param $v i32)',
    '    global.get $sp',
    '    i32.const 4',
    '    i32.mul',
    '    local.get $v',
    '    i32.store',
    '    global.get $sp',
    '    i32.const 1',
    '    i32.add',
    '    global.set $sp',
    '  )',
    '  (func $pop (result i32)',
    '    (local $idx i32)',
    '    global.get $sp',
    '    i32.const 1',
    '    i32.sub',
    '    local.set $idx',
    '    local.get $idx',
    '    i32.const 4',
    '    i32.mul',
    '    i32.load',
    '    local.get $idx',
    '    global.set $sp',
    '  )',
    '  (func $peek (result i32)',
    '    global.get $sp',
    '    i32.const 1',
    '    i32.sub',
    '    i32.const 4',
    '    i32.mul',
    '    i32.load',
    '  )',
    '  (func $peek2 (result i32)',
    '    global.get $sp',
    '    i32.const 2',
    '    i32.sub',
    '    i32.const 4',
    '    i32.mul',
    '    i32.load',
    '  )',
    `  (func $main ${inParams} ${outParams}`,
    '    (local $t0 i32)',
    '    (local $t1 i32)',
    '    (local $t2 i32)',
    '    ;; init stack with params in order',
    '    local.get $p0',
    '    call $push',
    '    local.get $p1',
    '    call $push'
  ];

  const body = [];

  function emit(line) { body.push('    ' + line); }

  function emitProgram(tokArr) {
    for (let i = 0; i < tokArr.length; i++) {
      const t = tokArr[i];
      if (/^-?\d+$/.test(t)) {
        emit(`i32.const ${t}`);
        emit('call $push');
      } else if (t === 'dup') {
        emit('call $peek');
        emit('call $push');
      } else if (t === 'drop') {
        emit('call $pop');
        emit('drop');
      } else if (t === 'swap') {
        emit('call $pop');
        emit('local.set $t0');
        emit('call $pop');
        emit('local.set $t1');
        emit('local.get $t0');
        emit('call $push');
        emit('local.get $t1');
        emit('call $push');
      } else if (t === 'over') {
        emit('call $peek2');
        emit('call $push');
      } else if (t === '+') {
        emit('call $pop');
        emit('local.set $t0');
        emit('call $pop');
        emit('local.set $t1');
        emit('local.get $t1');
        emit('local.get $t0');
        emit('i32.add');
        emit('call $push');
      } else if (t === '-') {
        emit('call $pop');
        emit('local.set $t0');
        emit('call $pop');
        emit('local.set $t1');
        emit('local.get $t1');
        emit('local.get $t0');
        emit('i32.sub');
        emit('call $push');
      } else if (t === '*') {
        emit('call $pop');
        emit('local.set $t0');
        emit('call $pop');
        emit('local.set $t1');
        emit('local.get $t1');
        emit('local.get $t0');
        emit('i32.mul');
        emit('call $push');
      } else if (t === '/') {
        emit('call $pop');
        emit('local.set $t0');
        emit('call $pop');
        emit('local.set $t1');
        emit('local.get $t1');
        emit('local.get $t0');
        emit('i32.div_s');
        emit('call $push');
      } else if (t === '>') {
        emit('call $pop');
        emit('local.set $t0');
        emit('call $pop');
        emit('local.set $t1');
        emit('local.get $t1');
        emit('local.get $t0');
        emit('i32.gt_s');
        emit('call $push');
      } else if (t === '<') {
        emit('call $pop');
        emit('local.set $t0');
        emit('call $pop');
        emit('local.set $t1');
        emit('local.get $t1');
        emit('local.get $t0');
        emit('i32.lt_s');
        emit('call $push');
      } else if (t === '<=') {
        emit('call $pop');
        emit('local.set $t0');
        emit('call $pop');
        emit('local.set $t1');
        emit('local.get $t1');
        emit('local.get $t0');
        emit('i32.le_s');
        emit('call $push');
      } else if (t === '>=') {
        emit('call $pop');
        emit('local.set $t0');
        emit('call $pop');
        emit('local.set $t1');
        emit('local.get $t1');
        emit('local.get $t0');
        emit('i32.ge_s');
        emit('call $push');
      } else if (t === '=') {
        emit('call $pop');
        emit('local.set $t0');
        emit('call $pop');
        emit('local.set $t1');
        emit('local.get $t1');
        emit('local.get $t0');
        emit('i32.eq');
        emit('call $push');
      } else if (t === '!=') {
        emit('call $pop');
        emit('local.set $t0');
        emit('call $pop');
        emit('local.set $t1');
        emit('local.get $t1');
        emit('local.get $t0');
        emit('i32.ne');
        emit('call $push');
      } else if (t === 'min') {
        // min of top two ints
        emit('call $pop');
        emit('local.set $t0'); // a
        emit('call $pop');
        emit('local.set $t1'); // b
        // select(b, a, b <= a)
        emit('local.get $t1');
        emit('local.get $t0');
        emit('local.get $t1');
        emit('local.get $t0');
        emit('i32.le_s');
        emit('select');
        emit('call $push');
      } else if (t === 'max') {
        // max of top two ints
        emit('call $pop');
        emit('local.set $t0'); // a
        emit('call $pop');
        emit('local.set $t1'); // b
        // select(b, a, b >= a)
        emit('local.get $t1');
        emit('local.get $t0');
        emit('local.get $t1');
        emit('local.get $t0');
        emit('i32.ge_s');
        emit('select');
        emit('call $push');
      } else if (t === 'clamp') {
        // clamp(x, lo, hi) where stack top is hi, then lo, then x
        emit('call $pop');
        emit('local.set $t0'); // hi
        emit('call $pop');
        emit('local.set $t1'); // lo
        emit('call $pop');
        emit('local.set $t2'); // x
        // max(x, lo) -> t2
        emit('local.get $t2');
        emit('local.get $t1');
        emit('local.get $t2');
        emit('local.get $t1');
        emit('i32.ge_s');
        emit('select');
        emit('local.set $t2');
        // min(t2, hi)
        emit('local.get $t2');
        emit('local.get $t0');
        emit('local.get $t2');
        emit('local.get $t0');
        emit('i32.le_s');
        emit('select');
        emit('call $push');
      } else if (t === 'if') {
        // pop predicate to WASM stack
        emit('call $pop');
        const { endIndex, trueBranch, falseBranch } = parseConditional(tokArr, i);
        emit('(if');
        emit('  (then');
        emitProgram(trueBranch);
        emit('  )');
        emit('  (else');
        if (falseBranch && falseBranch.length) {
          emitProgram(falseBranch);
        }
        emit('  )');
        emit(')');
        i = endIndex;
      } else if (t === 'then' || t === 'else') {
        // handled in parseConditional
      } else {
        throw new Error(`Unknown word in emitter: ${t}`);
      }
    }
  }

  emitProgram(tokens);

  const footer = [
    '    ;; return top of stack',
    '    call $pop',
    '  )',
    '  (export "main" (func $main))',
    ')' 
  ];

  return [...header, ...body, ...footer].join('\n');
}
