/**
 * Language Implementation Agent
 * 
 * Uses convergence to:
 * 1. Design a programming language
 * 2. Generate Python implementation (lexer, parser, interpreter)
 * 3. Set up Python venv
 * 4. Execute programs in the new language
 */

const { converge } = require('./convergenceEngine.js');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');

/**
 * Design and implement a new programming language
 */
async function createLanguage(specification, options = {}) {
  console.log('🚀 Creating new programming language...\n');
  
  const langName = options.name || 'CustomLang';
  const langDir = options.outputDir || `./languages/${langName.toLowerCase()}`;
  
  // Phase 1: Design the language
  console.log('📐 Phase 1: Language Design via Convergence');
  console.log('='.repeat(60));
  
  const designResult = await converge(
    `Design a complete programming language specification:
    
    Requirements: ${specification}
    
    Provide:
    1. Syntax specification (tokens, grammar)
    2. Semantic rules (type system, scoping)
    3. Core features (what makes it unique)
    4. Example programs (at least 3)
    5. Implementation strategy (how to build it)
    
    Be detailed and implementable.`,
    {
      agentA: "Language Designer - Focus on elegant syntax, usability, and unique features",
      agentB: "Implementation Architect - Focus on implementability, performance, and practical concerns",
      maxIterations: 5,
      temperature: 0.3
    }
  );
  
  console.log(`\n✓ Language designed (${designResult.iterations} iterations, ${designResult.convergenceScore}% convergence)\n`);
  
  // Phase 2: Generate Python implementation
  console.log('🔨 Phase 2: Generate Python Implementation');
  console.log('='.repeat(60));
  
  const implementationResult = await converge(
    `Generate a complete Python implementation for this language:
    
    ${designResult.finalResponse.response}
    
    Create:
    1. Lexer (tokenizer) - complete implementation
    2. Parser - builds AST
    3. Interpreter - executes AST
    4. REPL - interactive shell
    5. File runner - execute .${langName.toLowerCase()} files
    
    Make it fully functional and well-documented.
    Use proper Python classes and error handling.`,
    {
      agentA: "Python Developer - Write clean, working code",
      agentB: "Compiler Expert - Ensure correctness and completeness",
      maxIterations: 5,
      temperature: 0.2
    }
  );
  
  console.log(`\n✓ Implementation generated (${implementationResult.iterations} iterations, ${implementationResult.convergenceScore}% convergence)\n`);
  
  // Phase 3: Create project structure
  console.log('📁 Phase 3: Creating Project Structure');
  console.log('='.repeat(60));
  
  await fs.mkdir(langDir, { recursive: true });
  
  // Save language specification
  await fs.writeFile(
    path.join(langDir, 'LANGUAGE_SPEC.md'),
    designResult.finalResponse.response,
    'utf-8'
  );
  console.log(`  ✓ Saved language specification`);
  
  // Extract and save Python code
  const pythonCode = extractPythonCode(implementationResult.finalResponse.response);
  
  // If we have a combined implementation, split it into files intelligently
  if (pythonCode.all && (!pythonCode.lexer || !pythonCode.parser || !pythonCode.interpreter)) {
    console.log('  ℹ️  Creating combined implementation file');
    
    await fs.writeFile(
      path.join(langDir, 'language_impl.py'),
      pythonCode.all,
      'utf-8'
    );
    console.log(`  ✓ Saved language_impl.py`);
    
    // Create stub files that import from the main implementation
    await fs.writeFile(
      path.join(langDir, 'lexer.py'),
      `"""Lexer for ${langName}"""\nfrom language_impl import *\n`,
      'utf-8'
    );
    console.log(`  ✓ Saved lexer.py (imports from language_impl)`);
    
    await fs.writeFile(
      path.join(langDir, 'parser.py'),
      `"""Parser for ${langName}"""\nfrom language_impl import *\n`,
      'utf-8'
    );
    console.log(`  ✓ Saved parser.py (imports from language_impl)`);
    
    await fs.writeFile(
      path.join(langDir, 'interpreter.py'),
      `"""Interpreter for ${langName}"""\nfrom language_impl import *\n`,
      'utf-8'
    );
    console.log(`  ✓ Saved interpreter.py (imports from language_impl)`);
  } else {
    // Save separate files
    await fs.writeFile(
      path.join(langDir, 'lexer.py'),
      pythonCode.lexer || `"""Lexer for ${langName}"""\n\nclass Lexer:\n    def __init__(self, source):\n        self.source = source\n    \n    def tokenize(self):\n        return []\n`,
      'utf-8'
    );
    console.log(`  ✓ Saved lexer.py`);
    
    await fs.writeFile(
      path.join(langDir, 'parser.py'),
      pythonCode.parser || `"""Parser for ${langName}"""\n\nclass Parser:\n    def __init__(self, tokens):\n        self.tokens = tokens\n    \n    def parse(self):\n        return {}\n`,
      'utf-8'
    );
    console.log(`  ✓ Saved parser.py`);
    
    await fs.writeFile(
      path.join(langDir, 'interpreter.py'),
      pythonCode.interpreter || `"""Interpreter for ${langName}"""\n\nclass Interpreter:\n    def evaluate(self, ast):\n        return None\n`,
      'utf-8'
    );
    console.log(`  ✓ Saved interpreter.py`);
  }
  
  await fs.writeFile(
    path.join(langDir, 'main.py'),
    generateMainPy(langName),
    'utf-8'
  );
  console.log(`  ✓ Saved main.py (REPL & runner)`);
  
  // Create requirements.txt
  await fs.writeFile(
    path.join(langDir, 'requirements.txt'),
    '# Python dependencies\n',
    'utf-8'
  );
  console.log(`  ✓ Saved requirements.txt`);
  
  // Create example program
  const exampleCode = extractExampleCode(designResult.finalResponse.response, langName);
  const langExt = langName.toLowerCase().replace(/[^a-z0-9]/g, '');
  await fs.writeFile(
    path.join(langDir, `example.${langExt}`),
    exampleCode,
    'utf-8'
  );
  console.log(`  ✓ Saved example.${langExt}\n`);
  
  return {
    name: langName,
    directory: langDir,
    design: designResult,
    implementation: implementationResult,
    pythonFiles: {
      interpreter: path.join(langDir, 'interpreter.py'),
      lexer: path.join(langDir, 'lexer.py'),
      parser: path.join(langDir, 'parser.py'),
      main: path.join(langDir, 'main.py')
    }
  };
}

