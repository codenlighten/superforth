/**
 * Hybrid Signing Integration for SuperForth Artifacts
 * 
 * Dual-signature (ML-DSA-87 + ECDSA) for all compilation artifacts,
 * with blockchain anchoring support.
 */

import { createKeySDK } from '@smartledger/keys';
import crypto from 'node:crypto';

const keySDK = createKeySDK();

/**
 * Sign an artifact with hybrid PQ + ECDSA
 * @param {Object} artifact - { type, hash, content, metadata }
 * @param {string} agentId - Signer agent ID (e.g., 'builder-ci', 'approver-nuclear')
 * @returns {Promise<Object>} Signature envelope
 */
export async function signArtifact(artifact, agentId = 'builder-ci') {
  // Ensure dual keys exist for this agent
  await keySDK.getOrCreateDualSignatureKeys(agentId, {
    primarySignatureSuite: 'ml-dsa-87',           // Post-quantum
    secondarySignatureSuite: 'bsv-ecdsa-secp256k1' // Traditional
  });

  // Prepare artifact for signing (hash + metadata only, not content to avoid leakage)
  const signingData = {
    type: artifact.type,
    hash: artifact.hash,
    metadata: artifact.metadata,
    timestamp: new Date().toISOString()
  };

  const dataBytes = new TextEncoder().encode(JSON.stringify(signingData));

  // Dual sign
  const { signatures } = await keySDK.signWithSuites(agentId, dataBytes);

  // Retrieve public keys
  const publicKeys = [];
  for (const sig of signatures) {
    const keyRecord = await keySDK.getKey(sig.keyId);
    if (keyRecord?.publicKey) {
      publicKeys.push({
        algorithm: sig.suiteId,
        keyId: sig.keyId,
        publicKey: Buffer.from(keyRecord.publicKey).toString('base64')
      });
    }
  }

  // Return signature envelope
  return {
    artifact: {
      type: artifact.type,
      hash: artifact.hash,
      metadata: artifact.metadata
    },
    provenance: {
      signed_by: agentId,
      signed_at: new Date().toISOString(),
      algorithms: signatures.map(s => s.suiteId),
      public_keys: publicKeys,
      signatures: signatures.map(s => ({
        algorithm: s.suiteId,
        keyId: s.keyId,
        signature: Buffer.from(s.signature).toString('base64')
      }))
    },
    // Placeholder for blockchain anchor (filled by chain signer)
    chain_anchor: null
  };
}

/**
 * Verify a signature envelope
 * @param {Object} envelope - From signArtifact()
 * @returns {Promise<boolean>} True if both signatures valid
 */
export async function verifySignature(envelope) {
  const signingData = {
    type: envelope.artifact.type,
    hash: envelope.artifact.hash,
    metadata: envelope.artifact.metadata,
    timestamp: envelope.provenance.signed_at
  };

  const dataBytes = new TextEncoder().encode(JSON.stringify(signingData));

  const signaturesForVerification = envelope.provenance.signatures.map(s => ({
    suiteId: s.algorithm,
    keyId: s.keyId,
    signature: new Uint8Array(Buffer.from(s.signature, 'base64'))
  }));

  try {
    const result = await keySDK.verifyWithSuites(
      dataBytes,
      signaturesForVerification,
      envelope.provenance.signed_by
    );
    return result.valid;
  } catch (err) {
    console.error(`Signature verification failed: ${err.message}`);
    return false;
  }
}

/**
 * Create a signing envelope for multiple artifacts with a common policy
 * @param {Array} artifacts - Array of { type, hash, metadata }
 * @param {string} policyId - Policy identifier (e.g., 'nuclear-reactor-scram-v1')
 * @param {string} approverAgentId - Approver key to sign the manifest
 * @returns {Promise<Object>} Manifest with all signatures
 */
export async function signManifest(artifacts, policyId, approverAgentId = 'approver-nuclear') {
  // Create manifest data
  const manifestData = {
    policy_id: policyId,
    artifacts: artifacts.map(a => ({
      type: a.type,
      hash: a.hash
    })),
    created_at: new Date().toISOString()
  };

  const manifestHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(manifestData))
    .digest('hex');

  // Sign the manifest with approver key
  const approverSignature = await signArtifact(
    {
      type: 'manifest',
      hash: manifestHash,
      metadata: { policy_id: policyId, artifact_count: artifacts.length }
    },
    approverAgentId
  );

  return {
    manifest: manifestData,
    manifest_hash: manifestHash,
    approval: approverSignature,
    // Placeholder for blockchain anchors of all artifacts
    chain_anchors: {}
  };
}

/**
 * Format signature envelope for JSON output/storage
 */
export function formatEnvelope(envelope) {
  return JSON.stringify(envelope, null, 2);
}

/**
 * Display signature details
 */
export function inspectSignature(envelope) {
  console.log('\n🔐 Signature Envelope:');
  console.log(`   Artifact Type:   ${envelope.artifact.type}`);
  console.log(`   Artifact Hash:   ${envelope.artifact.hash.slice(0, 16)}...`);
  console.log(`   Signed By:       ${envelope.provenance.signed_by}`);
  console.log(`   Signed At:       ${envelope.provenance.signed_at}`);
  console.log(`   Algorithms:      ${envelope.provenance.algorithms.join(', ')}`);
  console.log(`   Signatures:      ${envelope.provenance.signatures.length}`);
  
  envelope.provenance.signatures.forEach((sig, idx) => {
    const sigBytes = Buffer.from(sig.signature, 'base64').length;
    console.log(`      ${idx + 1}. ${sig.algorithm}: ${sigBytes} bytes (Key: ${sig.keyId})`);
  });
  
  if (envelope.chain_anchor) {
    console.log(`   Chain Anchor:    ${envelope.chain_anchor.txid}`);
  }
  console.log('');
}
