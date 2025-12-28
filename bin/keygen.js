#!/usr/bin/env node

/**
 * Key Generation and Management CLI
 * 
 * Usage:
 *   npm run keygen -- --agent builder-ci
 *   npm run keygen -- --agent approver-nuclear --export
 *   npm run keygen -- --list
 */

import { createKeySDK } from '@smartledger/keys';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.join(__dirname, '..', 'keys');

const keySDK = createKeySDK();

async function generateKeys(agentId) {
  console.log(`\n🔐 Generating dual keys for agent: ${agentId}`);
  
  try {
    // Create dual signature keys
    await keySDK.getOrCreateDualSignatureKeys(agentId, {
      primarySignatureSuite: 'ml-dsa-87',           // Post-quantum (NIST standard)
      secondarySignatureSuite: 'bsv-ecdsa-secp256k1' // Traditional (Bitcoin standard)
    });

    const keyRecord = await keySDK.getKey(`${agentId}:primary`);
    
    console.log(`   ✅ Keys created successfully`);
    console.log(`   Agent:        ${agentId}`);
    console.log(`   Algorithms:   ML-DSA-87 + ECDSA-secp256k1 (hybrid)`);
    console.log(`   Key ID:       ${keyRecord?.id || 'stored in SDK'}`);
    console.log(`   Status:       Active`);
    
    return true;
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`);
    return false;
  }
}

async function exportKeys(agentId) {
  console.log(`\n📤 Exporting public keys for agent: ${agentId}`);
  
  try {
    const primaryKey = await keySDK.getKey(`${agentId}:primary`);
    const secondaryKey = await keySDK.getKey(`${agentId}:secondary`);

    const exportData = {
      agent_id: agentId,
      exported_at: new Date().toISOString(),
      keys: {
        primary: {
          algorithm: 'ml-dsa-87',
          public_key: primaryKey?.publicKey ? Buffer.from(primaryKey.publicKey).toString('base64') : null
        },
        secondary: {
          algorithm: 'bsv-ecdsa-secp256k1',
          public_key: secondaryKey?.publicKey ? Buffer.from(secondaryKey.publicKey).toString('base64') : null
        }
      }
    };

    // Create keys directory
    await mkdir(keysDir, { recursive: true });
    
    const exportFile = path.join(keysDir, `${agentId}-public.json`);
    await writeFile(exportFile, JSON.stringify(exportData, null, 2));

    console.log(`   ✅ Public keys exported`);
    console.log(`   Location: ${exportFile}`);
    console.log(`   Format:   JSON (base64-encoded)`);
    
    return exportFile;
  } catch (err) {
    console.error(`   ❌ Error: ${err.message}`);
    return null;
  }
}

async function listKeys() {
  console.log(`\n📋 Available Keys (via SDK)`);
  console.log(`   Note: Key SDK manages key storage internally`);
  console.log(`   Use --export to get public key material\n`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`\n╔══════════════════════════════════════════════╗`);
    console.log(`║  SuperForth Key Management                   ║`);
    console.log(`╚══════════════════════════════════════════════╝`);
    console.log(`\nUsage:`);
    console.log(`  npm run keygen -- --agent <agent-id>`);
    console.log(`  npm run keygen -- --agent <agent-id> --export`);
    console.log(`  npm run keygen -- --list`);
    console.log(`\nExamples:`);
    console.log(`  npm run keygen -- --agent builder-ci`);
    console.log(`  npm run keygen -- --agent approver-nuclear --export`);
    console.log(`  npm run keygen -- --list\n`);
    return;
  }

  const agentIdx = args.indexOf('--agent');
  const agentId = agentIdx >= 0 ? args[agentIdx + 1] : null;
  const shouldExport = args.includes('--export');
  const shouldList = args.includes('--list');

  if (shouldList) {
    await listKeys();
  } else if (agentId) {
    const success = await generateKeys(agentId);
    if (success && shouldExport) {
      await exportKeys(agentId);
    }
  } else {
    console.error(`\n❌ Missing --agent <agent-id>\n`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`\n❌ Fatal error: ${err.message}\n`);
  process.exit(1);
});
