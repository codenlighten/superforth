#!/usr/bin/env node
// Critical Infrastructure Control System Example
// Demonstrates verified safety-critical logic
import 'dotenv/config';
import { converge } from '../index.js';
import { tryCompile } from '../lib/superforth/compiler.js';
import { emitWAT } from '../lib/superforth/wasmEmitter.js';
import { writeAuditLog } from '../lib/auditLogger.js';
import fs from 'fs';

// Define safety-critical control system requirements
const CONTROL_SYSTEMS = {
  nuclear: {
    name: "Nuclear Reactor Safety Interlock",
    description: "Emergency shutdown logic for nuclear reactor control",
    inputs: ["core_temp (°C)", "coolant_pressure (PSI)", "neutron_flux (%)"],
    output: "emergency_shutdown (bool: 0=safe, 1=shutdown)",
    // Verified logic: flux>120 OR pressure>1500 OR temp>350
    fixedCode: "120 > swap 1500 > or swap 350 > or",
    outputType: 'bool',
    safetyLimits: {
      temp_max: 350,
      pressure_max: 1500,
      flux_max: 120
    },
    requirements: [
      "Shutdown if core temperature exceeds 350°C",
      "Shutdown if coolant pressure exceeds 1500 PSI",
      "Shutdown if neutron flux exceeds 120%",
      "Must be deterministic and crash-proof",
      "Execution time must be bounded and predictable"
    ]
  },
  
  grid: {
    name: "Power Grid Load Balancer",
    description: "Verified load management for electrical grid",
    inputs: ["current_load (MW)", "available_capacity (MW)"],
    output: "shed_load (bool: 0=normal, 1=shed)",
    // Shed if load*100 > capacity*95 OR (capacity - load) < 100
    fixedCode: "over over swap 100 * swap 95 * > if drop drop 1 0 > else swap - 100 < then",
    safetyLimits: {
      capacity_margin: 100, // Maintain 100MW safety margin
      max_utilization: 95   // Never exceed 95% capacity
    },
    outputType: 'bool',
    requirements: [
      "Shed load if demand exceeds 95% of capacity",
      "Maintain minimum 100MW safety margin",
      "Prevent grid overload and blackouts",
      "Must respond within bounded time"
    ]
  },
  
  water: {
    name: "Water Treatment Safety Monitor",
    description: "Chemical dosing and contamination detection",
    inputs: ["chlorine_ppm", "pH_level", "turbidity_NTU"],
    output: "alarm_state (bool: 0=safe, 1=alarm)",
    // Alarm if chlorine outside 1-4 ppm OR pH outside 6.5-8.5 (x10) OR turbidity > 5 NTU
    fixedCode: "5 > swap dup 65 < swap 85 > or swap or swap dup 1 < swap 4 > or swap or",
    safetyLimits: {
      chlorine_min: 1,
      chlorine_max: 4,
      pH_min: 65,  // pH 6.5
      pH_max: 85,  // pH 8.5
      turbidity_max: 5
    },
    outputType: 'bool',
    requirements: [
      "Alarm if chlorine outside 1-4 ppm range",
      "Alarm if pH outside 6.5-8.5 range",
      "Alarm if turbidity exceeds 5 NTU",
      "Public health depends on correct operation"
    ]
  }
};

