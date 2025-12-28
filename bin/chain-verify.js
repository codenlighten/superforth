#!/usr/bin/env node

/**
 * Chain Verify CLI: Validate artifacts against blockchain-anchored signatures
 * Usage: npm run chain-verify -- --artifact <path> --signature <path> [--ledger <path>]
 *        npm run chain-verify -- --audit-log <path>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ChainVerifier } from '../lib/chainVerifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs(argv) {
  const args = {
    artifact: null,
    signature: null,
    auditLog: null,
    ledger: './ledger',
    format: 'text', // 'text' or 'json'
  };

  for (let i = 2; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--artifact') {
      args.artifact = argv[++i];
    } else if (t === '--signature') {
      args.signature = argv[++i];
    } else if (t === '--audit-log') {
      args.auditLog = argv[++i];
    } else if (t === '--ledger') {
      args.ledger = argv[++i];
    } else if (t === '--json') {
      args.format = 'json';
    }
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  // Validate arguments
  if (!args.artifact && !args.auditLog) {
    console.error(
      'Usage:\n' +
      '  npm run chain-verify -- --artifact <path> --signature <path> [--ledger <path>]\n' +
      '  npm run chain-verify -- --audit-log <path> [--ledger <path>]'
    );
    process.exit(1);
  }

  const verifier = new ChainVerifier(args.ledger);

  if (args.auditLog) {
    // Verify from audit log
    const results = verifier.verifyAuditLog(args.auditLog);

    if (args.format === 'json') {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(`Audit Log: ${args.auditLog}`);
      if (results.errors.length > 0) {
        results.errors.forEach(e => console.error(`✗ ${e}`));
        process.exit(1);
      }

      results.artifactVerifications.forEach((v, idx) => {
        console.log(`\nArtifact ${idx + 1}:`);
        console.log(verifier.generateReport(v));
      });

      console.log(`\nSUMMARY:`);
      console.log(`  Total Artifacts: ${results.summary.totalArtifacts}`);
      console.log(`  Valid Signatures: ${results.summary.validSignatures}`);
      console.log(`  Anchored: ${results.summary.anchoredArtifacts}`);
      console.log(`  Overall Valid: ${results.valid ? '✓ Yes' : '✗ No'}`);

      process.exit(results.valid ? 0 : 1);
    }
  } else {
    // Verify single artifact with signature
    if (!args.signature) {
      console.error('Provide --signature for artifact verification');
      process.exit(1);
    }

    const result = verifier.verifyArtifact(args.artifact, args.signature);

    if (args.format === 'json') {
      console.log(JSON.stringify(result.toJSON(), null, 2));
    } else {
      console.log(verifier.generateReport(result));
    }

    process.exit(result.valid ? 0 : 1);
  }
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(1);
});
