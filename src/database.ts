import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { 
  MAX_ITEMS, 
  MAX_FILE_SIZE, 
  PREVIEW_LENGTH,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  MIME_TYPES
} from './constants.js';
import { validateFilePath, sanitizeFtsQuery } from './security.js';
import { PathResolverFactory, type PathResolver } from './path-resolver.js';

export interface ClipboardItem {
  id: number;
  content: string;
  content_type: 'text' | 'html' | 'image' | 'file' | 'image_file' | 'document_file' | 'video_file';
  preview: string;
  is_pinned: boolean;
  is_private: boolean;
  created_at: string;
  updated_at: string;
  // File-specific fields
  cached_file_path?: string;
  original_path?: string;
  file_size?: number;
  mime_type?: string;
}

export interface ClipboardItemInsert extends Omit<ClipboardItem, 'id' | 'created_at' | 'updated_at'> {}

/**
 * ClipboardDatabase handles persistent storage of clipboard items.
 * 
 * Responsibilities:
 * - Database operations (CRUD)
 * - SQLite database management
 * - Cache file management
 * 
 * Note: Path resolution is handled by injected PathResolver service
 */
export class ClipboardDatabase {
  private db: Database;
  private dbPath: string;
  private dataDir: string;
  private cacheDir: string;
  private pathResolver: PathResolver;

  constructor(pathResolver?: PathResolver) {
    this.pathResolver = pathResolver || PathResolverFactory.create();
    this.dataDir = this.pathResolver.getDataDirectory();
    this.cacheDir = join(this.dataDir, 'cache');
    
    this.initializeDirectories();
    
    this.dbPath = join(this.dataDir, 'clipboard.db');
    this.db = new Database(this.dbPath);
    this.initializeDatabase();
  }

  /**
   * Ensures required directories exist
   */
  private initializeDirectories(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
    
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Initializes the SQLite database with proper configuration
   */
  private initializeDatabase(): void {
    // Enable WAL mode for better concurrent access
    this.db.exec('PRAGMA journal_mode = WAL');
    this.db.exec('PRAGMA synchronous = NORMAL');
    this.db.exec('PRAGMA cache_size = 1000');
    this.db.exec('PRAGMA foreign_keys = ON');
    this.db.exec('PRAGMA temp_store = MEMORY');

    // Create table with all necessary fields
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clipboard_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        content_type TEXT NOT NULL DEFAULT 'text',
        preview TEXT NOT NULL,
        is_pinned INTEGER DEFAULT 0,
        is_private INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        cached_file_path TEXT,
        original_path TEXT,
        file_size INTEGER,
        mime_type TEXT
      )
    `);

    // Create FTS5 virtual table for full-text search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_search 
      USING fts5(content, preview, content=clipboard_items, content_rowid=id)
    `);