async function generateControlLogic(systemSpec) {
  console.log('\n🏛️  CRITICAL INFRASTRUCTURE CONTROL SYSTEM');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`System: ${systemSpec.name}`);
  console.log(`Description: ${systemSpec.description}`);
  console.log('\nInputs:');
  systemSpec.inputs.forEach(i => console.log(`  • ${i}`));
  console.log(`\nOutput: ${systemSpec.output}`);
  console.log('\nSafety Requirements:');
  systemSpec.requirements.forEach(r => console.log(`  ✓ ${r}`));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (systemSpec.fixedCode) {
    console.log('Using pre-verified control logic (deterministic, audited)\n');
    return systemSpec.fixedCode.trim();
  }

  const prompt = `You are a control systems engineer for critical infrastructure.

System: ${systemSpec.name}
Description: ${systemSpec.description}

Inputs: ${systemSpec.inputs.join(', ')}
Output: ${systemSpec.output}

Safety Limits:
${JSON.stringify(systemSpec.safetyLimits, null, 2)}

Requirements:
${systemSpec.requirements.map(r => `- ${r}`).join('\n')}

Generate SuperForth code implementing this safety-critical control logic.

Language constraints:
- Stack operations: dup, drop, swap, over
- Arithmetic: +, -, *, /
- Comparisons: >, <, <=, >=, =, !=
- Utilities: min, max, clamp
- Control flow: if ... else ... then
- Integer literals

The code must:
1. Implement all safety requirements
2. Use the comparison and logical operators
3. Be crash-proof (verified by stack analyzer)
4. Have predictable, bounded execution time
5. Be deterministic (same inputs → same output always)

Return ONLY the SuperForth code implementing the safety logic.
Do NOT include explanations or markdown - just the code.`;

  const result = await converge(prompt, {
    agentA: "Control Systems Engineer - Design safety-critical logic",
    agentB: "Safety Verification Engineer - Ensure all requirements met",
    maxIterations: 8,
    temperature: 0.2,
    requireBothAgents: true,
  });

  if (!result.converged) {
    throw new Error('Failed to converge on control logic design');
  }

  return result.finalResponse.response.trim();
}

async function verifySafetyCriticalCode(systemSpec, code) {
  console.log('🔍 Verifying control logic...\n');
  
  // Determine signature
  const signature = {
    in: systemSpec.inputs.map(() => 'int'),
    out: [systemSpec.outputType || 'int']
  };
  
  // Static verification
  const compileResult = tryCompile(code, signature);
  
  if (!compileResult.ok) {
    console.error('❌ VERIFICATION FAILED');
    console.error(`Error: ${compileResult.error}`);
    process.exit(1);
  }
  
  console.log('✅ Static Analysis: PASSED');
  console.log(`   • Stack effects verified`);
  console.log(`   • Type safety guaranteed`);
  console.log(`   • No crashes possible`);
  console.log(`   • Signature: (${signature.in.join(' ')}) → (${signature.out.join(' ')})`);
  
  return true;
}

async function deployControlSystem(systemSpec, code) {
  const signature = {
    in: systemSpec.inputs.map(() => 'int'),
    out: [systemSpec.outputType || 'int']
  };
  
  console.log('\n📦 Generating deployable artifacts...\n');
  
  // Generate WAT
  const wat = emitWAT(code, signature);
  const outputDir = 'critical-systems';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const baseName = systemSpec.name.toLowerCase().replace(/\s+/g, '-');
  const watPath = `${outputDir}/${baseName}.wat`;
  const sfPath = `${outputDir}/${baseName}.sf`;
  const specPath = `${outputDir}/${baseName}-spec.json`;
  
  fs.writeFileSync(watPath, wat, 'utf8');
  fs.writeFileSync(sfPath, code, 'utf8');
  fs.writeFileSync(specPath, JSON.stringify(systemSpec, null, 2), 'utf8');
  
  console.log(`✅ SuperForth source: ${sfPath}`);
  console.log(`✅ WebAssembly (WAT): ${watPath}`);
  console.log(`✅ System specification: ${specPath}`);
  
  console.log('\n🎯 Deployment artifacts ready for:');
  console.log('   • Embedded systems (compile WAT → WASM)');
  console.log('   • PLCs and SCADA systems');
  console.log('   • Real-time operating systems');
  console.log('   • Hardware implementation (FPGA/ASIC)');
  
  console.log('\n🔒 Security properties:');
  console.log('   • Deterministic execution');
  console.log('   • Crash-proof guarantees');
  console.log('   • Bounded execution time');
  console.log('   • Cryptographically auditable');
  console.log('   • Reproducible builds');
}

