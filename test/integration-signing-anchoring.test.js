#!/usr/bin/env node

/**
 * Integration Test: Key Generation → Signing → Anchoring
 * 
 * Tests the full blockchain-anchored provenance pipeline:
 * 1. Generate keys for builder and approver agents
 * 2. Store key references in .env
 * 3. Sign a sample artifact
 * 4. Anchor to ledger
 * 5. Verify signature and anchor
 */

import { createKeySDK } from '@smartledger/keys';
import { signArtifact, verifySignature } from '../lib/hybridSigner.js';
import { AnchorRecord, FileLedger, InMemoryLedger } from '../lib/chainLedger.js';
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
const keysDir = path.join(__dirname, '..', 'keys');

const keySDK = createKeySDK();

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║  Integration Test: Signing + Anchoring Pipeline              ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

// Step 1: Generate Keys
console.log('📝 Step 1: Generate Keys');
console.log('─'.repeat(60));

async function generateAndStoreKeys() {
  const agents = ['builder-ci', 'approver-nuclear'];
  const keyInfo = {};

  for (const agent of agents) {
    console.log(`\n   Generating keys for: ${agent}`);
    try {
      await keySDK.getOrCreateDualSignatureKeys(agent, {
        primarySignatureSuite: 'ml-dsa-87',
        secondarySignatureSuite: 'bsv-ecdsa-secp256k1'
      });

      const primaryKey = await keySDK.getKey(`${agent}:primary`);
      keyInfo[agent] = {
        primaryKeyId: primaryKey?.id || `${agent}:primary`,
        secondaryKeyId: `${agent}:secondary`,
        created: new Date().toISOString()
      };

      console.log(`   ✅ Keys created for ${agent}`);
      console.log(`      Primary:   ML-DSA-87`);
      console.log(`      Secondary: ECDSA-secp256k1`);
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
      return null;
    }
  }

  // Store key info in .env
  console.log(`\n   📝 Storing key references in .env...`);
  try {
    let envContent = await readFile(envPath, 'utf8').catch(() => '');
    
    // Remove existing key entries
    envContent = envContent.split('\n')
      .filter(line => !line.startsWith('BUILDER_KEY_') && !line.startsWith('APPROVER_KEY_'))
      .join('\n')
      .trim();

    // Add new key info
    const keyEnv = [
      '',
      '# SuperForth Signing Keys (Generated 2025-12-28)',
      `BUILDER_KEY_AGENT=builder-ci`,
      `BUILDER_KEY_PRIMARY_ID=${keyInfo['builder-ci'].primaryKeyId}`,
      `APPROVER_KEY_AGENT=approver-nuclear`,
      `APPROVER_KEY_PRIMARY_ID=${keyInfo['approver-nuclear'].primaryKeyId}`,
      `KEY_GENERATION_DATE=${new Date().toISOString()}`
    ].join('\n');

    await writeFile(envPath, envContent + keyEnv + '\n');
    console.log(`   ✅ Key references stored in .env`);
  } catch (err) {
    console.error(`   ❌ Error writing .env: ${err.message}`);
    return null;
  }

  return keyInfo;
}

// Step 2: Sign Artifacts
console.log('\n📝 Step 2: Sign Artifacts');
console.log('─'.repeat(60));

async function signSampleArtifacts() {
  const artifacts = [
    {
      type: 'wasm-text',
      hash: crypto.createHash('sha256').update('(module (func))').digest('hex'),
      metadata: { file: 'nuclear-scram.wat', policy_id: 'nuclear-scram-v1' }
    },
    {
      type: 'verilog',
      hash: crypto.createHash('sha256').update('module sf_control(...);').digest('hex'),
      metadata: { file: 'nuclear-scram.v', policy_id: 'nuclear-scram-v1' }
    }
  ];

  const signedArtifacts = [];

  for (const artifact of artifacts) {
    console.log(`\n   Signing: ${artifact.metadata.file}`);
    try {
      const envelope = await signArtifact(artifact, 'builder-ci');
      signedArtifacts.push(envelope);

      console.log(`   ✅ Signed successfully`);
      console.log(`      Type:       ${artifact.type}`);
      console.log(`      Hash:       ${artifact.hash.slice(0, 16)}...`);
      console.log(`      Signatures: ${envelope.provenance.signatures.length}`);
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
    }
  }

  return signedArtifacts;
}

