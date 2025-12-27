import { verifySignature } from '../signResponse.js';

/**
 * Verify a signed API response
 * @param {object} requestData - The original request data
 * @param {object} responseData - The response data (without signature field)
 * @param {object} signature - The signature object from response
 * @returns {boolean} True if signature is valid
 */
export function verifyApiResponse(requestData, responseData, signature) {
  if (!signature || !signature.signature || !signature.publicKey) {
    throw new Error('Invalid signature object');
  }
  
  // Remove signature from response for verification
  const { signature: _, ...dataToVerify } = responseData;
  
  return verifySignature(requestData, dataToVerify, signature.signature, signature.publicKey);
}

/**
 * Verify a response from the SchemaICU API
 * @param {object} fullResponse - The complete response object including signature
 * @param {object} originalRequest - The original request sent to the API
 * @returns {object} Verification result with status and details
 */
export function verifySchemaICUResponse(fullResponse, originalRequest) {
  try {
    if (!fullResponse.signature) {
      return {
        valid: false,
        error: 'Response does not contain a signature'
      };
    }
    
    const { signature, ...responseData } = fullResponse;
    
    const isValid = verifySignature(originalRequest, responseData, signature.signature, signature.publicKey);
    
    return {
      valid: isValid,
      hash: signature.hash,
      publicKey: signature.publicKey,
      signedAt: signature.signedAt,
      verified: isValid
    };
  } catch (error) {
    return {
      valid: false,
      error: error.message
    };
  }
}

// Example usage
async function example() {
  // Simulate an API response
  const request = {
    method: 'POST',
    path: '/api/query',
    body: { query: 'Create a function' }
  };
  
  const response = {
    success: true,
    data: { response: 'Here is a function...', code: 'function test() {}' },
    signature: {
      hash: 'abc123...',
      signature: 'signature_string',
      publicKey: process.env.PUBLIC_KEY || '03657602c4a3d56d97b3e1e754582f193c3780ae724e57318291930716a3bbbcd0',
      signedAt: new Date().toISOString()
    }
  };
  
  const verification = verifySchemaICUResponse(response, request);
  console.log('Verification Result:', verification);
}

// Uncomment to run example
// example();

export default { verifyApiResponse, verifySchemaICUResponse, verifyInstantAIResponse: verifySchemaICUResponse };
