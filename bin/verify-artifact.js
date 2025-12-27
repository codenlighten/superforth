#!/usr/bin/env node
/**
 * verify-artifact
 * 
 * Independent artifact verification tool for government agencies
 * 
 * Usage:
 *   verify-artifact <artifact-path> <audit-log-path> [options]
 * 
 * Examples:
 *   # Verify nuclear safety logic
 *   verify-artifact critical-systems/nuclear.sf logs/build-xxxxx.json
 *   
 *   # Check compliance with NRC regulations
 *   verify-artifact critical-systems/nuclear.sf logs/build-xxxxx.json \
 *     --compliance "NRC 10 CFR 50"
 *   
 *   # Check SLSA provenance
 *   verify-artifact nuclear.v logs/provenance.json --slsa
 */

import fs from 'fs';
import path from 'path';
import ArtifactVerifier from '../lib/artifactVerifier.js';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {
    artifactPath: '',
    auditLogPath: '',
    compliance: [],
    slsa: false,
    json: false,
    verbose: false
  };

  const positional = [];
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--compliance') {
      args.compliance.push(argv[++i]);
    } else if (arg === '--slsa') {
      args.slsa = true;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true;
    } else if (!arg.startsWith('--')) {
      positional.push(arg);
    }
  }

  args.artifactPath = positional[0];
  args.auditLogPath = positional[1];

  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  // Validation
  if (!args.artifactPath || !args.auditLogPath) {
    console.error(`
Usage: verify-artifact <artifact-path> <audit-log-path> [options]

Options:
  --compliance "FRAMEWORK"   Check against regulatory framework
                             (NRC 10 CFR 50, NERC CIP-005, EPA 40 CFR 141, FIPS 140-2 Level 3)
  --slsa                     Verify SLSA provenance
  --json                     Output as JSON
  --verbose, -v              Verbose output
  
Examples:
  verify-artifact critical-systems/nuclear.sf logs/build-abc123.json
  verify-artifact critical-systems/nuclear.sf logs/build-abc123.json --compliance "NRC 10 CFR 50"
  verify-artifact nuclear.v logs/provenance.json --slsa --json
`);
    process.exit(1);
  }

  // Check files exist
  if (!fs.existsSync(args.artifactPath)) {
    console.error(`❌ Artifact not found: ${args.artifactPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(args.auditLogPath)) {
    console.error(`❌ Audit log not found: ${args.auditLogPath}`);
    process.exit(1);
  }

  try {
    const verifier = new ArtifactVerifier({
      signatureKey: process.env.AUDIT_SIGNATURE_KEY
    });

    // Handle SLSA verification
    if (args.slsa) {
      const slsaResults = verifier.verifySLSAProvenance(args.auditLogPath);
      if (args.json) {
        console.log(JSON.stringify(slsaResults, null, 2));
      } else {
        console.log('\n🔗 SLSA PROVENANCE VERIFICATION');
        console.log('─'.repeat(80));
        console.log(`  ${slsaResults.summary}`);
        for (const [key, check] of Object.entries(slsaResults.checks)) {
          const status = check.pass ? '✅' : '❌';
          console.log(`  ${status} ${check.name}`);
          if (typeof check.details === 'object') {
            for (const [k, v] of Object.entries(check.details)) {
              if (v) console.log(`     ${k}: ${v}`);
            }
          } else if (check.details) {
            console.log(`     ${check.details}`);
          }
        }
        console.log('');
      }
      process.exit(slsaResults.valid ? 0 : 1);
    }

    // Generate comprehensive report
    const frameworks = args.compliance.length > 0 
      ? args.compliance 
      : ['NRC 10 CFR 50', 'NERC CIP-005', 'EPA 40 CFR 141', 'FIPS 140-2 Level 3'];

    const report = verifier.generateReport(args.artifactPath, args.auditLogPath, frameworks);

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      const formatted = verifier.formatReport(report);
      console.log(formatted);
    }

    // Exit with appropriate code
    process.exit(report.verification.valid ? 0 : 1);
  } catch (error) {
    console.error(`❌ Verification error: ${error.message}`);
    if (args.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