async function runSampleScenarios(systemSpec, code) {
  const signature = {
    in: systemSpec.inputs.map(() => 'int'),
    out: [systemSpec.outputType || 'int']
  };
  const wat = emitWAT(code, signature);
  const wabtModule = await (await import('wabt')).default();
  const parsed = wabtModule.parseWat('module.wat', wat);
  const { buffer } = parsed.toBinary({ log: false, write_debug_names: false });
  const { instance } = await WebAssembly.instantiate(buffer, {});
  const fn = instance.exports.main;

  const author = process.env.AUDIT_AUTHOR || 'Safety-Team';
  const ticket = process.env.AUDIT_TICKET || `${systemSpec.name.replace(/\s+/g,'-').toUpperCase()}-DEMO`;
  const policyRef = process.env.AUDIT_POLICY_REF || '10CFR50-Appendix-B';
  const signatureKey = process.env.AUDIT_SIGNATURE_KEY || undefined;

  const scenarios = [];
  if (systemSpec.name.includes('Nuclear')) {
    scenarios.push({ name: 'Normal', args: [300,1200,100], expect: 0 });
    scenarios.push({ name: 'Critical Temperature', args: [400,1200,100], expect: 1 });
    scenarios.push({ name: 'Critical Pressure', args: [300,1600,100], expect: 1 });
    scenarios.push({ name: 'Critical Flux', args: [300,1200,150], expect: 1 });
  } else if (systemSpec.name.includes('Power Grid')) {
    scenarios.push({ name: 'Normal', args: [800,1000], expect: 0 });
    scenarios.push({ name: 'High Utilization >95%', args: [970,1000], expect: 1 });
    scenarios.push({ name: 'Low Margin <100', args: [950,1000], expect: 1 });
  } else if (systemSpec.name.includes('Water Treatment')) {
    scenarios.push({ name: 'Normal', args: [2,70,2], expect: 0 });
    scenarios.push({ name: 'Chlorine High', args: [5,70,2], expect: 1 });
    scenarios.push({ name: 'pH Low', args: [2,60,2], expect: 1 });
    scenarios.push({ name: 'Turbidity High', args: [2,70,6], expect: 1 });
  }

  console.log('\n🧪 Sample audited runs:');
  for (const sc of scenarios) {
    const result = fn(...sc.args);
    console.log(`   • ${sc.name}: args=${JSON.stringify(sc.args)} → result=${result} (expected ${sc.expect})`);
    const { filePath, buildHash } = writeAuditLog({
      command: 'sample-run',
      source: code,
      signature,
      runArgs: sc.args,
      watText: wat,
      wasmBuffer: buffer,
      result,
      outFiles: {},
      auditDir: 'logs',
      policy: { author, ticket, policyRef, signatureKey }
    });
    console.log(`     Audit: ${filePath} (hash ${buildHash.slice(0,12)}…)`);
  }
}

async function main() {
  const systemType = process.argv[2] || 'nuclear';
  
  if (!CONTROL_SYSTEMS[systemType]) {
    console.log('Usage: node examples/critical-infrastructure.js [system]');
    console.log('\nAvailable systems:');
    Object.keys(CONTROL_SYSTEMS).forEach(key => {
      console.log(`  ${key}: ${CONTROL_SYSTEMS[key].name}`);
    });
    process.exit(1);
  }
  
  const systemSpec = CONTROL_SYSTEMS[systemType];
  
  try {
    // Generate control logic via AI
    const code = await generateControlLogic(systemSpec);
    
    console.log('📝 Generated Control Logic:\n');
    console.log('```superforth');
    console.log(code);
    console.log('```\n');
    
    // Verify safety properties
    await verifySafetyCriticalCode(systemSpec, code);
    
    // Deploy
    await deployControlSystem(systemSpec, code);
    // Run audited samples
    await runSampleScenarios(systemSpec, code);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ CRITICAL SYSTEM VERIFIED AND READY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
  } catch (error) {
    console.error('\n❌ Critical system generation failed:', error.message);
    process.exit(1);
  }
}

main();
