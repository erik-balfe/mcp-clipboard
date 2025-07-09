// Basic security tests for MCP Clipboard Manager
import { validateFilePath, sanitizeFtsQuery, RateLimiter } from './security.js';
import { RATE_LIMIT_WINDOW, RATE_LIMIT_MAX_REQUESTS } from './constants.js';

// Path validation tests
console.log('=== Path Validation Tests ===');

try {
  // Should pass - normal file in home directory
  const validPath = validateFilePath('~/Documents/test.txt');
  console.log('✅ Valid path accepted:', validPath);
} catch (error) {
  console.log('❌ Valid path rejected:', error.message);
}

try {
  // Should fail - path traversal attempt
  validateFilePath('../../../etc/passwd');
  console.log('❌ Path traversal attack succeeded (BAD!)');
} catch (error) {
  console.log('✅ Path traversal blocked:', error.message);
}

try {
  // Should fail - null byte injection
  validateFilePath('test.txt\0malicious');
  console.log('❌ Null byte injection succeeded (BAD!)');
} catch (error) {
  console.log('✅ Null byte injection blocked:', error.message);
}

// FTS query sanitization tests
console.log('\n=== FTS Query Sanitization Tests ===');

// Normal query
const normal = sanitizeFtsQuery('hello world');
console.log('Normal query:', normal);

// Malicious query with special chars
const malicious = sanitizeFtsQuery('test" OR 1=1 --');
console.log('Sanitized malicious query:', malicious);

// Empty/short query
const empty = sanitizeFtsQuery('a');
console.log('Short query result:', empty || '(empty)');

// Rate limiter tests
console.log('\n=== Rate Limiter Tests ===');

const limiter = new RateLimiter(1000, 3, 1); // 3 requests, 1 file op per second

console.log('Request 1:', limiter.checkLimit('test', false) ? 'ALLOWED' : 'BLOCKED');
console.log('Request 2:', limiter.checkLimit('test', false) ? 'ALLOWED' : 'BLOCKED');
console.log('Request 3:', limiter.checkLimit('test', false) ? 'ALLOWED' : 'BLOCKED');
console.log('Request 4:', limiter.checkLimit('test', false) ? 'ALLOWED' : 'BLOCKED'); // Should be blocked

console.log('File op 1:', limiter.checkLimit('test', true) ? 'ALLOWED' : 'BLOCKED');
console.log('File op 2:', limiter.checkLimit('test', true) ? 'ALLOWED' : 'BLOCKED'); // Should be blocked

console.log('\n✅ Security tests completed');