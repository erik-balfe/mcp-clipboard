// Configuration constants for MCP Clipboard Manager

// Storage limits
export const MAX_ITEMS = 50; // Maximum number of non-pinned items
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB max file size
export const PREVIEW_LENGTH = 100; // Characters to show in preview

// File type classifications
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
export const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'];

// MIME type mappings
export const MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.ts': 'application/typescript'
};

// Security constraints
export const ALLOWED_PATH_REGEX = /^[^<>:"|?*]+$/; // Basic path validation
export const FTS_SPECIAL_CHARS = /[*"()-]/g; // FTS5 special characters to escape

// Rate limiting
export const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
export const RATE_LIMIT_MAX_REQUESTS = 100; // Max requests per window
export const RATE_LIMIT_MAX_FILE_OPS = 10; // Max file operations per window