import { resolve, isAbsolute, normalize } from 'path';
import { homedir } from 'os';
import { ALLOWED_PATH_REGEX, FTS_SPECIAL_CHARS } from './constants.js';

/**
 * Validates and normalizes a file path to prevent path traversal attacks
 * @param filePath The file path to validate
 * @param allowedBasePaths Array of allowed base directories (defaults to user home)
 * @returns The normalized absolute path
 * @throws Error if the path is invalid or attempts to escape allowed directories
 */
export function validateFilePath(filePath: string, allowedBasePaths?: string[]): string {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Invalid file path: path must be a non-empty string');
  }

  // Check for null bytes first
  if (filePath.includes('\0')) {
    throw new Error('Invalid file path: contains null bytes');
  }
  
  // Remove any potentially dangerous characters
  const cleanPath = filePath.trim();
  
  // Basic validation against potentially dangerous patterns
  if (!ALLOWED_PATH_REGEX.test(cleanPath)) {
    throw new Error('Invalid file path: contains forbidden characters');
  }

  // Handle tilde expansion manually
  let expandedPath = cleanPath;
  if (cleanPath.startsWith('~/')) {
    expandedPath = cleanPath.replace('~', homedir());
  }
  
  // Normalize and resolve to absolute path
  const absolutePath = isAbsolute(expandedPath) ? normalize(expandedPath) : resolve(expandedPath);
  
  // Default allowed paths: user's home directory and current working directory
  const basePaths = allowedBasePaths || [homedir(), process.cwd()];
  
  // Check if the resolved path is within allowed directories
  const isAllowed = basePaths.some(basePath => {
    const normalizedBase = normalize(basePath);
    return absolutePath.startsWith(normalizedBase);
  });

  if (!isAllowed) {
    throw new Error('Access denied: file path is outside allowed directories');
  }

  // Additional checks for suspicious patterns
  const suspiciousPatterns = [
    /\/\.\./,  // Parent directory traversal
    /\/\./,    // Hidden files/directories (optional, uncomment if needed)
    /\.\.$/,   // Ends with ..
    /^\./      // Starts with .
  ];

  // Only check for parent directory traversal, allow hidden files
  if (suspiciousPatterns[0].test(absolutePath) || suspiciousPatterns[2].test(absolutePath)) {
    throw new Error('Invalid file path: contains suspicious patterns');
  }

  return absolutePath;
}

/**
 * Sanitizes a search query for FTS5 to prevent injection
 * @param query The search query to sanitize
 * @returns Sanitized query safe for FTS5 MATCH
 */
export function sanitizeFtsQuery(query: string): string {
  if (!query || typeof query !== 'string') {
    return '';
  }

  // Escape special FTS5 characters
  // FTS5 special chars: * " ( ) -
  let sanitized = query.replace(FTS_SPECIAL_CHARS, (char) => {
    // Escape by wrapping in quotes
    return `"${char}"`;
  });

  // Remove any excessive whitespace
  sanitized = sanitized.trim().replace(/\s+/g, ' ');

  // If the query is too short, don't search
  if (sanitized.length < 2) {
    return '';
  }

  // Wrap the entire query in quotes to search for exact phrase
  // This prevents most FTS5 syntax injection
  return `"${sanitized}"`;
}

/**
 * Rate limiter for preventing DoS attacks
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private fileOps: Map<string, number[]> = new Map();

  constructor(
    private windowMs: number,
    private maxRequests: number,
    private maxFileOps: number
  ) {}

  /**
   * Check if a request is allowed
   * @param identifier Unique identifier (could be session ID, user ID, etc.)
   * @param isFileOp Whether this is a file operation
   * @returns true if allowed, false if rate limited
   */
  checkLimit(identifier: string, isFileOp: boolean = false): boolean {
    const now = Date.now();
    const map = isFileOp ? this.fileOps : this.requests;
    const limit = isFileOp ? this.maxFileOps : this.maxRequests;

    // Get or create timestamp array for this identifier
    let timestamps = map.get(identifier) || [];
    
    // Remove old timestamps outside the window
    timestamps = timestamps.filter(ts => now - ts < this.windowMs);
    
    // Check if limit exceeded
    if (timestamps.length >= limit) {
      return false;
    }

    // Add current timestamp and update map
    timestamps.push(now);
    map.set(identifier, timestamps);
    
    return true;
  }

  /**
   * Clean up old entries to prevent memory leaks
   */
  cleanup(): void {
    const now = Date.now();
    
    for (const [identifier, timestamps] of this.requests) {
      const filtered = timestamps.filter(ts => now - ts < this.windowMs);
      if (filtered.length === 0) {
        this.requests.delete(identifier);
      } else {
        this.requests.set(identifier, filtered);
      }
    }

    for (const [identifier, timestamps] of this.fileOps) {
      const filtered = timestamps.filter(ts => now - ts < this.windowMs);
      if (filtered.length === 0) {
        this.fileOps.delete(identifier);
      } else {
        this.fileOps.set(identifier, filtered);
      }
    }
  }
}