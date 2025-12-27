/**
 * CommonJS wrapper for OpenAI with structured schemas
 * Provides more stable API calls than Schema.ICU SDK
 * 
 * Optimized defaults for structured outputs:
 * - Temperature: 0.2 (low variance for consistent structured responses)
 * - Max tokens: 1500 (prevents runaway responses)
 * - Model validation: Ensures compatibility with structured outputs
 */

const OpenAI = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Models that support structured outputs (as of Dec 2024)
const SUPPORTED_MODELS = [
  'gpt-4o',
  'gpt-4o-2024-08-06',
  'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18',
];

/**
 * Validate and normalize model name
 */
function validateModel(model, throwOnUnsupported = false) {
  if (!model) {
    throw new Error('Model name is required');
  }
  
  // Check if it's a supported model - be more precise
  const isSupported = SUPPORTED_MODELS.some(m => 
    model.startsWith(m) || model === m
  );
  
  if (!isSupported) {
    const errorMsg = 
      `Model "${model}" does not support structured outputs with json_schema. ` +
      `Supported models: ${SUPPORTED_MODELS.join(', ')}. ` +
      `See: https://platform.openai.com/docs/guides/structured-outputs`;
    
    if (throwOnUnsupported) {
      throw new Error(errorMsg);
    } else {
      console.warn(`⚠️  ${errorMsg}`);
    }
  }
  
  return model;
}

// Base agent response schema
const baseAgentResponseSchema = {
  type: "object",
  properties: {
    response: { type: "string" },
    includesCode: { type: "boolean" },
    code: { type: "string" },
    continue: { 
      type: "boolean", 
      description: "Whether this agent has more work to do and should be called again automatically" 
    },
    questionForUser: { 
      type: "boolean", 
      description: "Whether this agent has a follow-up question for the user" 
    },
    question: { 
      type: "string", 
      description: "The follow-up question for the user (only if questionForUser is true)" 
    },
    missingContext: {
      type: "array",
      description: "List of strings indicating what information is missing for an ideal response",
      items: { type: "string" }
    }
  },
  required: ["response", "includesCode", "code", "continue", "questionForUser", "question", "missingContext"],
  additionalProperties: false
};

// Code generator response schema  
const codeGeneratorResponseSchema = {
  type: "object",
  properties: {
    code: { 
      type: "string",
      description: "The generated code with proper formatting, comments, and documentation"
    },
    missingContext: {
      type: "array",
      items: { type: "string" },
      description: "List of missing information that would improve the generated code. Empty array if complete."
    },
    reasoning: {
      type: "string",
      description: "Explanation of design decisions, trade-offs, and implementation approach"
    },
    language: {
      type: "string",
      description: "Programming language of the generated code"
    },
    complexity: {
      type: "string",
      description: "Estimated time and space complexity of the generated code"
    }
  },
  required: ["code", "missingContext", "reasoning", "language", "complexity"],
  additionalProperties: false
};

/**
 * Query OpenAI with structured JSON schema response
 * @param {string} query - The user query/prompt
 * @param {object} options - Optional configuration
 * @param {object} options.context - Additional context object to include in the prompt
 * @param {object} options.schema - JSON schema for structured output
 * @param {string} options.model - Model to use (defaults to OPENAI_DEFAULT_MODEL from .env)
 * @param {number} options.temperature - Temperature setting (defaults to 0.2 for structured outputs)
 * @param {number} options.maxTokens - Maximum tokens in response (optional, no limit by default)
 * @param {number} options.maxRetries - Maximum number of retries on failure (default 3)
 * @returns {Promise<object>} Parsed JSON response matching the schema
 */
async function queryOpenAI(query, options = {}) {
  const {
    context = null,
    schema = baseAgentResponseSchema,
    model = process.env.OPENAI_DEFAULT_MODEL || 'gpt-4o-mini',
    temperature = options.temperature !== undefined ? options.temperature : 0.2,
    maxTokens = options.maxTokens,  // Optional - undefined by default (no limit)
    maxRetries = 3,
    skipModelValidation = false  // Allow skipping validation if needed
  } = options;
  
  // Validate model supports structured outputs (throws by default to prevent wasted API calls)
  const validatedModel = validateModel(model, !skipModelValidation);

  // Build the prompt with optional context
  let promptContent = query;
  if (context) {
    promptContent = `Context: ${JSON.stringify(context, null, 2)}\n\nQuery: ${query}`;
  }

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const apiParams = {
        model: validatedModel,
        temperature,
        messages: [
          {
            role: "user",
            content: promptContent
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "agent_response",
            strict: true,
            schema
          }
        }
      };
      
      // Only add max_tokens if explicitly specified
      if (maxTokens !== undefined) {
        apiParams.max_tokens = maxTokens;
      }
      
      const completion = await openai.chat.completions.create(apiParams);

      // Parse and return the JSON response
      const responseContent = completion.choices[0].message.content;
      
      // Check if response was cut off due to token limit
      const finishReason = completion.choices[0].finish_reason;
      if (finishReason === 'length') {
        throw new Error(
          `Response exceeded max_tokens (${maxTokens}). ` +
          `The model's output was truncated. Increase maxTokens or simplify your query.`
        );
      }
      
      try {
        return JSON.parse(responseContent);
      } catch (parseError) {
        // Better error message for JSON parse failures
        throw new Error(
          `Failed to parse model response as JSON. ` +
          `This usually means the response was cut off (finish_reason: ${finishReason}). ` +
          `Original error: ${parseError.message}`
        );
      }
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries) {
        console.error(`OpenAI API Error (attempt ${attempt}/${maxRetries}):`, error.message);
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  console.error(`OpenAI API Error (all ${maxRetries} attempts failed):`, lastError.message);
  throw lastError;
}

/**
 * Query OpenAI for code generation with retry logic
 * @param {string} query - The code generation prompt
 * @param {object} options - Optional configuration
 * @returns {Promise<object>} Response with code field
 */
async function queryCodeGeneration(query, options = {}) {
  return queryOpenAI(query, {
    ...options,
    schema: codeGeneratorResponseSchema,
    temperature: options.temperature !== undefined ? options.temperature : 0.3
    // No default maxTokens - let it run unlimited for code generation
  });
}

module.exports = {
  queryOpenAI,
  queryCodeGeneration,
  baseAgentResponseSchema,
  codeGeneratorResponseSchema
};