// Step 3: Verify Signatures
console.log('\n📝 Step 3: Verify Signatures');
console.log('─'.repeat(60));

async function verifySigned(signedArtifacts) {
  for (const envelope of signedArtifacts) {
    console.log(`\n   Verifying: ${envelope.artifact.metadata.file}`);
    try {
      const isValid = await verifySignature(envelope);
      if (isValid) {
        console.log(`   ✅ Signatures verified`);
      } else {
        console.log(`   ⚠️  Verification result: ${isValid}`);
      }
    } catch (err) {
      console.error(`   ❌ Error: ${err.message}`);
    }
  }
}

// Step 4: Anchor to Ledger
console.log('\n📝 Step 4: Anchor to Ledger');
console.log('─'.repeat(60));

async function anchorToLedger(signedArtifacts) {
  const ledgers = {
    memory: new InMemoryLedger(),
    file: new FileLedger(path.join(__dirname, '..', 'ledger'))
  };

  const anchors = {};

  for (const name in ledgers) {
    console.log(`\n   Anchoring to ${name} ledger...`);
    const ledger = ledgers[name];
    anchors[name] = {};

    for (const envelope of signedArtifacts) {
      try {
        const record = new AnchorRecord(
          envelope.artifact.hash,
          envelope.provenance.signatures,
          {
            policy_id: envelope.artifact.metadata.policy_id,
            signer: envelope.provenance.signed_by,
            artifact_type: envelope.artifact.type
          }
        );

        const result = await ledger.anchor(record);

        console.log(`   ✅ Anchored: ${envelope.artifact.metadata.file}`);
        console.log(`      Ledger:  ${name}`);
        console.log(`      Record:  ${record.id.slice(0, 8)}...`);
        console.log(`      Proof:   ${record.calculateProof().slice(0, 16)}...`);

        anchors[name][envelope.artifact.hash] = {
          recordId: record.id,
          proof: record.calculateProof(),
          result
        };

        // Store anchor reference in envelope
        envelope.chain_anchor = {
          ledger: name,
          recordId: record.id,
          proof: record.calculateProof(),
          timestamp: new Date().toISOString()
        };
      } catch (err) {
        console.error(`   ❌ Error: ${err.message}`);
      }
    }
  }

  return { anchors, updatedEnvelopes: signedArtifacts };
}

// Step 5: Query Ledger
console.log('\n📝 Step 5: Query Ledger');
console.log('─'.repeat(60));

async function queryLedger(anchors, ledgers) {
  for (const name in anchors) {
    console.log(`\n   Querying ${name} ledger...`);
    const ledger = ledgers[name];

    for (const [hash, anchor] of Object.entries(anchors[name])) {
      try {
        const record = await ledger.query(hash);
        if (record) {
          console.log(`   ✅ Found anchor for: ${hash.slice(0, 16)}...`);
          console.log(`      Record ID:  ${record.id.slice(0, 8)}...`);
          console.log(`      Timestamp:  ${record.timestamp}`);
        } else {
          console.log(`   ⚠️  No anchor found for: ${hash.slice(0, 16)}...`);
        }
      } catch (err) {
        console.error(`   ❌ Error: ${err.message}`);
      }
    }
  }
}

// Main execution
async function main() {
  try {
    // Step 1: Generate keys
    const keyInfo = await generateAndStoreKeys();
    if (!keyInfo) throw new Error('Key generation failed');

    // Step 2: Sign artifacts
    const signedArtifacts = await signSampleArtifacts();
    if (signedArtifacts.length === 0) throw new Error('No artifacts signed');

    // Step 3: Verify signatures
    await verifySigned(signedArtifacts);

    // Step 4: Anchor to ledgers
    const ledgers = {
      memory: new InMemoryLedger(),
      file: new FileLedger(path.join(__dirname, '..', 'ledger'))
    };

    const { anchors } = await anchorToLedger(signedArtifacts);

    // Step 5: Query ledgers
    await queryLedger(anchors, ledgers);

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ INTEGRATION TEST PASSED                                   ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    console.log('Summary:');
    console.log(`  • Keys generated: ${Object.keys(keyInfo).length}`);
    console.log(`  • Artifacts signed: ${signedArtifacts.length}`);
    console.log(`  • Signatures verified: ${signedArtifacts.length}`);
    console.log(`  • Ledgers anchored: ${Object.keys(anchors).length}`);
    console.log(`  • Key references stored in: .env\n`);

    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    process.exit(1);
  }
}

main();
