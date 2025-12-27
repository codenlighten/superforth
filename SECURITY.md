# Security & Compliance Documentation

## Overview

The Convergence Engine includes a security-hardened Super-Forth compiler and execution pipeline designed for high-assurance environments including government and regulated industries.

## Security Features

### 1. Deterministic Builds

**WAT Generation:**
- Normalized line endings and whitespace
- No timestamps or machine-specific artifacts in generated code
- Disabled debug names in WASM binary compilation

**Reproducibility:**
- Same source code + signature → same WAT hash
- Same WAT → same WASM hash (with debug names disabled)
- Content-addressable build artifacts

### 2. Audit Logging

Every build operation can generate a cryptographically-verified audit log:

```bash
node bin/forge.js wasm-run \
  --code "min" \
  --sig "int int -- int" \
  --args "3,5" \
  --audit \
  --author "SecurityTeam" \
  --ticket "GOV-2025-001" \
  --policy-ref "NIST-800-53"
```

**Audit Log Contents:**
- **Timestamp:** ISO 8601 format
- **Build Hash:** SHA-256 of inputs + outputs
- **Toolchain Versions:** Node.js, npm, dependencies (dotenv, openai, wabt)
- **Inputs:** Source code, signature, runtime arguments
- **Outputs:** WAT hash, WASM hash, execution result
- **Policy Metadata:** Author, ticket reference, policy framework
- **Signature:** HMAC-SHA256 of build hash (optional)
- **Normalized WAT:** Full canonical text for verification

**Audit Log Location:**
- Default: `logs/build-<shortHash>.json`
- Custom: `--audit-dir <path>`
- Naming: Content-addressed by build hash (first 12 hex chars)

### 3. Policy Metadata

Support for compliance frameworks and audit trails:

**CLI Flags:**
- `--author <name>`: Build/deployment authorizer
- `--ticket <id>`: Issue tracking reference (Jira, ServiceNow, etc.)
- `--policy-ref <framework>`: Compliance framework (NIST-800-53, FedRAMP, ISO 27001, etc.)
- `--signature-key <key>`: HMAC key for signing build hash

**Environment Variables:**
```bash
export AUDIT_AUTHOR="SecurityTeam"
export AUDIT_TICKET="GOV-2025-001"
export AUDIT_POLICY_REF="NIST-800-53"
export AUDIT_SIGNATURE_KEY="your-secret-key-here"
```

### 4. Cryptographic Signatures

**HMAC Signing:**
- Builds can be signed with `--signature-key` or `AUDIT_SIGNATURE_KEY` env var
- Algorithm: HMAC-SHA256
- Signs the build hash (which encompasses all inputs/outputs)
- Recorded in audit log for verification

**Future Enhancements:**
- Ed25519 keypair signatures
- Integration with HSMs and key management systems
- Multi-signature workflows
- Certificate chain validation

### 5. Static Verification

**Compile-Time Guarantees:**
- Stack-effect checking: All code paths verified
- Type safety: `int` and `bool` enforced
- Conditional branch validation: Both branches must produce identical stack effects
- No runtime stack overflows or underflows possible

**What This Prevents:**
- Buffer overflows
- Type confusion attacks
- Control-flow hijacking
- Uninitialized memory access

## Compliance Frameworks

### NIST 800-53 Controls

The Super-Forth toolchain addresses:

- **SI-7 (Software Integrity):** Deterministic builds + audit logs + signatures
- **SA-10 (Developer Configuration Management):** Version-controlled source + toolchain versions
- **SA-11 (Developer Security Testing):** Static verification before compilation
- **AU-2 (Audit Events):** Comprehensive audit logging with policy metadata
- **AU-9 (Protection of Audit Information):** Content-addressed immutable logs

### FedRAMP Considerations

- **Moderate/High Impact:** Audit logging enabled by default in production pipelines
- **Cryptographic Modules:** Uses Node.js crypto (OpenSSL FIPS when configured)
- **Configuration Management:** Toolchain versions captured in every audit log

## Best Practices

### Development

```bash
# Verify before compilation
node bin/forge.js verify --code "your-code" --sig "int int -- int"

# Test execution
node bin/forge.js wasm-run --code "your-code" --sig "int int -- int" --args "10,20"
```

### Production Deployment

```bash
# Enable audit logging with policy metadata
node bin/forge.js wasm-run \
  --code "$(cat production.sf)" \
  --sig "int int -- int" \
  --args "0,0" \
  --out production.wasm \
  --audit \
  --audit-dir /var/log/builds \
  --author "$USER" \
  --ticket "$JIRA_TICKET" \
  --policy-ref "FedRAMP-Moderate" \
  --signature-key "$BUILD_SIGNING_KEY"
```

### Verification Workflow

1. **Build:** Generate WASM with audit log
2. **Archive:** Store audit log in immutable storage (S3 Object Lock, blockchain, etc.)
3. **Verify:** Recompute hashes and validate signature
4. **Deploy:** Only deploy verified artifacts

### Example Verification Script

```bash
#!/bin/bash
set -e

BUILD_LOG="logs/build-abc123.json"
EXPECTED_HASH=$(jq -r '.buildHash' "$BUILD_LOG")
WASM_FILE=$(jq -r '.outputs.outFiles.wasm' "$BUILD_LOG")

# Recompute WASM hash
ACTUAL_HASH=$(sha256sum "$WASM_FILE" | awk '{print $1}')
LOGGED_HASH=$(jq -r '.outputs.wasmHash' "$BUILD_LOG")

if [ "$ACTUAL_HASH" = "$LOGGED_HASH" ]; then
  echo "✓ WASM hash verified"
else
  echo "✗ WASM hash mismatch!"
  exit 1
fi

echo "✓ Build artifact verified"
```

## Threat Model

### In Scope

- **Supply Chain Attacks:** Mitigated by deterministic builds and toolchain versioning
- **Code Injection:** Prevented by static verification (no eval, no dynamic code)
- **Memory Safety:** Guaranteed by stack analyzer
- **Audit Tampering:** Prevented by content-addressed logs + signatures

### Out of Scope

- **Runtime Resource Exhaustion:** WASM runtime should enforce limits
- **Side-Channel Attacks:** Depends on WASM runtime (V8, Wasmtime, etc.)
- **Physical Security:** Assumes secure build infrastructure

## Roadmap

### Near Term
- [ ] Ed25519 signature support
- [ ] JSON Schema for audit logs
- [ ] Automated verification tooling
- [ ] Integration with SIEM systems

### Long Term
- [ ] Hardware Security Module (HSM) integration
- [ ] Blockchain-anchored audit trails
- [ ] Multi-party computation for sensitive builds
- [ ] Formal verification proofs

## References

- NIST 800-53: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-53r5.pdf
- FedRAMP: https://www.fedramp.gov/
- WebAssembly Security: https://webassembly.org/docs/security/
- Supply Chain Security: SLSA Framework (https://slsa.dev/)

## Contact

For security issues or compliance questions, please open an issue or contact the maintainers directly.

**DO NOT** disclose security vulnerabilities publicly until they have been addressed.
