/**
 * Blockchain Ledger for SuperForth Artifact Anchoring
 * 
 * Stores immutable records of signed artifacts:
 * - artifact hash
 * - signature data (PQ + ECDSA)
 * - signer identity
 * - policy binding
 * - timestamp
 * 
 * Can be:
 * - In-memory (for testing)
 * - File-based (JSON ledger)
 * - Blockchain-backed (Bitcoin, Ethereum, etc.)
 * - Air-gapped snapshot (for verification)
 */

import crypto from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

/**
 * Blockchain anchor record
 */
export class AnchorRecord {
  constructor(artifactHash, signatures, metadata = {}) {
    this.id = crypto.randomUUID();
    this.timestamp = new Date().toISOString();
    this.artifactHash = artifactHash;
    this.signatures = signatures;
    this.metadata = metadata; // { policyId, signer, algorithms, ... }
  }

  // Calculate merkle root for immutability proof
  calculateProof() {
    const data = JSON.stringify({
      artifactHash: this.artifactHash,
      timestamp: this.timestamp,
      metadata: this.metadata
    });
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}

/**
 * In-Memory Ledger (for testing and local builds)
 */
export class InMemoryLedger {
  constructor() {
    this.records = new Map(); // hash -> AnchorRecord
    this.txLog = []; // Transaction log for audit
  }

  anchor(record) {
    this.records.set(record.artifactHash, record);
    this.txLog.push({
      action: 'anchor',
      recordId: record.id,
      hash: record.artifactHash,
      timestamp: record.timestamp
    });
    return { txid: record.id, status: 'anchored' };
  }

  query(hash) {
    return this.records.get(hash) || null;
  }

  queryAll() {
    return Array.from(this.records.values());
  }

  revoke(hash, reason = '') {
    if (this.records.has(hash)) {
      const record = this.records.get(hash);
      record.revoked = true;
      record.revocation_reason = reason;
      this.txLog.push({
        action: 'revoke',
        hash,
        reason,
        timestamp: new Date().toISOString()
      });
      return { status: 'revoked' };
    }
    return { error: 'Record not found' };
  }

  export() {
    return {
      version: '1.0',
      type: 'in-memory-ledger',
      exported_at: new Date().toISOString(),
      record_count: this.records.size,
      records: this.queryAll(),
      tx_log: this.txLog
    };
  }
}

/**
 * File-Based Ledger (persistent, air-gapped safe)
 */
export class FileLedger {
  constructor(ledgerDir = './ledger') {
    this.ledgerDir = ledgerDir;
    this.indexFile = path.join(ledgerDir, 'index.json');
    this.recordsDir = path.join(ledgerDir, 'records');
  }

  async initialize() {
    await mkdir(this.ledgerDir, { recursive: true });
    await mkdir(this.recordsDir, { recursive: true });
    try {
      await readFile(this.indexFile);
    } catch {
      // Create fresh index
      await writeFile(this.indexFile, JSON.stringify({
        version: '1.0',
        type: 'file-ledger',
        created_at: new Date().toISOString(),
        records: {},
        tx_log: []
      }, null, 2));
    }
  }

  async anchor(record) {
    await this.initialize();
    const index = JSON.parse(await readFile(this.indexFile, 'utf8'));
    
    // Store record file
    const recordFile = path.join(this.recordsDir, `${record.artifactHash.slice(0, 16)}.json`);
    await writeFile(recordFile, JSON.stringify(record, null, 2));
    
    // Update index
    index.records[record.artifactHash] = {
      id: record.id,
      timestamp: record.timestamp,
      file: recordFile,
      proof: record.calculateProof()
    };
    
    index.tx_log.push({
      action: 'anchor',
      recordId: record.id,
      hash: record.artifactHash,
      timestamp: record.timestamp
    });
    
    await writeFile(this.indexFile, JSON.stringify(index, null, 2));
    return { txid: record.id, status: 'anchored', proof: record.calculateProof() };
  }

  async query(hash) {
    const index = JSON.parse(await readFile(this.indexFile, 'utf8'));
    if (!index.records[hash]) return null;
    
    const recordFile = index.records[hash].file;
    return JSON.parse(await readFile(recordFile, 'utf8'));
  }

  async export() {
    const index = JSON.parse(await readFile(this.indexFile, 'utf8'));
    const records = {};
    
    for (const [hash, entry] of Object.entries(index.records)) {
      records[hash] = JSON.parse(await readFile(entry.file, 'utf8'));
    }
    
    return {
      ...index,
      records,
      exported_at: new Date().toISOString()
    };
  }

  async createSnapshot() {
    // For air-gapped verification
    return JSON.stringify(await this.export(), null, 2);
  }
}

/**
 * Blockchain Ledger (production - anchors to actual chain)
 * Placeholder for integration with Bitcoin, Ethereum, or custom ledger
 */
export class BlockchainLedger {
  constructor(chainConfig = {}) {
    this.chainType = chainConfig.type || 'ethereum'; // 'bitcoin', 'ethereum', 'custom'
    this.rpcUrl = chainConfig.rpcUrl;
    this.contractAddress = chainConfig.contractAddress;
    this.signer = chainConfig.signer; // ethers.Signer or similar
    this.records = new Map(); // Local cache
  }

  async anchor(record) {
    // TODO: Implement chain-specific anchoring
    // For Ethereum: call contract.anchor(recordHash, metadata)
    // For Bitcoin: OP_RETURN with record hash
    // For now, return placeholder
    
    const proof = record.calculateProof();
    this.records.set(record.artifactHash, {
      ...record,
      proof,
      pending: true
    });

    return {
      txid: crypto.randomUUID(),
      status: 'pending',
      proof,
      chainType: this.chainType,
      message: `Anchoring to ${this.chainType} (implement chain integration)`
    };
  }

  async query(hash) {
    // TODO: Query chain for anchor record
    return this.records.get(hash) || null;
  }

  async confirmAnchor(txid, blockNumber) {
    // Mark record as confirmed on-chain
    for (const [, record] of this.records) {
      if (record.id === txid) {
        record.pending = false;
        record.block_number = blockNumber;
        record.confirmed_at = new Date().toISOString();
      }
    }
  }
}

/**
 * Multi-Ledger Strategy (use multiple backends for redundancy)
 */
export class MultiLedger {
  constructor(ledgers = []) {
    this.ledgers = ledgers; // e.g., [InMemoryLedger, FileLedger, BlockchainLedger]
  }

  async anchor(record) {
    const results = [];
    for (const ledger of this.ledgers) {
      try {
        results.push(await ledger.anchor(record));
      } catch (err) {
        results.push({ error: err.message });
      }
    }
    return results;
  }

  async query(hash) {
    for (const ledger of this.ledgers) {
      try {
        const record = await ledger.query(hash);
        if (record) return record;
      } catch (err) {
        // Try next ledger
      }
    }
    return null;
  }

  async createSnapshot() {
    // Export all ledgers for air-gapped verification
    const snapshots = [];
    for (const ledger of this.ledgers) {
      if (typeof ledger.createSnapshot === 'function') {
        snapshots.push(await ledger.createSnapshot());
      } else if (typeof ledger.export === 'function') {
        snapshots.push(JSON.stringify(await ledger.export(), null, 2));
      }
    }
    return snapshots;
  }
}

export default {
  AnchorRecord,
  InMemoryLedger,
  FileLedger,
  BlockchainLedger,
  MultiLedger
};
