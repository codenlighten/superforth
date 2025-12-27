/**
 * GitHub Command Agent
 * 
 * Generates git/GitHub commands based on natural language requests
 */

const { queryOpenAI } = require('./openaiWrapperCJS.js');

// GitHub command response schema
const githubCommandSchema = {
  type: "object",
  properties: {
    explanation: { 
      type: "string",
      description: "Clear explanation of what these commands do"
    },
    commands: {
      type: "array",
      description: "Array of git/GitHub commands to execute in order",
      items: { type: "string" }
    },
    warnings: {
      type: "array",
      description: "Important warnings or things to check before running",
      items: { type: "string" }
    },
    requiresManualStep: {
      type: "boolean",
      description: "Whether any steps require manual action (like creating a repo on GitHub)"
    },
    manualSteps: {
      type: "array",
      description: "Manual steps that need to be done",
      items: { type: "string" }
    },
    safe: {
      type: "boolean",
      description: "Whether these commands are safe to run automatically (non-destructive)"
    }
  },
  required: ["explanation", "commands", "warnings", "requiresManualStep", "manualSteps", "safe"],
  additionalProperties: false
};

/**
 * Query for GitHub/git commands
 * @param {string} request - Natural language description of what you want to do
 * @param {object} options - Optional configuration
 * @returns {Promise<object>} GitHub command response
 */
async function getGitHubCommands(request, options = {}) {
  const context = {
    currentDirectory: process.cwd(),
    ...options.context
  };
  
  const prompt = `Generate git/GitHub commands for this request: ${request}

Context:
- Current directory: ${context.currentDirectory}
- Platform: ${process.platform}

Provide specific commands that can be executed.
Be clear about any manual steps (like creating a repo on github.com).
Warn about potentially destructive operations.`;

  return queryOpenAI(prompt, {
    ...options,
    context,
    schema: githubCommandSchema,
    temperature: 0.1  // Very low - we want precise commands
  });
}

/**
 * Execute GitHub commands with safety checks
 * @param {string} request - What you want to do
 * @param {boolean} dryRun - If true, only show commands without executing
 * @returns {Promise<object>} Result with commands and execution status
 */
async function executeGitHubCommands(request, dryRun = true) {
  console.log(`\n🔍 Analyzing request: "${request}"\n`);
  
  const result = await getGitHubCommands(request);
  
  console.log('📋 EXPLANATION:');
  console.log(`   ${result.explanation}\n`);
  
  if (result.warnings.length > 0) {
    console.log('⚠️  WARNINGS:');
    result.warnings.forEach(w => console.log(`   ⚠️  ${w}`));
    console.log();
  }
  
  if (result.requiresManualStep) {
    console.log('✋ MANUAL STEPS REQUIRED:');
    result.manualSteps.forEach((step, idx) => {
      console.log(`   ${idx + 1}. ${step}`);
    });
    console.log();
  }
  
  console.log('🔧 COMMANDS:');
  result.commands.forEach((cmd, idx) => {
    console.log(`   ${idx + 1}. ${cmd}`);
  });
  console.log();
  
  console.log(`🔒 Safety Level: ${result.safe ? '✅ Safe (non-destructive)' : '⚠️  Potentially destructive'}\n`);
  
  if (dryRun) {
    console.log('💡 DRY RUN MODE: Commands not executed');
    console.log('   To execute, call: executeGitHubCommands(request, false)\n');
  } else if (!result.safe) {
    console.log('❌ BLOCKED: Potentially destructive commands require manual review\n');
  } else {
    console.log('🚀 Would execute commands here (implementation needed)\n');
  }
  
  return result;
}

module.exports = {
  getGitHubCommands,
  executeGitHubCommands,
  githubCommandSchema
};