/**
 * Set up Python virtual environment for the language
 */
async function setupVenv(langDir) {
  console.log('🐍 Phase 4: Setting Up Python Environment');
  console.log('='.repeat(60));
  
  const venvPath = 'venv';  // Use relative path
  
  // Create venv
  console.log('  Creating virtual environment...');
  await runCommand('python', ['-m', 'venv', venvPath], langDir);
  console.log('  ✓ Virtual environment created');
  
  // Install dependencies
  const pipPath = process.platform === 'win32' 
    ? 'venv\\Scripts\\pip.exe'
    : 'venv/bin/pip';
  
  console.log('  Installing dependencies...');
  await runCommand(pipPath, ['install', '-r', 'requirements.txt'], langDir);
  console.log('  ✓ Dependencies installed\n');
  
  return 'venv';
}

/**
 * Run a program in the new language
 */
async function runProgram(langDir, programFile) {
  console.log('▶️  Phase 5: Running Program');
  console.log('='.repeat(60));
  
  const pythonPath = process.platform === 'win32'
    ? 'venv\\Scripts\\python.exe'
    : 'venv/bin/python';
  
  const mainPath = 'main.py';  // Use relative path
  
  console.log(`  Running: ${programFile}\n`);
  
  const output = await runCommand(pythonPath, [mainPath, path.basename(programFile)], langDir, {
    captureOutput: true
  });
  
  console.log(output);
  console.log('\n✓ Execution complete\n');
  
  return output;
}

/**
 * Helper: Run a command and return output
 */
