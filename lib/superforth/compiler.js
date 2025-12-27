// Super-Forth strict compiler: static stack-effect analyzer
// Supported words: dup, drop, swap, over, +, -, *, /, >, <, <=, >=, =, !=, min, max, clamp, and, or, not, numbers, if ... else ... then
// Types: int, bool

// Custom error class for compile errors
export class CompileError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CompileError';
  }
}

// Function to clone the current stack
function cloneStack(stack) {
  return stack.slice();
}

// Function to convert the stack to a signature
function stackToSig(stack) {
  return '(' + stack.join(' ') + ')';
}

// Function to check if the stack has the required depth
function expectDepth(stack, n, word) {
  if (stack.length < n) {
    throw new CompileError(`Stack underflow at '${word}': need ${n}, have ${stack.length}`);
  }
}

// Function to check if the stack has the required types
function expectTypes(stack, types, word) {
  for (let i = 0; i < types.length; i++) {
    const want = types[types.length - 1 - i]; // check from top downward
    const have = stack[stack.length - 1 - i];
    if (have !== want) {
      throw new CompileError(`Type mismatch at '${word}': expected ${types.join(' ')}, have ${stack.join(' ')}`);
    }
  }
}

// Function to analyze the tokens and perform operations on the stack
function analyzeTokens(tokens, initialStack) {
  const stack = cloneStack(initialStack);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'dup') {
      expectDepth(stack, 1, t);
      stack.push(stack[stack.length - 1]);
    } else if (t === 'drop') {
      expectDepth(stack, 1, t);
      stack.pop();
    } else if (t === 'swap') {
      expectDepth(stack, 2, t);
      const a = stack.length - 1;
      const b = stack.length - 2;
      const tmp = stack[a];
      stack[a] = stack[b];
      stack[b] = tmp;
    } else if (t === 'over') {
      expectDepth(stack, 2, t);
      stack.push(stack[stack.length - 2]);
    } else if (t === '+') {
      expectDepth(stack, 2, t);
      expectTypes(stack, ['int', 'int'], t);
      stack.pop();
      stack.pop();
      stack.push('int');
    } else if (t === '-') {
      expectDepth(stack, 2, t);
      expectTypes(stack, ['int', 'int'], t);
      stack.pop();
      stack.pop();
      stack.push('int');
    } else if (t === '*') {
      expectDepth(stack, 2, t);
      expectTypes(stack, ['int', 'int'], t);
      stack.pop();
      stack.pop();
      stack.push('int');
    } else if (t === '/') {
      expectDepth(stack, 2, t);
      expectTypes(stack, ['int', 'int'], t);
      stack.pop();
      stack.pop();
      stack.push('int');
    } else if (t === '>') {
      expectDepth(stack, 2, t);
      expectTypes(stack, ['int', 'int'], t);
      stack.pop();
      stack.pop();
      stack.push('bool');
    } else if (t === '<') {
      expectDepth(stack, 2, t);
      expectTypes(stack, ['int', 'int'], t);
      stack.pop();
      stack.pop();
      stack.push('bool');
    } else if (t === '<=') {
      expectDepth(stack, 2, t);
      expectTypes(stack, ['int', 'int'], t);
      stack.pop();
      stack.pop();
      stack.push('bool');
    } else if (t === '>=') {
      expectDepth(stack, 2, t);
      expectTypes(stack, ['int', 'int'], t);
      stack.pop();
      stack.pop();
      stack.push('bool');
    } else if (t === '=') {
      expectDepth(stack, 2, t);
      expectTypes(stack, ['int', 'int'], t);
      stack.pop();
      stack.pop();
      stack.push('bool');
    } else if (t === '!=') {
      expectDepth(stack, 2, t);
      expectTypes(stack, ['int', 'int'], t);
      stack.pop();
      stack.pop();
      stack.push('bool');
    } else if (t === 'min') {
      expectDepth(stack, 2, t);
      expectTypes(stack, ['int', 'int'], t);
      stack.pop();
      stack.pop();
      stack.push('int');
    } else if (t === 'max') {
      expectDepth(stack, 2, t);
      expectTypes(stack, ['int', 'int'], t);
      stack.pop();
      stack.pop();
      stack.push('int');
    } else if (t === 'clamp') {
      expectDepth(stack, 3, t);
      expectTypes(stack, ['int', 'int', 'int'], t);
      stack.pop();
      stack.pop();
      stack.pop();
      stack.push('int');
    } else if (t === 'and') {
      expectDepth(stack, 2, t);
      expectTypes(stack, ['bool', 'bool'], t);
      stack.pop();
      stack.pop();
      stack.push('bool');
    } else if (t === 'or') {
      expectDepth(stack, 2, t);
      expectTypes(stack, ['bool', 'bool'], t);
      stack.pop();
      stack.pop();
      stack.push('bool');
    } else if (t === 'not') {
      expectDepth(stack, 1, t);
      expectTypes(stack, ['bool'], t);
      stack.pop();
      stack.push('bool');
    } else if (t === 'if') {
      // parse: if <true-branch> [else <false-branch>] then
      let depth = 1;
      let j = i + 1;
      const trueBranch = [];
      const falseBranch = [];
      let inTrue = true;
      for (; j < tokens.length; j++) {
        const tk = tokens[j];
        if (tk === 'if') depth++;
        if (tk === 'then') {
          depth--;
          if (depth === 0) break;
        }
        if (tk === 'else' && depth === 1) {
          inTrue = false;
          continue;
        }
        if (inTrue) trueBranch.push(tk); else falseBranch.push(tk);
      }
      if (depth !== 0) {
        throw new CompileError("Missing 'then' for 'if'");
      }
      // consume predicate
      expectDepth(stack, 1, 'if');
      expectTypes(stack, ['bool'], 'if');
      stack.pop();
      // analyze branches
      const before = cloneStack(stack);
      const afterTrue = analyzeTokens(trueBranch, before);
      const afterFalse = falseBranch.length ? analyzeTokens(falseBranch, cloneStack(before)) : before;
      // branches must match exactly
      const aSig = stackToSig(afterTrue);
      const bSig = stackToSig(afterFalse);
      if (aSig !== bSig) {
        throw new CompileError(`Stack effect mismatch in conditional: true-branch leaves ${aSig}, false-branch leaves ${bSig}`);
      }
      // set stack to post-conditional
      stack.length = 0;
      Array.prototype.push.apply(stack, afterTrue);
      // advance i to after 'then'
      i = j;
    } else if (/^-?\d+$/.test(t)) {
      // integer literal
      stack.push('int');
    } else if (t.trim() === '') {
      // skip
    } else {
      throw new CompileError(`Unknown word '${t}'`);
    }
  }
  return stack;
}

// Function to compile the source code
export function compile(source, signature = { in: ['int', 'int'], out: ['int'] }) {
  const tokens = source
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  const initial = signature.in.slice();
  const finalStack = analyzeTokens(tokens, initial);
  const wantOut = signature.out.join(' ');
  const haveOut = finalStack.join(' ');
  if (wantOut !== haveOut) {
    throw new CompileError(`Final stack effect mismatch: expected (${wantOut}), got (${haveOut})`);
  }
  return { ok: true, finalStack };
}

// Function to try compiling the source code and catch any errors
export function tryCompile(source, signature) {
  try {
    const res = compile(source, signature);
    return { ok: true, result: res };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}