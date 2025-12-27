/**
 * Code Critique Test - Force deeper iterations
 */

import 'dotenv/config';
import { convergeOnCode } from '../index.js';

async function main() {
  console.log('Advanced Code Generation with Critique\n');
  
  const result = await convergeOnCode(
    "Write a production-ready WebSocket connection pool manager in TypeScript with: automatic reconnection with exponential backoff, connection health checks, load balancing across multiple servers, proper cleanup, full TypeScript types, comprehensive error handling, and unit test examples",
    {
      maxIterations: 8,
      temperature: 0.3  // Higher temp to encourage more critique
    }
  );
  
  console.log('\n' + '='.repeat(80));
  console.log('FINAL RESULT');
  console.log('='.repeat(80));
  console.log(`Converged: ${result.converged}`);
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Score: ${result.convergenceScore}%`);
}

main().catch(console.error);
