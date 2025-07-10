export const MAX_ITEMS = 50;
export const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
export const PREVIEW_LENGTH = 100;
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'];
export const VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'];

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

export const ALLOWED_PATH_REGEX = /^[^<>:"|?*]+$/;
export const FTS_SPECIAL_CHARS = /[*"()-]/g;

export const RATE_LIMIT_WINDOW = 60 * 1000;
export const RATE_LIMIT_MAX_REQUESTS = 100;
export const RATE_LIMIT_MAX_FILE_OPS = 10;