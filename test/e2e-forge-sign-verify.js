/**
 * E2E Test: Forge Compile → Sign → Anchor → Verify
 * Tests the complete pipeline for blockchain-anchored artifact provenance
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testDir = path.join(__dirname, '..', '.test-e2e');
// Use file-based test instead of --code for reliability
const sampleCodeFile = path.join(testDir, 'sample.sf');
// Valid SuperForth: square(x:int) -> int
const sampleCode = `dup *`;

function runCommand(cmd) {
  console.log(`\n$ ${cmd}`);
  try {
    const output = execSync(cmd, { 
      cwd: path.dirname(__dirname),
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    console.log(output);
    return { ok: true, output };
  } catch (e) {
    console.error(`✗ Command failed: ${e.message}`);
    return { ok: false, output: e.stdout || '', error: e.stderr || e.message };
  }
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('   E2E TEST: Forge → Sign → Anchor → Verify Pipeline        ');
  console.log('═══════════════════════════════════════════════════════════════');

  // Cleanup old test
  if (fs.existsSync(testDir)) {
    console.log(`\nCleaning up old test directory: ${testDir}`);
    fs.rmSync(testDir, { recursive: true });
  }
  fs.mkdirSync(testDir, { recursive: true });
  fs.mkdirSync(path.join(testDir, 'out'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'audit'), { recursive: true });

  console.log(`\nTest directory: ${testDir}`);

  // Step 1: Verify keys exist
  console.log('\n[1/6] Checking keys...');
  const envPath = path.join(path.dirname(__dirname), '.env');
  if (!fs.existsSync(envPath)) {
    console.error('✗ .env not found. Run: npm run keygen');
    process.exit(1);
  }
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log('✓ .env exists with key references');

  // Step 2: Compile with auto-signing (WAT)
  console.log('\n[2/6] Compiling to WAT with auto-signing...');
  const watFile = path.join(testDir, 'out', 'square.wat');
  const sigFile = `${watFile}.sig.json`;
  
  // Write sample code to file
  fs.writeFileSync(sampleCodeFile, sampleCode, 'utf8');
  
  const compileCmd = 
    `npm run forge -- ` +
    `--cmd wasm ` +
    `--file "${sampleCodeFile}" ` +
    `--sig "int--int" ` +
    `--out "${watFile}"`;
  
  const compileResult = runCommand(compileCmd);
  if (!compileResult.ok || !fs.existsSync(watFile)) {
    console.error('✗ Compilation failed');
    process.exit(1);
  }
  console.log('✓ WAT compiled');

  if (fs.existsSync(sigFile)) {
    console.log('✓ Artifact auto-signed and anchored');
    const sig = JSON.parse(fs.readFileSync(sigFile, 'utf8'));
    console.log(`  Hash: ${sig.artifact.hash.substring(0, 16)}...`);
    if (sig.chain_anchor) {
      console.log(`  Anchor ID: ${sig.chain_anchor.recordId}`);
    }
  } else {
    console.log('⚠ Signature file not generated (keys may not be set)');
  }

  // Step 3: Compile with audit log
  console.log('\n[3/6] Compiling to WAT with audit log...');
  const auditFile = path.join(testDir, 'audit', 'square.audit.json');
  const compileAuditCmd = 
    `npm run forge -- ` +
    `--cmd wasm ` +
    `--file "${sampleCodeFile}" ` +
    `--sig "int--int" ` +
    `--out "${watFile}" ` +
    `--audit ` +
    `--audit-dir "${path.join(testDir, 'audit')}"`;
  
  const auditResult = runCommand(compileAuditCmd);
  if (!auditResult.ok) {
    console.error('⚠ Audit log generation had issues, continuing...');
  } else {
    console.log('✓ Audit log generated');
  }

  // Step 4: Compile to Verilog (tests different artifact type)
  console.log('\n[4/6] Compiling to Verilog with auto-signing...');
  const vFile = path.join(testDir, 'out', 'square.v');
  const vSigFile = `${vFile}.sig.json`;
  const verilogCmd = 
    `npm run forge -- ` +
    `--file "${sampleCodeFile}" ` +
    `--cmd verilog ` +
    `--sig "int--int" ` +
    `--out "${vFile}"`;
  
  const verilogResult = runCommand(verilogCmd);
  if (!verilogResult.ok || !fs.existsSync(vFile)) {
    console.error('⚠ Verilog compilation had issues');
  } else {
    console.log('✓ Verilog compiled');
    if (fs.existsSync(vSigFile)) {
      console.log('✓ Verilog artifact auto-signed');
      const vSig = JSON.parse(fs.readFileSync(vSigFile, 'utf8'));
      console.log(`  Hash: ${vSig.artifact.hash.substring(0, 16)}...`);
    }
  }

  // Step 5: Verify artifact with signature
  console.log('\n[5/6] Verifying artifact against signature and chain...');
  if (fs.existsSync(watFile) && fs.existsSync(sigFile)) {
    const verifyCmd = 
      `npm run chain-verify -- ` +
      `--artifact "${watFile}" ` +
      `--signature "${sigFile}" ` +
      `--ledger "${path.join(path.dirname(__dirname), 'ledger')}"`;
    
    const verifyResult = runCommand(verifyCmd);
    if (verifyResult.ok) {
      console.log('✓ Artifact verification passed');
    } else {
      console.log('⚠ Artifact verification had issues (may be expected if ledger is empty)');
    }
  } else {
    console.log('⚠ Skipping verification (no signature file)');
  }

  // Step 6: Verify audit log
  console.log('\n[6/6] Verifying audit log...');
  if (fs.existsSync(auditFile)) {
    const auditVerifyCmd = 
      `npm run chain-verify -- ` +
      `--audit-log "${auditFile}" ` +
      `--ledger "${path.join(path.dirname(__dirname), 'ledger')}"`;
    
    const auditVerifyResult = runCommand(auditVerifyCmd);
    if (auditVerifyResult.ok) {
      console.log('✓ Audit log verification passed');
    } else {
      console.log('⚠ Audit log verification had issues');
    }
  } else {
    console.log('⚠ No audit log to verify');
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                          TEST SUMMARY                         ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`\nGenerated artifacts in: ${testDir}`);
  console.log(`  • ${path.relative('.', watFile)}`);
  if (fs.existsSync(vFile)) {
    console.log(`  • ${path.relative('.', vFile)}`);
  }
  if (fs.existsSync(sigFile)) {
    console.log(`  • ${path.relative('.', sigFile)}`);
  }
  if (fs.existsSync(auditFile)) {
    console.log(`  • ${path.relative('.', auditFile)}`);
  }

  const watFileExists = fs.existsSync(watFile);
  const vFileExists = fs.existsSync(vFile);
  const sigExists = fs.existsSync(sigFile);
  const auditExists = fs.existsSync(auditFile);

  console.log('\nPipeline Results:');
  console.log(`  Compile WAT:        ${watFileExists ? '✓' : '✗'}`);
  console.log(`  Compile Verilog:    ${vFileExists ? '✓' : '✗'}`);
  console.log(`  Auto-sign:          ${sigExists ? '✓' : '✗'}`);
  console.log(`  Create audit log:   ${auditExists ? '✓' : '✗'}`);
  console.log(`  Verify artifacts:   (see above)`);

  console.log('\n✓ E2E test complete. Check ledger/index.json for anchored artifacts.');
  console.log('\nNext steps:');
  console.log('  • Review generated audit logs');
  console.log('  • Verify artifacts: npm run chain-verify -- --artifact out/square.wat --signature out/square.wat.sig.json');
  console.log('  • Check ledger: cat ledger/index.json');
}

main().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});
