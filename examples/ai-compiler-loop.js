/**
 * AI-Compiler Loop demo: intent -> Super-Forth -> strict compiler -> feedback
 */
import 'dotenv/config';
import { converge } from '../index.js';
import { tryCompile } from '../lib/superforth/compiler.js';

const intent = "Create a function that takes two numbers, squares them both, adds them, and returns the result. If the result is over 100, return 100 instead.";

const signature = { in: ['int', 'int'], out: ['int'] };

function buildSystemPrompt() {
  return `You are an AI code generator targeting a strict Super-Forth subset. 
Output ONLY code in this exact subset, no explanations. Keep it minimal.

Allowed words:
- Stack ops: dup drop swap over
- Arithmetic: + *
- Comparison: > (compares top two ints, pushes bool)
- Literals: integers (e.g., 100)
- Conditionals: if ... then (no else). 'if' consumes a bool; both branches must leave identical stack effect.

Constraints:
- Target stack signature: ( int int -- int )
- Do not use words outside the allowed list.
- Ensure final stack effect exactly matches output signature.
- Prefer small, correct programs over verbose ones.
- Do not print any commentary; only the code.`;
}

async function aiCompilerLoop() {
  let lastError = null;
  let program = '';

  for (let i = 1; i <= 6; i++) {
    const prompt = lastError
      ? `${intent}\n\nCompiler error: ${lastError}\n\nPlease correct the program.`
      : intent;

    const res = await converge(prompt, {
      agentA: 'Stack-Aware Code Generator - emit Super-Forth per spec',
      agentB: 'Compiler Proxy Reviewer - verify stack effects conceptually',
      maxIterations: 2,
      temperature: 0.2,
      requireBothAgents: true,
      systemPrompt: buildSystemPrompt()
    });

    program = res.finalResponse.response.trim();

    // sanitize: extract first code block or plain text
    program = program
      .replace(/^```[a-z]*\n([\s\S]*?)\n```$/m, '$1')
      .split('\n')
      .filter(line => !line.startsWith('#'))
      .join(' ')
      .trim();

    const compiled = tryCompile(program, signature);
    console.log(`\nIteration ${i}:`);
    console.log(`Program: ${program}`);

    if (compiled.ok) {
      console.log('Compiler Check: Success.');
      return { ok: true, program };
    } else {
      console.log(`Compiler Check: Error -> ${compiled.error}`);
      lastError = compiled.error;
    }
  }
  return { ok: false, program, error: lastError };
}

(async () => {
  console.log('AI-Compiler Loop Demo');
  const result = await aiCompilerLoop();
  console.log('\n' + '='.repeat(80));
  if (result.ok) {
    console.log('Final Program (Super-Forth):');
    console.log(result.program);
  } else {
    console.log('Failed to converge. Last error:');
    console.log(result.error);
  }
})();
