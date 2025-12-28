#!/usr/bin/env node
// Simple CLI for Super-Forth compiler
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { tryCompile } from '../lib/superforth/compiler.js';
import { emitWAT } from '../lib/superforth/wasmEmitter.js';
import VerilogEmitter from '../lib/superforth/verilogEmitter.js';
import { signArtifact } from '../lib/hybridSigner.js';
import { AnchorRecord, FileLedger } from '../lib/chainLedger.js';
import wabt from 'wabt';
import { writeAuditLog } from '../lib/auditLogger.js';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LEDGER_DIR = path.join(__dirname, '..', 'ledger');
const BUILDER_AGENT = process.env.BUILDER_KEY_AGENT || 'builder-ci';

/**
 * Sign and anchor an artifact to the ledger
 */
async function signAndAnchorArtifact(artifactContent, artifactType, policyId = 'default') {
  try {
    const hash = crypto.createHash('sha256').update(artifactContent).digest('hex');
    
    // Sign the artifact
    const envelope = await signArtifact(
      {
        type: artifactType,
        hash,
        metadata: {
          policy_id: policyId,
          size: artifactContent.length
        }
      },
      BUILDER_AGENT
    );

    // Anchor to file ledger
    const ledger = new FileLedger(LEDGER_DIR);
    const record = new AnchorRecord(
      hash,
      envelope.provenance.signatures,
      {
        policy_id: policyId,
        signer: envelope.provenance.signed_by,
        artifact_type: artifactType
      }
    );

    await ledger.anchor(record);
    envelope.chain_anchor = {
      ledger: 'file',
      recordId: record.id,
      proof: record.calculateProof(),
      timestamp: new Date().toISOString()
    };

    return envelope;
  } catch (err) {
    console.warn(`⚠️  Signing/anchoring skipped: ${err.message}`);
    return null;
  }
}

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
  if (['verify','compile','wasm','wasm-run','verilog'].includes(a[0])) args.cmd = a.shift();
  for (let i = 0; i < a.length; i++) {
    const t = a[i];
    if (t === '--cmd') {
      args.cmd = a[++i];
    } else if (t === '--file') {
      args.source = fs.readFileSync(a[++i], 'utf8');
    } else if (t === '--code') {
      args.source = a[++i];
    } else if (t === '--sig') {
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
  const signature = { 
    in: args.inSig, 
    out: args.outSig.length ? args.outSig : ['int'] 
  };
  // Apply defaults if no --sig provided at all
  if (!process.argv.includes('--sig')) {
    signature.in = ['int', 'int'];
    signature.out = ['int'];
  }
  if (args.cmd === 'wasm') {
    try {
      const wat = emitWAT(args.source, signature);
      if (args.outFile) {
        fs.writeFileSync(args.outFile, wat, 'utf8');
        console.log(`Wrote WAT to ${args.outFile}`);
      } else {
        console.log(wat);
      }
      
      // Auto-sign and anchor WAT artifact
      let signatureEnvelope = null;
      if (BUILDER_AGENT) {
        try {
          signatureEnvelope = await signAndAnchorArtifact(
            wat,
            'wat',
            args.policy || 'default'
          );
          if (args.outFile) {
            const sigFile = `${args.outFile}.sig.json`;
            fs.writeFileSync(sigFile, JSON.stringify(signatureEnvelope, null, 2), 'utf8');
            console.log(`✓ Signed WAT: ${sigFile}`);
            console.log(`  Anchor chain: ${signatureEnvelope.chain_anchor?.timestamp || 'pending'}`);
          }
        } catch (sigErr) {
          console.warn(`⚠ Signing failed (non-fatal): ${sigErr.message}`);
        }
      }
      
      if (args.audit) {
        const auditPayload = {
          command: 'wasm',
          source: args.source,
          signature,
          watText: wat,
          outFiles: { wat: args.outFile || null },
          auditDir: args.auditDir,
          policy: args.policy,
        };
        if (signatureEnvelope) {
          auditPayload.signatures = {
            envelope: signatureEnvelope,
          };
        }
        const { filePath, buildHash } = writeAuditLog(auditPayload);
        console.log(`Audit log: ${filePath}\nBuild hash: ${buildHash}`);
      }
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  } else if (args.cmd === 'verilog') {
    try {
      const res = tryCompile(args.source, signature);
      if (!res.ok) {
        console.error('Compilation failed:', res.error);
        process.exit(1);
      }
      const emitter = new VerilogEmitter();
      const verilog = emitter.emitModule(res.tokens, 
        `${signature.in.join(' ')} -- ${signature.out.join(' ')}`);
      
      if (args.outFile) {
        fs.writeFileSync(args.outFile, verilog, 'utf8');
        console.log(`Wrote Verilog to ${args.outFile}`);
      } else {
        console.log(verilog);
      }

      // Generate timing report
      const timing = emitter.generateTimingReport(res.tokens);
      console.log('\n📊 Hardware Synthesis Estimates:');
      console.log(`  Critical Path: ${timing.criticalPathDelay}`);
      console.log(`  Max Frequency: ${timing.maxFrequency}`);
      console.log(`  Execution: ${timing.singleCycleExecution ? 'Single cycle' : 'Pipelined'}`);
      console.log(`  Gate Count: ~${timing.gateCount} gates`);

      // Auto-sign and anchor Verilog artifact
      let signatureEnvelope = null;
      if (BUILDER_AGENT) {
        try {
          signatureEnvelope = await signAndAnchorArtifact(
            verilog,
            'verilog',
            args.policy || 'default'
          );
          if (args.outFile) {
            const sigFile = `${args.outFile}.sig.json`;
            fs.writeFileSync(sigFile, JSON.stringify(signatureEnvelope, null, 2), 'utf8');
            console.log(`✓ Signed Verilog: ${sigFile}`);
            console.log(`  Anchor chain: ${signatureEnvelope.chain_anchor?.timestamp || 'pending'}`);
          }
        } catch (sigErr) {
          console.warn(`⚠ Signing failed (non-fatal): ${sigErr.message}`);
        }
      }

      if (args.audit) {
        const auditPayload = {
          command: 'verilog',
          source: args.source,
          signature,
          verilogText: verilog,
          timing,
          outFiles: { v: args.outFile || null },
          auditDir: args.auditDir,
          policy: args.policy,
        };
        if (signatureEnvelope) {
          auditPayload.signatures = {
            envelope: signatureEnvelope,
          };
        }
        const { filePath, buildHash } = writeAuditLog(auditPayload);
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
      
      // Auto-sign WAT before execution
      let signatureEnvelope = null;
      if (BUILDER_AGENT) {
        try {
          signatureEnvelope = await signAndAnchorArtifact(
            wat,
            'wat',
            args.policy || 'default'
          );
          console.log(`✓ Signed WAT (execution trace): ${signatureEnvelope.artifact?.hash?.substring(0, 8)}...`);
        } catch (sigErr) {
          console.warn(`⚠ Signing failed (non-fatal): ${sigErr.message}`);
        }
      }
      
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
        const auditPayload = {
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
        };
        if (signatureEnvelope) {
          auditPayload.signatures = {
            envelope: signatureEnvelope,
          };
        }
        const { filePath, buildHash } = writeAuditLog(auditPayload);
        console.log(`Audit log: ${filePath}\nBuild hash: ${buildHash}`);
      }
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
  } else {
    // Default: verify (parse and check)
    // Default: verify (parse and check)
    const res = tryCompile(args.source, signature);
    if (res.ok) {
      console.log('Verified: OK');
      
      // Auto-sign source code on successful verification
      let signatureEnvelope = null;
      if (BUILDER_AGENT) {
        try {
          signatureEnvelope = await signAndAnchorArtifact(
            args.source,
            'sf',
            args.policy || 'default'
          );
          console.log(`✓ Signed verified SuperForth: ${signatureEnvelope.artifact?.hash?.substring(0, 8)}...`);
        } catch (sigErr) {
          console.warn(`⚠ Signing failed (non-fatal): ${sigErr.message}`);
        }
      }
      
      if (args.audit) {
        const auditPayload = {
          command: 'verify',
          source: args.source,
          signature,
          outFiles: {},
          auditDir: args.auditDir,
          policy: args.policy,
        };
        if (signatureEnvelope) {
          auditPayload.signatures = {
            envelope: signatureEnvelope,
          };
        }
        const { filePath, buildHash } = writeAuditLog(auditPayload);
        console.log(`Audit log: ${filePath}\nBuild hash: ${buildHash}`);
      }
    } else {
      console.error('Error:', res.error);
      process.exit(1);
    }
  }
}

main();
