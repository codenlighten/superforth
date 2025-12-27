/**
 * Convergence Engine - Dual Agent Recursive Deliberation
 * 
 * Two agents engage in structured dialogue until they reach singularity:
 * - continue: false (both agents agree work is complete)
 * - missingContext: [] (no gaps in understanding)
 * 
 * This creates emergent intelligence through recursive refinement.
 */

const { queryOpenAI, baseAgentResponseSchema } = require('./openaiWrapperCJS.js');

/**
 * Check if agents have reached convergence (singularity)
 */
function hasConverged(agentResponse) {
  return !agentResponse.continue && agentResponse.missingContext.length === 0;
}

/**
 * Calculate convergence score (0-100)
 */
function getConvergenceScore(agentResponse) {
  let score = 0;
  
  // Not wanting to continue = 60 points
  if (!agentResponse.continue) score += 60;
  
  // No missing context = 40 points
  if (agentResponse.missingContext.length === 0) score += 40;
  
  // Partial credit for fewer missing items
  else {
    const missingPenalty = Math.min(agentResponse.missingContext.length * 10, 40);
    score += (40 - missingPenalty);
  }
  
  return Math.max(0, score);
}

/**
 * Run convergence loop between two agents
 * 
 * @param {string} initialQuery - The question/problem to converge on
 * @param {object} options - Configuration
 * @param {string} options.agentA - Role/persona for Agent A
 * @param {string} options.agentB - Role/persona for Agent B
 * @param {number} options.maxIterations - Max iterations before giving up (default 8)
 * @param {function} options.onIteration - Callback for each iteration
 * @param {number} options.temperature - Temperature for queries (default 0.3 for convergence)
 * @returns {Promise<object>} Final converged result with full conversation history
 */
async function converge(initialQuery, options = {}) {
  const {
    agentA = "Expert Researcher - Provide comprehensive analysis with depth",
    agentB = "Critical Reviewer - Find gaps, challenge assumptions, suggest improvements",
    maxIterations = 8,
    onIteration = null,
    temperature = 0.3
  } = options;
  
  const conversation = [];
  let currentContext = {
    originalQuery: initialQuery,
    iteration: 0
  };
  
  let agentAResponse = null;
  let agentBResponse = null;
  
  console.log(`\n🎯 Starting convergence on: "${initialQuery}"\n`);
  console.log(`Agent A: ${agentA}`);
  console.log(`Agent B: ${agentB}`);
  console.log(`Max iterations: ${maxIterations}\n`);
  console.log('═'.repeat(80));
  
  for (let i = 0; i < maxIterations; i++) {
    currentContext.iteration = i + 1;
    
    // Agent A's turn
    console.log(`\n🔵 Agent A - Iteration ${i + 1}`);
    console.log('─'.repeat(80));
    
    const agentAPrompt = i === 0 
      ? initialQuery
      : `Build upon and refine the previous discussion:\n\nPrevious response: ${agentBResponse.response}\n\nMissing context identified: ${agentBResponse.missingContext.join(', ') || 'None'}\n\nProvide deeper analysis.`;
    
    agentAResponse = await queryOpenAI(agentAPrompt, {
      context: currentContext,
      schema: baseAgentResponseSchema,
      temperature
    });
    
    const scoreA = getConvergenceScore(agentAResponse);
    console.log(`Response: ${agentAResponse.response.substring(0, 200)}...`);
    console.log(`Continue: ${agentAResponse.continue} | Missing: [${agentAResponse.missingContext.join(', ')}]`);
    console.log(`Convergence Score: ${scoreA}%`);
    
    conversation.push({
      iteration: i + 1,
      agent: 'A',
      role: agentA,
      response: agentAResponse
    });
    
    // Check convergence
    if (hasConverged(agentAResponse)) {
      console.log('\n🎉 SINGULARITY REACHED by Agent A!');
      return {
        converged: true,
        iterations: i + 1,
        finalResponse: agentAResponse,
        conversation,
        convergenceScore: 100
      };
    }
    
    currentContext.agentAResponse = agentAResponse;
    
    // Agent B's turn
    console.log(`\n🟢 Agent B - Iteration ${i + 1}`);
    console.log('─'.repeat(80));
    
    const agentBPrompt = `Review and critique this response. Find gaps, challenge assumptions, and suggest what's missing:\n\n${agentAResponse.response}`;
    
    agentBResponse = await queryOpenAI(agentBPrompt, {
      context: currentContext,
      schema: baseAgentResponseSchema,
      temperature
    });
    
    const scoreB = getConvergenceScore(agentBResponse);
    console.log(`Response: ${agentBResponse.response.substring(0, 200)}...`);
    console.log(`Continue: ${agentBResponse.continue} | Missing: [${agentBResponse.missingContext.join(', ')}]`);
    console.log(`Convergence Score: ${scoreB}%`);
    
    conversation.push({
      iteration: i + 1,
      agent: 'B',
      role: agentB,
      response: agentBResponse
    });
    
    // Check convergence
    if (hasConverged(agentBResponse)) {
      console.log('\n🎉 SINGULARITY REACHED by Agent B!');
      return {
        converged: true,
        iterations: i + 1,
        finalResponse: agentBResponse,
        conversation,
        convergenceScore: 100
      };
    }
    
    currentContext.agentBResponse = agentBResponse;
    
    // Callback for monitoring
    if (onIteration) {
      onIteration({
        iteration: i + 1,
        agentA: agentAResponse,
        agentB: agentBResponse,
        converged: false
      });
    }
    
    console.log('═'.repeat(80));
  }
  
  // Max iterations reached without full convergence
  const finalScore = Math.max(
    getConvergenceScore(agentAResponse),
    getConvergenceScore(agentBResponse)
  );
  
  console.log(`\n⚠️  Max iterations reached. Best convergence: ${finalScore}%`);
  
  return {
    converged: false,
    iterations: maxIterations,
    finalResponse: finalScore === getConvergenceScore(agentAResponse) ? agentAResponse : agentBResponse,
    conversation,
    convergenceScore: finalScore
  };
}

/**
 * Specialized convergence for code generation
 */
async function convergeOnCode(codeRequest, options = {}) {
  return converge(codeRequest, {
    ...options,
    agentA: "Senior Software Engineer - Write clean, documented, production-ready code",
    agentB: "Code Reviewer - Find bugs, security issues, performance problems, and style violations",
    temperature: 0.2  // Lower temp for code
  });
}

/**
 * Specialized convergence for architecture/design
 */
async function convergeOnArchitecture(architectureQuestion, options = {}) {
  return converge(architectureQuestion, {
    ...options,
    agentA: "Solutions Architect - Design scalable, maintainable systems",
    agentB: "Technical Critic - Challenge design decisions, find edge cases, suggest alternatives",
    temperature: 0.4
  });
}

module.exports = {
  converge,
  convergeOnCode,
  convergeOnArchitecture,
  hasConverged,
  getConvergenceScore
};