    // Create triggers to keep FTS table in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS clipboard_search_insert AFTER INSERT ON clipboard_items BEGIN
        INSERT INTO clipboard_search(rowid, content, preview) VALUES (new.id, new.content, new.preview);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS clipboard_search_delete AFTER DELETE ON clipboard_items BEGIN
        INSERT INTO clipboard_search(clipboard_search, rowid, content, preview) VALUES('delete', old.id, old.content, old.preview);
      END
    `);

    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS clipboard_search_update AFTER UPDATE ON clipboard_items BEGIN
        INSERT INTO clipboard_search(clipboard_search, rowid, content, preview) VALUES('delete', old.id, old.content, old.preview);
        INSERT INTO clipboard_search(rowid, content, preview) VALUES (new.id, new.content, new.preview);
      END
    `);

    // Clean up expired private items on startup
    this.cleanupExpiredPrivateItems();
    this.maintainItemLimit();
  }

  /**
   * Adds a text item to the clipboard
   */
  addTextItem(content: string, contentType: 'text' | 'html' = 'text', isPrivate: boolean = false): ClipboardItem {
    const preview = this.generatePreview(content, contentType);
    
    const stmt = this.db.prepare(`
      INSERT INTO clipboard_items (content, content_type, preview, is_private)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = stmt.run(content, contentType, preview, isPrivate ? 1 : 0);
    this.maintainItemLimit();
    
    return this.getItem(result.lastInsertRowid as number)!;
  }

  /**
   * Adds a file item to the clipboard with proper path resolution
   */
  addFileItem(filePath: string, isPrivate: boolean = false): ClipboardItem {
    // Validate the input path first
    let validatedPath: string;
    try {
      validatedPath = validateFilePath(filePath);
    } catch (error) {
      throw new Error(`Invalid file path: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Resolve file path using path resolver
    const resolvedPath = this.pathResolver.resolvePath(validatedPath);

    // Validate file exists at resolved path
    if (!existsSync(resolvedPath)) {
      throw new Error(`File not found: ${resolvedPath} (original: ${validatedPath})`);
    }

    const stats = statSync(resolvedPath);
    const fileSize = stats.size;
    
    // Check file size limit
    if (fileSize > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${this.formatFileSize(fileSize)} (max: ${this.formatFileSize(MAX_FILE_SIZE)})`);
    }

    const fileName = basename(resolvedPath);
    const contentType = this.getContentTypeFromFile(resolvedPath);
    const mimeType = this.getMimeType(resolvedPath);
    
    // Generate unique cache filename
    const ext = extname(resolvedPath);
    const cacheFileName = `item_${Date.now()}_${fileName}`;
    const cachedPath = join(this.cacheDir, cacheFileName);
    
    // Copy file to cache
    copyFileSync(resolvedPath, cachedPath);
    
    const preview = this.generatePreview('', contentType, fileName, fileSize);
    
    const stmt = this.db.prepare(`
      INSERT INTO clipboard_items (content, content_type, preview, is_private, cached_file_path, original_path, file_size, mime_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      validatedPath, // Store original path as content for user reference
      contentType,
      preview,
      isPrivate ? 1 : 0,
      cachedPath,
      validatedPath, // Store original path as original_path
      fileSize,
      mimeType
    );
    
    this.maintainItemLimit();
    
    return this.getItem(result.lastInsertRowid as number)!;
  }

  /**
   * Retrieves a specific item by ID
   */
  getItem(id: number): ClipboardItem | null {
    const stmt = this.db.prepare('SELECT * FROM clipboard_items WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) {
      return null;
    }
    
    return this.mapRowToItem(row);
  }

  /**
   * Lists clipboard items with pagination and filtering
   */
  listItems(limit: number = 10, includePrivate: boolean = false): ClipboardItem[] {
    const whereClause = includePrivate ? '' : 'WHERE is_private = 0';
    const stmt = this.db.prepare(`
      SELECT * FROM clipboard_items 
      ${whereClause}
      ORDER BY is_pinned DESC, created_at DESC 
      LIMIT ?
    `);
    
    const rows = stmt.all(limit) as any[];
    return rows.map(row => this.mapRowToItem(row));
  }

  /**
   * Searches clipboard items using full-text search
   */
  searchItems(query: string, limit: number = 10): ClipboardItem[] {
    const sanitizedQuery = sanitizeFtsQuery(query);
    
    if (!sanitizedQuery) {
      return [];
    }
    
    const stmt = this.db.prepare(`
      SELECT clipboard_items.* FROM clipboard_items
      JOIN clipboard_search ON clipboard_items.id = clipboard_search.rowid
      WHERE clipboard_search MATCH ? AND clipboard_items.is_private = 0
      ORDER BY clipboard_items.is_pinned DESC, clipboard_items.created_at DESC
      LIMIT ?
    `);
    
    const rows = stmt.all(sanitizedQuery, limit) as any[];
    return rows.map(row => this.mapRowToItem(row));
  }

  /**
   * Pins or unpins an item
   */
  pinItem(id: number, pinned: boolean = true): boolean {
    const stmt = this.db.prepare('UPDATE clipboard_items SET is_pinned = ? WHERE id = ?');
    const result = stmt.run(pinned ? 1 : 0, id);
    return result.changes > 0;
  }

  /**
   * Deletes a specific item
   */
  deleteItem(id: number): boolean {
    const item = this.getItem(id);
    if (!item) {
      return false;
    }
    
    // Clean up cached file if it exists
    if (item.cached_file_path && existsSync(item.cached_file_path)) {
      try {
        unlinkSync(item.cached_file_path);
      } catch (error) {
        console.warn(`Failed to delete cached file: ${item.cached_file_path}`);
      }
    }
    
    const stmt = this.db.prepare('DELETE FROM clipboard_items WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Clears all non-pinned items or all items
   */
  clearItems(clearAll: boolean = false): number {
    const items = this.db.prepare(
      clearAll ? 'SELECT * FROM clipboard_items' : 'SELECT * FROM clipboard_items WHERE is_pinned = 0'
    ).all() as any[];
    
    // Clean up cached files
    for (const item of items) {
      if (item.cached_file_path && existsSync(item.cached_file_path)) {
        try {
          unlinkSync(item.cached_file_path);
        } catch (error) {
          console.warn(`Failed to delete cached file: ${item.cached_file_path}`);
        }
      }
    }
    
    // Workaround for Bun SQLite bug: Use RETURNING to get accurate count
    const stmt = this.db.prepare(
      clearAll 
        ? 'DELETE FROM clipboard_items RETURNING id' 
        : 'DELETE FROM clipboard_items WHERE is_pinned = 0 RETURNING id'
    );
    const deletedRows = stmt.all();
    const actualChanges = deletedRows.length;
    
    // Reset auto-increment counter if clearing all items
    if (clearAll && actualChanges > 0) {
      this.db.exec('DELETE FROM sqlite_sequence WHERE name = "clipboard_items"');
    }
    
    return actualChanges;
  }

  /**
   * Gets usage statistics
   */
  getStats(): { total: number; pinned: number; files: number; cacheSize: string } {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM clipboard_items');
    const pinnedStmt = this.db.prepare('SELECT COUNT(*) as count FROM clipboard_items WHERE is_pinned = 1');
    const filesStmt = this.db.prepare('SELECT COUNT(*) as count FROM clipboard_items WHERE cached_file_path IS NOT NULL');
    const cacheSizeStmt = this.db.prepare('SELECT SUM(file_size) as size FROM clipboard_items WHERE file_size IS NOT NULL');
    
    const total = (totalStmt.get() as any).count;
    const pinned = (pinnedStmt.get() as any).count;
    const files = (filesStmt.get() as any).count;
    const cacheSize = (cacheSizeStmt.get() as any).size || 0;
    
    return {
      total,
      pinned,
      files,
      cacheSize: this.formatFileSize(cacheSize)
    };
  }


  /**
   * Closes the database connection
   */
  close(): void {
    this.db.close();
  }

  // Private helper methods

  private mapRowToItem(row: any): ClipboardItem {
    return {
      id: row.id,
      content: row.content,
      content_type: row.content_type,
      preview: row.preview,
      is_pinned: Boolean(row.is_pinned),
      is_private: Boolean(row.is_private),
      created_at: row.created_at,
      updated_at: row.updated_at,
      cached_file_path: row.cached_file_path,
      original_path: row.original_path,
      file_size: row.file_size,
      mime_type: row.mime_type
    };
  }

  private generatePreview(content: string, contentType: string, fileName?: string, fileSize?: number): string {
    if (contentType === 'text' || contentType === 'html') {
      return content.slice(0, PREVIEW_LENGTH) + (content.length > PREVIEW_LENGTH ? '...' : '');
    }
    
    if (fileName && fileSize !== undefined) {
      const size = this.formatFileSize(fileSize);
      return `📁 ${fileName} (${size})`;
    }
    
    return contentType;
  }

  private getContentTypeFromFile(filePath: string): ClipboardItem['content_type'] {
    const ext = extname(filePath).toLowerCase();
    
    if (IMAGE_EXTENSIONS.includes(ext)) {
      return 'image_file';
    }
    
    if (VIDEO_EXTENSIONS.includes(ext)) {
      return 'video_file';
    }
    
    return 'document_file';
  }

  private getMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)}${units[unitIndex]}`;
  }

  private cleanupExpiredPrivateItems(): void {
    // Delete private items older than 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const stmt = this.db.prepare('SELECT * FROM clipboard_items WHERE is_private = 1 AND created_at < ?');
    const expiredItems = stmt.all(oneHourAgo) as any[];
    
    for (const item of expiredItems) {
      this.deleteItem(item.id);
    }
  }

  private maintainItemLimit(): void {
    // Keep only the latest MAX_ITEMS non-pinned items
    const stmt = this.db.prepare(`
      SELECT id FROM clipboard_items 
      WHERE is_pinned = 0 
      ORDER BY created_at DESC 
      LIMIT -1 OFFSET ?
    `);
    
    const excessItems = stmt.all(MAX_ITEMS) as any[];
    
    for (const item of excessItems) {
      this.deleteItem(item.id);
    }
  }
}