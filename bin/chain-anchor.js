#!/usr/bin/env node

/**
 * Blockchain Anchoring CLI
 * 
 * Anchors signed artifacts to a ledger (in-memory, file, or blockchain)
 * 
 * Usage:
 *   npm run chain-anchor -- --signature ./out/scram.wat.sig.json --ledger file --policy nuclear-scram-v1
 *   npm run chain-anchor -- --signature ./out/scram.wat.sig.json --ledger blockchain --chain ethereum
 */

import { AnchorRecord, InMemoryLedger, FileLedger, BlockchainLedger } from '../lib/chainLedger.js';
import { readFile } from 'node:fs/promises';

async function anchorSignature(signatureFile, ledgerType, config = {}) {
  console.log(`\n⛓️  Anchoring artifact to ${ledgerType} ledger`);
  
  try {
    // Read signature envelope
    const envelope = JSON.parse(await readFile(signatureFile, 'utf8'));
    const artifactHash = envelope.artifact.hash;

    // Create ledger instance
    let ledger;
    switch (ledgerType.toLowerCase()) {
      case 'memory':
        ledger = new InMemoryLedger();
        break;
      case 'file':
        ledger = new FileLedger(config.ledgerDir || './ledger');
        break;
      case 'blockchain':
        ledger = new BlockchainLedger({
          type: config.chain || 'ethereum',
          rpcUrl: config.rpcUrl,
          contractAddress: config.contractAddress
        });
        break;
      default:
        throw new Error(`Unknown ledger type: ${ledgerType}`);
    }

    // Create anchor record
    const record = new AnchorRecord(
      artifactHash,
      envelope.provenance.signatures,
      {
        policy_id: envelope.artifact.metadata?.policy_id || 'default',
        signer: envelope.provenance.signed_by,
        algorithms: envelope.provenance.algorithms,
        artifact_type: envelope.artifact.type
      }
    );

    // Anchor the record
    const result = await ledger.anchor(record);

    console.log(`   ✅ Artifact anchored successfully`);
    console.log(`   Artifact Hash:   ${artifactHash.slice(0, 16)}...`);
    console.log(`   Record ID:       ${record.id}`);
    console.log(`   Ledger Type:     ${ledgerType}`);
    console.log(`   Proof:           ${record.calculateProof().slice(0, 16)}...`);
    
    if (result.txid) {
      console.log(`   Tx ID:           ${result.txid}`);
    }
    if (result.status) {
      console.log(`   Status:          ${result.status}`);
    }
    
    console.log(`\n   Record stored for independent verification\n`);
    
    return record;
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}\n`);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  SuperForth Blockchain Anchoring             ║`);
    console.log(`╚══════════════════════════════════════════════╝`);
    console.log(`\nUsage:`);
    console.log(`  npm run chain-anchor -- --signature <sig-file> --ledger <type> [--chain <name>]`);
    console.log(`\nLedger Types: memory, file, blockchain`);
    console.log(`\nExamples:`);
    console.log(`  npm run chain-anchor -- --signature ./out/scram.wat.sig.json --ledger file`);
    console.log(`  npm run chain-anchor -- --signature ./out/scram.wat.sig.json --ledger blockchain --chain ethereum`);
    console.log(`  npm run chain-anchor -- --signature ./out/scram.wat.sig.json --ledger memory\n`);
    return;
  }

  const sigIdx = args.indexOf('--signature');
  const ledgerIdx = args.indexOf('--ledger');
  const chainIdx = args.indexOf('--chain');

  const signatureFile = sigIdx >= 0 ? args[sigIdx + 1] : null;
  const ledgerType = ledgerIdx >= 0 ? args[ledgerIdx + 1] : 'file';
  const chainName = chainIdx >= 0 ? args[chainIdx + 1] : 'ethereum';

  if (!signatureFile) {
    console.error(`\n❌ Missing --signature <file>\n`);
    process.exit(1);
  }

  await anchorSignature(signatureFile, ledgerType, { chain: chainName });
}

main().catch(err => {
  console.error(`\n❌ Fatal error: ${err.message}\n`);
  process.exit(1);
});
