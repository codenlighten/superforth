/**
 * Code Generation Test
 * 
 * Watch two agents converge on production-ready code
 */

import 'dotenv/config';
import { convergeOnCode } from '../index.js';

async function main() {
  console.log('Code Generation Convergence Test\n');
  
  const result = await convergeOnCode(
    "Write a TypeScript class for a token bucket rate limiter that supports multiple buckets per user, includes async/await, proper error handling, and is thread-safe",
    {
      maxIterations: 6,
      onIteration: (state) => {
        console.log(`\n📊 Status: Iteration ${state.iteration}`);
      }
    }
  );
  
  console.log('\n' + '='.repeat(80));
  console.log('FINAL CODE');
  console.log('='.repeat(80));
  console.log(`Converged: ${result.converged}`);
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Score: ${result.convergenceScore}%`);
  console.log(`\n${result.finalResponse.response}`);
}

main().catch(console.error);
