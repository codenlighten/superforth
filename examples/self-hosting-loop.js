#!/usr/bin/env node
// Self-hosting loop: AI improves the compiler with verification
import 'dotenv/config';
import { converge } from '../index.js';
import { tryCompile } from '../lib/superforth/compiler.js';
import fs from 'fs';

const COMPILER_PATH = './lib/superforth/compiler.js';

async function generateCompilerImprovement(currentCompiler, goal) {
  console.log('\n🔄 AI-COMPILER SELF-HOSTING LOOP');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Goal: ${goal}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const systemPrompt = `You are a compiler engineer working on SuperForth.
Current compiler source code is provided below.

Your task: ${goal}

Requirements:
1. Preserve all existing functionality
2. Maintain the same exports and API
3. Keep static verification guarantees
4. Add clear comments explaining changes
5. Return ONLY the complete, modified compiler.js code
6. Do not use markdown code blocks - return raw JavaScript

Current compiler:
${currentCompiler}

Return the complete improved compiler.js file.`;

  const result = await converge(systemPrompt, {
    agentA: "Compiler Expert - Propose improvements maintaining correctness",
    agentB: "Verification Engineer - Ensure changes preserve guarantees",
    maxIterations: 5,
    temperature: 0.2,
    requireBothAgents: true,
  });

  if (!result.converged) {
    throw new Error('AI did not converge on compiler improvement');
  }

  return result.finalResponse.response;
}

function validateCompilerAPI(code) {
  // Check that essential exports exist
  const requiredExports = ['compile', 'tryCompile', 'CompileError'];
  for (const exp of requiredExports) {
    if (!code.includes(`export function ${exp}`) && !code.includes(`export class ${exp}`)) {
      throw new Error(`Missing required export: ${exp}`);
    }
  }
  
  // Basic syntax check
  try {
    new Function(code);
  } catch (e) {
    throw new Error(`Syntax error in generated code: ${e.message}`);
  }
}

async function testCompiler(compilerCode) {
  // Write to temporary file
  const tempPath = './lib/superforth/compiler.test-new.js';
  fs.writeFileSync(tempPath, compilerCode, 'utf8');
  
  try {
    // Dynamic import
    const testCompiler = await import(tempPath + '?t=' + Date.now());
    
    // Run test cases
    const testCases = [
      { code: '1 2 +', sig: { in: [], out: ['int'] }, shouldPass: true },
      { code: 'dup * swap dup * +', sig: { in: ['int','int'], out: ['int'] }, shouldPass: true },
      { code: 'dup', sig: { in: [], out: ['int'] }, shouldPass: false },
      { code: '1 2 + dup 10 > if drop 5 then', sig: { in: [], out: ['int'] }, shouldPass: true },
      { code: 'min', sig: { in: ['int','int'], out: ['int'] }, shouldPass: true },
      { code: 'clamp', sig: { in: ['int','int','int'], out: ['int'] }, shouldPass: true },
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const tc of testCases) {
      const result = testCompiler.tryCompile(tc.code, tc.sig);
      const actualPass = result.ok;
      if (actualPass === tc.shouldPass) {
        passed++;
      } else {
        failed++;
        console.error(`❌ Test failed: "${tc.code}" - expected ${tc.shouldPass ? 'pass' : 'fail'}, got ${actualPass ? 'pass' : 'fail'}`);
      }
    }
    
    console.log(`\n✓ Compiler tests: ${passed} passed, ${failed} failed`);
    
    if (failed > 0) {
      throw new Error('Compiler tests failed');
    }
    
    return true;
  } finally {
    // Clean up
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

async function selfHost(goal) {
  try {
    // Read current compiler
    const currentCompiler = fs.readFileSync(COMPILER_PATH, 'utf8');
    
    // Generate improvement
    console.log('📝 Generating compiler improvement...\n');
    const improvedCompiler = await generateCompilerImprovement(currentCompiler, goal);
    
    // Extract code if wrapped in markdown
    let cleanCode = improvedCompiler;
    const codeBlockMatch = improvedCompiler.match(/```(?:javascript|js)?\n([\s\S]+?)\n```/);
    if (codeBlockMatch) {
      cleanCode = codeBlockMatch[1];
    }
    
    console.log('\n🔍 Validating compiler API...');
    validateCompilerAPI(cleanCode);
    console.log('✓ API validation passed\n');
    
    console.log('🧪 Testing improved compiler...');
    await testCompiler(cleanCode);
    console.log('✓ All compiler tests passed\n');
    
    // Save improved version
    const backupPath = COMPILER_PATH + '.backup';
    fs.copyFileSync(COMPILER_PATH, backupPath);
    console.log(`💾 Backed up original to: ${backupPath}`);
    
    fs.writeFileSync(COMPILER_PATH, cleanCode, 'utf8');
    console.log(`✓ Wrote improved compiler to: ${COMPILER_PATH}`);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🎉 SELF-HOSTING SUCCESSFUL');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('\nThe AI has successfully improved its own compiler!');
    console.log('All tests pass. The system can now use the improved version.\n');
    
  } catch (error) {
    console.error('\n❌ Self-hosting failed:', error.message);
    process.exit(1);
  }
}

// Example goals for self-improvement
const IMPROVEMENT_GOALS = {
  optimize: "Optimize the stack analyzer for better performance without changing behavior",
  comments: "Add more detailed inline comments explaining the verification algorithm",
  errors: "Improve error messages to be more helpful for developers",
  refactor: "Refactor code for better readability while maintaining all functionality",
};

const goal = process.argv[2] || 'comments';

if (!IMPROVEMENT_GOALS[goal]) {
  console.log('Usage: node examples/self-hosting-loop.js [goal]');
  console.log('\nAvailable goals:');
  Object.keys(IMPROVEMENT_GOALS).forEach(g => {
    console.log(`  ${g}: ${IMPROVEMENT_GOALS[g]}`);
  });
  process.exit(1);
}

selfHost(IMPROVEMENT_GOALS[goal]);
