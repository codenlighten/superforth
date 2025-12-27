/**
 * Terminal Command Agent
 * 
 * Generates safe, cross-platform terminal commands from natural language
 */

const { queryOpenAI } = require('./openaiWrapperCJS.js');
const os = require('os');

// Enhanced terminal command schema
const terminalCommandSchema = {
  type: "object",
  properties: {
    explanation: {
      type: "string",
      description: "Clear explanation of what these commands accomplish"
    },
    commands: {
      type: "array",
      description: "Array of terminal commands to execute in order",
      items: {
        type: "object",
        properties: {
          command: { 
            type: "string",
            description: "The actual command to run"
          },
          description: {
            type: "string",
            description: "What this specific command does"
          },
          platform: {
            type: "string",
            description: "Platform compatibility: 'all', 'windows', 'unix', 'linux', 'macos'"
          }
        },
        required: ["command", "description", "platform"],
        additionalProperties: false
      }
    },
    warnings: {
      type: "array",
      description: "Important warnings about these commands",
      items: { type: "string" }
    },
    requiresElevated: {
      type: "boolean",
      description: "Whether these commands require admin/sudo privileges"
    },
    destructive: {
      type: "boolean",
      description: "Whether these commands modify or delete data"
    },
    safe: {
      type: "boolean",
      description: "Whether safe to run automatically (read-only, non-destructive)"
    },
    estimatedTime: {
      type: "string",
      description: "Estimated execution time (e.g., 'instant', '1-5 seconds', '1-2 minutes')"
    },
    alternatives: {
      type: "array",
      description: "Alternative ways to accomplish the same goal",
      items: { type: "string" }
    }
  },
  required: ["explanation", "commands", "warnings", "requiresElevated", "destructive", "safe", "estimatedTime", "alternatives"],
  additionalProperties: false
};

/**
 * Get system information for context
 */
function getSystemContext() {
  return {
    platform: process.platform,
    arch: process.arch,
    shell: process.env.SHELL || process.env.ComSpec || 'unknown',
    homeDir: os.homedir(),
    cwd: process.cwd(),
    userName: os.userInfo().username
  };
}

/**
 * Query for terminal commands
 * @param {string} request - Natural language description of what you want to do
 * @param {object} options - Optional configuration
 * @returns {Promise<object>} Terminal command response
 */
async function getTerminalCommands(request, options = {}) {
  const systemContext = getSystemContext();
  
  const prompt = `Generate terminal/shell commands for this request: ${request}

System Context:
- Platform: ${systemContext.platform} (${systemContext.arch})
- Shell: ${systemContext.shell}
- Current Directory: ${systemContext.cwd}

Requirements:
- Provide cross-platform commands when possible
- If platform-specific, indicate which platform
- Warn about destructive operations
- Suggest safer alternatives when available
- Consider Windows PowerShell, cmd, and Unix bash/zsh

Be specific and executable. Include flags and options.`;

  return queryOpenAI(prompt, {
    ...options,
    context: systemContext,
    schema: terminalCommandSchema,
    temperature: 0.1  // Very low - we want precise commands
  });
}

/**
 * Filter commands by platform
 */
function filterByPlatform(commands) {
  const currentPlatform = process.platform;
  
  return commands.filter(cmd => {
    if (cmd.platform === 'all') return true;
    if (cmd.platform === 'windows' && currentPlatform === 'win32') return true;
    if (cmd.platform === 'unix' && (currentPlatform === 'darwin' || currentPlatform === 'linux')) return true;
    if (cmd.platform === 'linux' && currentPlatform === 'linux') return true;
    if (cmd.platform === 'macos' && currentPlatform === 'darwin') return true;
    return false;
  });
}

/**
 * Execute terminal commands with safety checks
 * @param {string} request - What you want to do
 * @param {boolean} dryRun - If true, only show commands without executing
 * @returns {Promise<object>} Result with commands and execution status
 */
async function executeTerminalCommands(request, dryRun = true) {
  console.log(`\n🔍 Analyzing request: "${request}"\n`);
  
  const result = await getTerminalCommands(request);
  const systemContext = getSystemContext();
  
  console.log('📋 EXPLANATION:');
  console.log(`   ${result.explanation}\n`);
  
  console.log('💻 SYSTEM:');
  console.log(`   Platform: ${systemContext.platform}`);
  console.log(`   Shell: ${systemContext.shell}`);
  console.log(`   Directory: ${systemContext.cwd}\n`);
  
  if (result.warnings.length > 0) {
    console.log('⚠️  WARNINGS:');
    result.warnings.forEach(w => console.log(`   ⚠️  ${w}`));
    console.log();
  }
  
  const compatibleCommands = filterByPlatform(result.commands);
  
  console.log(`🔧 COMMANDS (${compatibleCommands.length} compatible with your system):`);
  compatibleCommands.forEach((cmd, idx) => {
    console.log(`   ${idx + 1}. ${cmd.command}`);
    console.log(`      → ${cmd.description}`);
    console.log(`      Platform: ${cmd.platform}`);
  });
  console.log();
  
  if (result.alternatives.length > 0) {
    console.log('💡 ALTERNATIVES:');
    result.alternatives.forEach((alt, idx) => {
      console.log(`   ${idx + 1}. ${alt}`);
    });
    console.log();
  }
  
  console.log(`⏱️  Estimated Time: ${result.estimatedTime}`);
  console.log(`🔐 Requires Admin: ${result.requiresElevated ? '⚠️  Yes' : '✅ No'}`);
  console.log(`💥 Destructive: ${result.destructive ? '⚠️  Yes' : '✅ No'}`);
  console.log(`✅ Safe: ${result.safe ? '✅ Yes (auto-runnable)' : '⚠️  No (requires review)'}\n`);
  
  if (dryRun) {
    console.log('💡 DRY RUN MODE: Commands not executed');
    console.log('   To execute, call: executeTerminalCommands(request, false)\n');
  } else if (!result.safe) {
    console.log('❌ BLOCKED: Potentially destructive commands require manual review\n');
  } else if (result.requiresElevated) {
    console.log('❌ BLOCKED: Commands require admin privileges\n');
  } else {
    console.log('🚀 Would execute commands here (implementation needed)\n');
  }
  
  return {
    ...result,
    systemContext,
    compatibleCommands
  };
}

module.exports = {
  getTerminalCommands,
  executeTerminalCommands,
  terminalCommandSchema,
  getSystemContext
};
