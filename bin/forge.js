#!/usr/bin/env node
// Simple CLI for Super-Forth compiler
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tryCompile } from '../lib/superforth/compiler.js';
import { emitWAT } from '../lib/superforth/wasmEmitter.js';
import wabt from 'wabt';
import { writeAuditLog } from '../lib/auditLogger.js';

function parseArgs(argv) {
  const args = { 
    cmd: 'compile', 
    source: '', 
    inSig: [], 
    outSig: [], 
    runArgs: [], 
    outFile: '', 
    audit: false, 
    auditDir: 'logs',
    policy: {} 
  };
  const a = argv.slice(2);
  if (['verify','compile','wasm','wasm-run'].includes(a[0])) args.cmd = a.shift();
  for (let i = 0; i < a.length; i++) {
    const t = a[i];
    if (t === '--file') args.source = fs.readFileSync(a[++i], 'utf8');
    else if (t === '--code') args.source = a[++i];
    else if (t === '--sig') {
      const sig = a[++i];
      const parts = sig.split('--');
      args.inSig = parts[0].trim().split(/[\s,]+/).filter(Boolean);
      args.outSig = parts[1].trim().split(/[\s,]+/).filter(Boolean);
    } else if (t === '--args') {
      args.runArgs = a[++i].split(',').map(s => parseInt(s.trim(), 10));
    } else if (t === '--out') {
      args.outFile = a[++i];
    } else if (t === '--audit') {
      args.audit = true;
    } else if (t === '--audit-dir') {
      args.auditDir = a[++i];
    } else if (t === '--author') {
      args.policy.author = a[++i];
    } else if (t === '--ticket') {
      args.policy.ticket = a[++i];
    } else if (t === '--policy-ref') {
      args.policy.policyRef = a[++i];
    } else if (t === '--signature-key') {
      args.policy.signatureKey = a[++i];
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.source) {
    console.error('Provide source via --code "..." or --file file.sf');
    process.exit(1);
  }
  const signature = { in: args.inSig.length ? args.inSig : ['int','int'], out: args.outSig.length ? args.outSig : ['int'] };
  if (args.cmd === 'wasm') {
    try {
      const wat = emitWAT(args.source, signature);
      if (args.outFile) {
        fs.writeFileSync(args.outFile, wat, 'utf8');
        console.log(`Wrote WAT to ${args.outFile}`);
      } else {
        console.log(wat);
      }
      if (args.audit) {
        const { filePath, buildHash } = writeAuditLog({
          command: 'wasm',
          source: args.source,
          signature,
          watText: wat,
          outFiles: { wat: args.outFile || null },
          auditDir: args.auditDir,
          policy: args.policy,
        });
        console.log(`Audit log: ${filePath}\nBuild hash: ${buildHash}`);
      }
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  } else if (args.cmd === 'wasm-run') {
    try {
      const wat = emitWAT(args.source, signature);
      const wabtModule = await wabt();
      const parsed = wabtModule.parseWat('module.wat', wat);
      const { buffer } = parsed.toBinary({ log: false, write_debug_names: false });
      if (args.outFile) {
        fs.writeFileSync(args.outFile, Buffer.from(buffer), 'binary');
        console.log(`Wrote WASM to ${args.outFile}`);
      }
      const { instance } = await WebAssembly.instantiate(buffer, {});
      const fn = instance.exports.main;
      const argc = signature.in.length;
      if (args.runArgs.length !== argc) {
        console.error(`Provide ${argc} args via --args, e.g., --args "3,4"`);
        process.exit(1);
      }
      const result = fn(...args.runArgs);
      console.log('Result:', result);
      if (args.audit) {
        const { filePath, buildHash } = writeAuditLog({
          command: 'wasm-run',
          source: args.source,
          signature,
          runArgs: args.runArgs,
          watText: wat,
          wasmBuffer: buffer,
          result,
          outFiles: { wasm: args.outFile || null },
          auditDir: args.auditDir,
          policy: args.policy,
        });
        console.log(`Audit log: ${filePath}\nBuild hash: ${buildHash}`);
      }
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  } else {
    const res = tryCompile(args.source, signature);
    if (res.ok) {
      console.log('Verified: OK');
      if (args.audit) {
        const { filePath, buildHash } = writeAuditLog({
          command: 'verify',
          source: args.source,
          signature,
          outFiles: {},
          auditDir: args.auditDir,
          policy: args.policy,
        });
        console.log(`Audit log: ${filePath}\nBuild hash: ${buildHash}`);
      }
    } else {
      console.error('Error:', res.error);
      process.exit(1);
    }
  }
}

main();
