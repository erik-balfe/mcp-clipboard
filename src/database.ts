import { Database } from 'bun:sqlite';
import { existsSync, mkdirSync, copyFileSync, unlinkSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { homedir } from 'os';
import { 
  MAX_ITEMS, 
  MAX_FILE_SIZE, 
  PREVIEW_LENGTH,
  IMAGE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  MIME_TYPES
} from './constants.js';
import { validateFilePath, sanitizeFtsQuery } from './security.js';

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

export class ClipboardDatabase {
  private db: Database;
  private dbPath: string;
  private dataDir: string;
  private cacheDir: string;

  constructor() {
    // Store database in user's home directory
    this.dataDir = join(homedir(), '.mcp-clipboard');
    this.cacheDir = join(this.dataDir, 'cache');
    
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
    
    this.dbPath = join(this.dataDir, 'clipboard.db');
    this.db = new Database(this.dbPath);
    this.initializeDatabase();
  }

  private initializeDatabase(): void {
    // Enable WAL mode for better concurrent access
    this.db.exec('PRAGMA journal_mode = WAL');
    
    // Create clipboard_items table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clipboard_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        content_type TEXT NOT NULL CHECK (content_type IN ('text', 'html', 'image', 'file', 'image_file', 'document_file', 'video_file')),
        preview TEXT NOT NULL,
        is_pinned BOOLEAN DEFAULT 0,
        is_private BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        cached_file_path TEXT,
        original_path TEXT,
        file_size INTEGER,
        mime_type TEXT
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_clipboard_created_at ON clipboard_items(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_clipboard_pinned ON clipboard_items(is_pinned);
      CREATE INDEX IF NOT EXISTS idx_clipboard_content_type ON clipboard_items(content_type);
    `);

    // Create FTS (Full Text Search) table for content search
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_fts USING fts5(
        content, preview,
        content='clipboard_items',
        content_rowid='id'
      );
    `);

    // Create triggers to keep FTS table in sync
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS clipboard_fts_insert AFTER INSERT ON clipboard_items BEGIN
        INSERT INTO clipboard_fts(rowid, content, preview) VALUES (new.id, new.content, new.preview);
      END;
      
      CREATE TRIGGER IF NOT EXISTS clipboard_fts_delete AFTER DELETE ON clipboard_items BEGIN
        INSERT INTO clipboard_fts(clipboard_fts, rowid, content, preview) VALUES('delete', old.id, old.content, old.preview);
      END;
      
      CREATE TRIGGER IF NOT EXISTS clipboard_fts_update AFTER UPDATE ON clipboard_items BEGIN
        INSERT INTO clipboard_fts(clipboard_fts, rowid, content, preview) VALUES('delete', old.id, old.content, old.preview);
        INSERT INTO clipboard_fts(rowid, content, preview) VALUES (new.id, new.content, new.preview);
      END;
    `);
  }

  // Generate preview text
  private generatePreview(content: string, contentType: string, fileName?: string, fileSize?: number): string {
    if (contentType === 'image') return '[Image]';
    if (contentType === 'file') return '[File]';
    if (contentType === 'image_file') return `[Image: ${fileName}${fileSize ? `, ${this.formatFileSize(fileSize)}` : ''}]`;
    if (contentType === 'document_file') return `[Document: ${fileName}${fileSize ? `, ${this.formatFileSize(fileSize)}` : ''}]`;
    if (contentType === 'video_file') return `[Video: ${fileName}${fileSize ? `, ${this.formatFileSize(fileSize)}` : ''}]`;
    
    // Clean up content and create preview
    const cleaned = content.replace(/\s+/g, ' ').trim();
    return cleaned.length > PREVIEW_LENGTH ? cleaned.substring(0, PREVIEW_LENGTH) + '...' : cleaned;
  }

  // Format file size for display
  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }

  // Determine content type from file extension
  private getContentTypeFromFile(filePath: string): ClipboardItem['content_type'] {
    const ext = extname(filePath).toLowerCase();
    
    if (IMAGE_EXTENSIONS.includes(ext)) return 'image_file';
    if (VIDEO_EXTENSIONS.includes(ext)) return 'video_file';
    return 'document_file';
  }

  // Get MIME type from extension
  private getMimeType(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
  }

  // Add new clipboard item
  addItem(content: string, contentType: ClipboardItem['content_type'] = 'text', isPrivate: boolean = false): ClipboardItem {
    const preview = this.generatePreview(content, contentType);
    
    const stmt = this.db.prepare(`
      INSERT INTO clipboard_items (content, content_type, preview, is_private)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = stmt.run(content, contentType, preview, isPrivate ? 1 : 0);
    
    // If private mode, clear previous private items
    if (isPrivate) {
      this.clearPrivateItems(result.lastInsertRowid as number);
    }
    
    // Maintain max items (excluding pinned)
    this.maintainMaxItems();
    
    return this.getItem(result.lastInsertRowid as number)!;
  }

  // Add file to clipboard with caching
  addFile(filePath: string, isPrivate: boolean = false): ClipboardItem {
    // Validate and normalize the file path to prevent path traversal
    let validatedPath: string;
    try {
      validatedPath = validateFilePath(filePath);
    } catch (error) {
      throw new Error(`Invalid file path: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate file exists
    if (!existsSync(validatedPath)) {
      throw new Error(`File not found: ${validatedPath}`);
    }

    const stats = statSync(validatedPath);
    const fileSize = stats.size;
    
    // Check file size limit
    if (fileSize > MAX_FILE_SIZE) {
      throw new Error(`File too large: ${this.formatFileSize(fileSize)} (max: ${this.formatFileSize(MAX_FILE_SIZE)})`);
    }

    const fileName = basename(validatedPath);
    const contentType = this.getContentTypeFromFile(validatedPath);
    const mimeType = this.getMimeType(validatedPath);
    
    // Generate unique cache filename
    const ext = extname(validatedPath);
    const cacheFileName = `item_${Date.now()}_${fileName}`;
    const cachedPath = join(this.cacheDir, cacheFileName);
    
    // Copy file to cache
    copyFileSync(validatedPath, cachedPath);
    
    const preview = this.generatePreview('', contentType, fileName, fileSize);
    
    const stmt = this.db.prepare(`
      INSERT INTO clipboard_items (
        content, content_type, preview, is_private,
        cached_file_path, original_path, file_size, mime_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run(
      validatedPath, // Store validated path as content
      contentType,
      preview,
      isPrivate ? 1 : 0,
      cachedPath,
      validatedPath,
      fileSize,
      mimeType
    );
    
    // If private mode, clear previous private items
    if (isPrivate) {
      this.clearPrivateItems(result.lastInsertRowid as number);
    }
    
    // Maintain max items (excluding pinned)
    this.maintainMaxItems();
    
    return this.getItem(result.lastInsertRowid as number)!;
  }

  // Get item by ID
  getItem(id: number): ClipboardItem | null {
    const stmt = this.db.prepare('SELECT * FROM clipboard_items WHERE id = ?');
    const row = stmt.get(id) as any;
    return row ? this.mapRowToItem(row) : null;
  }

  // Get all items (pinned first, then by creation date desc)
  getAllItems(limit: number = 30): ClipboardItem[] {
    const stmt = this.db.prepare(`
      SELECT * FROM clipboard_items 
      ORDER BY is_pinned DESC, created_at DESC 
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];
    return rows.map(row => this.mapRowToItem(row));
  }

  // Get the most recent item regardless of pin status
  getLatestItem(): ClipboardItem | null {
    const stmt = this.db.prepare(`
      SELECT * FROM clipboard_items 
      ORDER BY created_at DESC 
      LIMIT 1
    `);
    const row = stmt.get();
    return row ? this.mapRowToItem(row) : null;
  }

  // Search items using FTS
  searchItems(query: string, limit: number = 30): ClipboardItem[] {
    // Sanitize the query to prevent FTS injection
    const sanitizedQuery = sanitizeFtsQuery(query);
    
    if (!sanitizedQuery) {
      return []; // Return empty array for invalid queries
    }

    const stmt = this.db.prepare(`
      SELECT c.* FROM clipboard_items c
      JOIN clipboard_fts fts ON c.id = fts.rowid
      WHERE clipboard_fts MATCH ?
      ORDER BY c.is_pinned DESC, c.created_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(sanitizedQuery, limit) as any[];
    return rows.map(row => this.mapRowToItem(row));
  }

  // Pin/unpin item
  togglePin(id: number): boolean {
    const stmt = this.db.prepare('UPDATE clipboard_items SET is_pinned = NOT is_pinned WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // Delete specific item
  deleteItem(id: number): boolean {
    // First get the item to check for cached file
    const item = this.getItem(id);
    
    const stmt = this.db.prepare('DELETE FROM clipboard_items WHERE id = ?');
    const result = stmt.run(id);
    
    // Clean up cached file if it exists
    if (item?.cached_file_path && existsSync(item.cached_file_path)) {
      try {
        unlinkSync(item.cached_file_path);
      } catch (error) {
        // Ignore file deletion errors
      }
    }
    
    return result.changes > 0;
  }

  // Clear all items (except pinned)
  clearHistory(): number {
    const stmt = this.db.prepare('DELETE FROM clipboard_items WHERE is_pinned = 0');
    const result = stmt.run();
    return result.changes;
  }

  // Clear all items including pinned
  clearAll(): number {
    const stmt = this.db.prepare('DELETE FROM clipboard_items');
    const result = stmt.run();
    return result.changes;
  }

  // Clear only private items (except the current one)
  private clearPrivateItems(excludeId: number): void {
    const stmt = this.db.prepare('DELETE FROM clipboard_items WHERE is_private = 1 AND id != ?');
    stmt.run(excludeId);
  }

  // Maintain maximum non-pinned items
  private maintainMaxItems(): void {
    // Get items to delete (older than the MAX_ITEMS most recent non-pinned items)
    const itemsToDelete = this.db.prepare(`
      SELECT id, cached_file_path FROM clipboard_items 
      WHERE is_pinned = 0 
      AND id NOT IN (
        SELECT id FROM clipboard_items 
        WHERE is_pinned = 0 
        ORDER BY created_at DESC 
        LIMIT ?
      )
    `).all(MAX_ITEMS);
    
    // Clean up cached files for items being deleted
    for (const item of itemsToDelete) {
      if (item.cached_file_path && existsSync(item.cached_file_path)) {
        try {
          unlinkSync(item.cached_file_path);
        } catch (error) {
          // Ignore file deletion errors
        }
      }
    }
    
    // Delete the items from database
    const stmt = this.db.prepare(`
      DELETE FROM clipboard_items 
      WHERE is_pinned = 0 
      AND id NOT IN (
        SELECT id FROM clipboard_items 
        WHERE is_pinned = 0 
        ORDER BY created_at DESC 
        LIMIT ?
      )
    `);
    stmt.run(MAX_ITEMS);
  }

  // Map database row to ClipboardItem
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

  // Get database stats
  getStats(): { total: number; pinned: number; private: number } {
    const totalStmt = this.db.prepare('SELECT COUNT(*) as count FROM clipboard_items');
    const pinnedStmt = this.db.prepare('SELECT COUNT(*) as count FROM clipboard_items WHERE is_pinned = 1');
    const privateStmt = this.db.prepare('SELECT COUNT(*) as count FROM clipboard_items WHERE is_private = 1');
    
    return {
      total: (totalStmt.get() as any).count,
      pinned: (pinnedStmt.get() as any).count,
      private: (privateStmt.get() as any).count
    };
  }

  // Get cached file path for an item
  getCachedFilePath(id: number): string | null {
    const item = this.getItem(id);
    if (!item?.cached_file_path) return null;
    
    // Verify file still exists
    if (!existsSync(item.cached_file_path)) return null;
    
    return item.cached_file_path;
  }

  // Close database connection
  close(): void {
    this.db.close();
  }
}