import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getToolchainVersions() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return {
    node: process.version,
    npm: process.env.npm_config_user_agent?.split(' ')[0] || 'unknown',
    convergence: pkg.version,
    dependencies: pkg.dependencies,
  };
}

export function canonicalizeWAT(wat) {
  // Normalize newlines and trim trailing spaces for determinism of text hashing
  return wat
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.replace(/\s+$/g, ''))
    .join('\n');
}

export function sha256(data) {
  const h = crypto.createHash('sha256');
  h.update(data);
  return h.digest('hex');
}

export function shortHash(hex, len = 12) {
  return hex.slice(0, len);
}

export function writeAuditLog({
  command,
  source,
  signature,
  runArgs = [],
  watText = null,
  wasmBuffer = null,
  result = null,
  outFiles = {},
  auditDir = 'logs',
  policy = {}
}) {
  ensureDir(auditDir);
  const normalizedWAT = watText ? canonicalizeWAT(watText) : null;
  const watHash = normalizedWAT ? sha256(Buffer.from(normalizedWAT, 'utf8')) : null;
  const wasmHash = wasmBuffer ? sha256(Buffer.from(wasmBuffer)) : null;

  const buildInputs = {
    source,
    signature,
    runArgs,
  };

  const buildOutputs = {
    watHash,
    wasmHash,
    result,
    outFiles,
  };

  const buildHash = sha256(Buffer.from(JSON.stringify({ buildInputs, buildOutputs }), 'utf8'));
  const stamp = new Date().toISOString();
  const toolchain = getToolchainVersions();
  
  // Generate signature: sign buildHash with a simple HMAC (expandable to real keypairs)
  const signatureKey = policy.signatureKey || process.env.AUDIT_SIGNATURE_KEY || '';
  const signature_hmac = signatureKey ? crypto.createHmac('sha256', signatureKey).update(buildHash).digest('hex') : null;

  const entry = {
    timestamp: stamp,
    command,
    inputs: buildInputs,
    outputs: buildOutputs,
    buildHash,
    toolchain,
    policy: {
      author: policy.author || process.env.AUDIT_AUTHOR || 'unknown',
      ticket: policy.ticket || process.env.AUDIT_TICKET || null,
      policyRef: policy.policyRef || process.env.AUDIT_POLICY_REF || null,
    },
    signature: signature_hmac,
    normalizedWAT: normalizedWAT || undefined,
  };

  const fileName = `build-${shortHash(buildHash)}.json`;
  const filePath = path.join(auditDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(entry, null, 2), 'utf8');
  return { filePath, buildHash };
}
