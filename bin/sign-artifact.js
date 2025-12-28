#!/usr/bin/env node

/**
 * Artifact Signing CLI
 * 
 * Signs WAT/WASM/Verilog artifacts with hybrid PQ + ECDSA
 * 
 * Usage:
 *   npm run sign-artifact -- --artifact ./out/system.wat --agent builder-ci --policy nuclear-scram-v1
 */

import { signArtifact, signManifest, inspectSignature } from '../lib/hybridSigner.js';
import { readFile, writeFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

async function signFile(filePath, agentId, policyId) {
  console.log(`\n🔐 Signing artifact: ${filePath}`);
  
  try {
    const content = await readFile(filePath, 'utf8');
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    
    // Determine artifact type from extension
    const ext = path.extname(filePath).toLowerCase();
    const typeMap = {
      '.wat': 'wasm-text',
      '.wasm': 'wasm-binary',
      '.v': 'verilog',
      '.sf': 'superforth',
      '.json': 'manifest'
    };
    const artifactType = typeMap[ext] || 'unknown';

    // Sign the artifact
    const envelope = await signArtifact(
      {
        type: artifactType,
        hash,
        metadata: {
          file: path.basename(filePath),
          size: content.length,
          policy_id: policyId
        }
      },
      agentId
    );

    // Inspect and save
    inspectSignature(envelope);
    
    const signatureFile = filePath + '.sig.json';
    await writeFile(signatureFile, JSON.stringify(envelope, null, 2));
    
    console.log(`   ✅ Signature saved: ${signatureFile}\n`);
    return envelope;
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}\n`);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  SuperForth Artifact Signing                 ║`);
    console.log(`╚══════════════════════════════════════════════╝`);
    console.log(`\nUsage:`);
    console.log(`  npm run sign-artifact -- --artifact <file> --agent <agent-id> --policy <policy-id>`);
    console.log(`\nExamples:`);
    console.log(`  npm run sign-artifact -- --artifact ./out/scram.wat --agent builder-ci --policy nuclear-scram-v1`);
    console.log(`  npm run sign-artifact -- --artifact ./out/scram.wasm --agent builder-ci --policy nuclear-scram-v1\n`);
    return;
  }

  const artifactIdx = args.indexOf('--artifact');
  const agentIdx = args.indexOf('--agent');
  const policyIdx = args.indexOf('--policy');

  const artifactFile = artifactIdx >= 0 ? args[artifactIdx + 1] : null;
  const agentId = agentIdx >= 0 ? args[agentIdx + 1] : 'builder-ci';
  const policyId = policyIdx >= 0 ? args[policyIdx + 1] : 'default-policy';

  if (!artifactFile) {
    console.error(`\n❌ Missing --artifact <file>\n`);
    process.exit(1);
  }

  await signFile(artifactFile, agentId, policyId);
}

main().catch(err => {
  console.error(`\n❌ Fatal error: ${err.message}\n`);
  process.exit(1);
});
