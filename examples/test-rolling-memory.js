/**
 * Rolling Memory Demo
 * 
 * Demonstrates how rolling memory maintains context across many iterations
 * without token explosion
 */

import 'dotenv/config';
import { converge } from '../index.js';
import { getMemoryStats } from '../lib/rollingMemory.js';

async function main() {
  console.log('Rolling Memory Demo - Long Conversation\n');
  
  const result = await converge(
    "Explain quantum computing from first principles, covering: superposition, entanglement, quantum gates, error correction, decoherence, quantum algorithms (Shor's, Grover's), quantum supremacy claims, current hardware implementations (superconducting qubits, trapped ions, topological qubits), and the path to practical quantum computers",
    {
      agentA: "Quantum Physicist - Explain with mathematical rigor and physical intuition",
      agentB: "Critical Educator - Ensure clarity, identify gaps, demand practical examples",
      maxIterations: 15,
      temperature: 0.35,
      useMemory: true
    }
  );
  
  console.log('\n' + '='.repeat(80));
  console.log('CONVERGENCE RESULT');
  console.log('='.repeat(80));
  console.log(`Converged: ${result.converged}`);
  console.log(`Iterations: ${result.iterations}`);
  console.log(`Final Score: ${result.convergenceScore}%`);
  
  if (result.memoryState) {
    console.log('\n' + '='.repeat(80));
    console.log('MEMORY STATISTICS');
    console.log('='.repeat(80));
    const stats = getMemoryStats(result.memoryState);
    console.log(`Total messages: ${stats.totalMessages}`);
    console.log(`Active window: ${stats.activeWindowSize}/${stats.maxWindowSize}`);
    console.log(`Summaries: ${stats.summariesCount}/${stats.maxSummaries}`);
    console.log(`Session duration: ${Math.round((new Date(stats.updatedAt) - new Date(stats.createdAt)) / 1000)}s`);
    
    if (result.memoryState.summaries.length > 0) {
      console.log('\n📚 Summaries Created:');
      result.memoryState.summaries.forEach((summary, i) => {
        console.log(`\n  Summary ${i + 1}:`);
        console.log(`  Convergence Score: ${summary.convergenceScore || 'N/A'}%`);
        console.log(`  Key Topics: ${summary.metadata?.keyTopics?.join(', ') || 'N/A'}`);
        console.log(`  Importance: ${summary.metadata?.importance || 'N/A'}/10`);
      });
    }
  }
}

main().catch(console.error);