function runCommand(command, args, cwd, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { 
      cwd,
      stdio: options.captureOutput ? 'pipe' : 'inherit'
    });
    
    let stdout = '';
    let stderr = '';
    
    if (options.captureOutput) {
      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      
      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });
    }
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}\n${stderr}`));
      }
    });
    
    child.on('error', reject);
  });
}

/**
 * Extract Python code from convergence response
 */
function extractPythonCode(response) {
  const code = {
    lexer: '',
    parser: '',
    interpreter: '',
    all: ''
  };
  
  // Try to extract code blocks - match both ```python and ``` with no language
  const codeBlockRegex = /```(?:python)?\s*\n([\s\S]*?)```/g;
  const matches = [...response.matchAll(codeBlockRegex)];
  
  if (matches.length === 0) {
    console.log('  ⚠️  No code blocks found in response');
    return code;
  }
  
  // Collect all code
  let allCode = matches.map(m => m[1]).join('\n\n');
  code.all = allCode;
  
  // Try to split by file markers or class definitions
  if (allCode.includes('# lexer.py') || allCode.includes('### Lexer')) {
    const parts = allCode.split(/(?=# (?:lexer|parser|interpreter|main)\.py)|(?=### (?:Lexer|Parser|Interpreter))/i);
    
    parts.forEach(part => {
      const lower = part.toLowerCase();
      if (lower.includes('lexer') || lower.includes('tokenize')) {
        code.lexer = part.trim();
      } else if (lower.includes('parser') && !lower.includes('import parser')) {
        code.parser = part.trim();
      } else if (lower.includes('interpreter') || lower.includes('evaluate')) {
        code.interpreter = part.trim();
      }
    });
  } else {
    // Single block - try to identify by content
    matches.forEach(match => {
      const content = match[1].trim();
      const lower = content.toLowerCase();
      
      if ((lower.includes('class lexer') || lower.includes('def tokenize')) && !code.lexer) {
        code.lexer = content;
      } else if ((lower.includes('class parser') || lower.includes('def parse')) && !code.parser && !lower.includes('import parser')) {
        code.parser = content;
      } else if ((lower.includes('class interpreter') || lower.includes('def evaluate') || lower.includes('def visit')) && !code.interpreter) {
        code.interpreter = content;
      }
    });
  }
  
  // If we couldn't separate them, put all in interpreter as fallback
  if (!code.lexer && !code.parser && !code.interpreter && code.all) {
    console.log('  ℹ️  Could not separate components, creating single module');
    code.interpreter = code.all;
  }
  
  return code;
}

/**
 * Extract example code from design
 */
function extractExampleCode(response, langName = 'program') {
  // Look for example programs in the design
  const exampleMatch = response.match(/###?\s*Example\s*\d*:?\s*[^\n]*\n```[\w]*\n([\s\S]*?)```/i);
  
  if (exampleMatch) {
    return exampleMatch[1].trim();
  }
  
  // Try to find any code block that looks like an example
  const codeBlocks = response.match(/```(?!ebnf|bnf)[\w]*\n([\s\S]*?)```/gi) || [];
  
  for (const block of codeBlocks) {
    const content = block.replace(/```[\w]*\n|```/g, '').trim();
    // If it's short and has common keywords, likely an example
    if (content.length < 500 && (content.includes('let ') || content.includes('print'))) {
      return content;
    }
  }
  
  return `# Example ${langName} program
let x = 10;
let y = 20;
let sum = x + y;
print(sum);
`;
}

/**
 * Generate main.py for REPL and file execution
 */
function generateMainPy(langName) {
  return `#!/usr/bin/env python3
"""
${langName} Language Interpreter
Main entry point for REPL and file execution
"""

import sys
from lexer import Lexer
from parser import Parser
from interpreter import Interpreter

def run_file(filename):
    """Execute a ${langName} program file"""
    try:
        with open(filename, 'r') as f:
            source = f.read()
        
        lexer = Lexer(source)
        tokens = lexer.tokenize()
        
        parser = Parser(tokens)
        ast = parser.parse()
        
        interpreter = Interpreter()
        result = interpreter.evaluate(ast)
        
        return result
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return None

def repl():
    """Interactive REPL"""
    print(f"${langName} Interactive Shell")
    print("Type 'exit' to quit")
    print()
    
    interpreter = Interpreter()
    
    while True:
        try:
            line = input(">>> ")
            if line.strip() in ('exit', 'quit'):
                break
            
            lexer = Lexer(line)
            tokens = lexer.tokenize()
            
            parser = Parser(tokens)
            ast = parser.parse()
            
            result = interpreter.evaluate(ast)
            if result is not None:
                print(result)
        
        except KeyboardInterrupt:
            print("\\nExiting...")
            break
        except Exception as e:
            print(f"Error: {e}")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        # Run file
        run_file(sys.argv[1])
    else:
        # Start REPL
        repl()
`;
}

/**
 * Complete workflow: Design → Implement → Setup → Run
 */
async function createAndRunLanguage(specification, options = {}) {
  try {
    // Create the language
    const language = await createLanguage(specification, options);
    
    // Setup Python environment
    await setupVenv(language.directory);
    
    // Run example program
    const exampleFile = path.join(language.directory, `example.${language.name.toLowerCase()}`);
    await runProgram(language.directory, exampleFile);
    
    console.log('='.repeat(60));
    console.log('🎉 Language Implementation Complete!');
    console.log('='.repeat(60));
    console.log(`Name: ${language.name}`);
    console.log(`Location: ${language.directory}`);
    console.log(`\nTo use:`);
    console.log(`  cd ${language.directory}`);
    console.log(`  venv/Scripts/python main.py              # Windows REPL`);
    console.log(`  venv/bin/python main.py                  # Unix REPL`);
    console.log(`  venv/Scripts/python main.py program.${language.name.toLowerCase()}  # Run file`);
    console.log();
    
    return language;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  }
}

module.exports = {
  createLanguage,
  setupVenv,
  runProgram,
  createAndRunLanguage
};
