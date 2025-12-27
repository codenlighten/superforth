/**
 * Testing Convergence on the Hardest Problem in Science/Philosophy
 */

import 'dotenv/config';
import { converge } from '../index.js';

async function main() {
  console.log('Testing Convergence on Maximum Complexity\n');
  
  const result = await converge(
    "Explain the hard problem of consciousness: why and how do physical processes in the brain give rise to subjective experience (qualia)? Address the explanatory gap, the knowledge argument (Mary's Room), philosophical zombies, integrated information theory, global workspace theory, quantum consciousness proposals, panpsychism, and emergentism. What would a complete explanation require?",
    {
      agentA: "Neuroscientist & Philosopher - Synthesize scientific and philosophical perspectives",
      agentB: "Critical Theorist - Challenge assumptions, identify logical gaps, demand rigor",
      maxIterations: 10,
      temperature: 0.4
    }
  );
  
  console.log('\n' + '='.repeat(80));
  console.log('CONVERGENCE RESULT');
  console.log('='.repeat(80));
  console.log(`Converged: ${result.converged}`);
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Final Score: ${result.convergenceScore}%`);
  console.log(`\n${result.converged ? '🎉 SINGULARITY REACHED' : '⚠️ MAX ITERATIONS - NO CONSENSUS'}`);
  
  if (!result.converged) {
    console.log('\n📊 Final Missing Context:');
    console.log(result.finalResponse.missingContext);
  }
}

main().catch(console.error);
