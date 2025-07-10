import { describe, it, expect, beforeEach, afterEach, spyOn } from 'bun:test';
import { ClipboardDatabase } from './database.js';
import { PathResolver } from './path-resolver.js';
import { unlinkSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as security from './security.js';

// Mock PathResolver for testing
class MockPathResolver implements PathResolver {
  constructor(
    private dataDir: string,
    private resolvePathImpl: (path: string) => string = (path) => path
  ) {}

  resolvePath(inputPath: string): string {
    return this.resolvePathImpl(inputPath);
  }

  getDataDirectory(): string {
    return this.dataDir;
  }
}

describe('ClipboardDatabase', () => {
  let testDataDir: string;
  let testDb: ClipboardDatabase;
  let mockPathResolver: MockPathResolver;

  beforeEach(() => {
    // Mock security functions
    spyOn(security, 'validateFilePath').mockImplementation((path: string) => {
      if (!path) throw new Error('Path cannot be empty');
      return path;
    });
    
    spyOn(security, 'sanitizeFtsQuery').mockImplementation((query: string) => {
      if (!query.trim()) return '';
      return query.replace(/['"]/g, '""');
    });

    // Create unique temporary directory for testing to avoid conflicts
    testDataDir = join(tmpdir(), `clipboard-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    mockPathResolver = new MockPathResolver(testDataDir);
    testDb = new ClipboardDatabase(mockPathResolver);
    
    // Clean database before each test to ensure isolation
    testDb.clearItems(true);
  });

  afterEach(() => {
    // Clean up test database and directory
    testDb.close();
    if (existsSync(testDataDir)) {
      rmSync(testDataDir, { recursive: true, force: true });
    }
  });

  describe('Database Initialization', () => {
    it('creates data directory if it does not exist', () => {
      expect(existsSync(testDataDir)).toBe(true);
    });

    it('creates cache directory if it does not exist', () => {
      const cacheDir = join(testDataDir, 'cache');
      expect(existsSync(cacheDir)).toBe(true);
    });

    it('initializes database with proper tables', () => {
      // Test that we can perform basic operations
      const item = testDb.addTextItem('test content');
      expect(item.content).toBe('test content');
      expect(item.id).toBeGreaterThan(0);
    });
  });

  describe('Path Resolution Integration', () => {
    let testFile: string;
    let resolvedPath: string;

    beforeEach(() => {
      // Create a test file
      testFile = join(testDataDir, 'test-file.txt');
      resolvedPath = join(testDataDir, 'resolved-file.txt');
      writeFileSync(testFile, 'test file content');
      writeFileSync(resolvedPath, 'resolved file content');
    });

    it('uses path resolver for file operations', () => {
      const mockResolver = new MockPathResolver(
        testDataDir,
        (path) => path === testFile ? resolvedPath : path
      );
      const db = new ClipboardDatabase(mockResolver);

      const item = db.addFileItem(testFile);
      expect(item.content).toBe(testFile); // Original path stored as content
      expect(item.original_path).toBe(testFile);
      expect(item.cached_file_path).toContain('cache');

      db.close();
    });

    it('throws error when resolved file does not exist', () => {
      const mockResolver = new MockPathResolver(
        testDataDir,
        (path) => '/nonexistent/file.txt'
      );
      const db = new ClipboardDatabase(mockResolver);

      expect(() => db.addFileItem(testFile)).toThrow('File not found');

      db.close();
    });

    it('handles Docker path resolution correctly', () => {
      const hostPath = '/host/home/user/file.txt';
      const containerPath = '/host/home/user/file.txt';
      
      // Create the resolved file
      const actualTestFile = join(testDataDir, 'docker-test.txt');
      writeFileSync(actualTestFile, 'docker test content');

      const dockerResolver = new MockPathResolver(
        testDataDir,
        (path) => path === hostPath ? actualTestFile : path
      );
      const db = new ClipboardDatabase(dockerResolver);

      const item = db.addFileItem(hostPath);
      expect(item.content).toBe(hostPath);
      expect(item.original_path).toBe(hostPath);

      db.close();
    });
  });

  describe('Text Operations', () => {
    it('adds text items correctly', () => {
      const content = 'Hello, World!';
      const item = testDb.addTextItem(content);

      expect(item.content).toBe(content);
      expect(item.content_type).toBe('text');
      expect(item.preview).toBe(content);
      expect(item.is_pinned).toBe(false);
      expect(item.is_private).toBe(false);
    });

    it('adds HTML items correctly', () => {
      const content = '<p>Hello, <strong>World!</strong></p>';
      const item = testDb.addTextItem(content, 'html');

      expect(item.content).toBe(content);
      expect(item.content_type).toBe('html');
      expect(item.preview).toBe(content);
    });

    it('adds private items correctly', () => {
      const content = 'Secret content';
      const item = testDb.addTextItem(content, 'text', true);

      expect(item.is_private).toBe(true);
    });

    it('truncates long content for preview', () => {
      const longContent = 'A'.repeat(300);
      const item = testDb.addTextItem(longContent);

      expect(item.preview.length).toBeLessThan(longContent.length);
      expect(item.preview).toContain('...');
    });
  });

  describe('File Operations', () => {
    let testFile: string;

    beforeEach(() => {
      testFile = join(testDataDir, 'test.txt');
      writeFileSync(testFile, 'test content');
    });

    it('adds file items correctly', () => {
      const item = testDb.addFileItem(testFile);

      expect(item.content).toBe(testFile);
      expect(item.content_type).toBe('document_file');
      expect(item.cached_file_path).toContain('cache');
      expect(item.original_path).toBe(testFile);
      expect(item.file_size).toBeGreaterThan(0);
      expect(existsSync(item.cached_file_path!)).toBe(true);
    });

    it('determines correct content type for images', () => {
      const imageFile = join(testDataDir, 'test.png');
      writeFileSync(imageFile, 'fake image content');

      const item = testDb.addFileItem(imageFile);
      expect(item.content_type).toBe('image_file');
    });

    it('determines correct content type for videos', () => {
      const videoFile = join(testDataDir, 'test.mp4');
      writeFileSync(videoFile, 'fake video content');

      const item = testDb.addFileItem(videoFile);
      expect(item.content_type).toBe('video_file');
    });

    it('throws error for non-existent files', () => {
      const nonExistentFile = join(testDataDir, 'nonexistent.txt');
      
      expect(() => testDb.addFileItem(nonExistentFile)).toThrow('File not found');
    });

    it('throws error for files that are too large', () => {
      const largeFile = join(testDataDir, 'large.txt');
      const largeContent = 'x'.repeat(101 * 1024 * 1024); // > 100MB
      writeFileSync(largeFile, largeContent);

      expect(() => testDb.addFileItem(largeFile)).toThrow('File too large');
    });
  });

  describe('CRUD Operations', () => {
    it('retrieves items by ID', () => {
      const item = testDb.addTextItem('test content');
      const retrieved = testDb.getItem(item.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(item.id);
      expect(retrieved!.content).toBe('test content');
    });

    it('returns null for non-existent items', () => {
      const retrieved = testDb.getItem(99999);
      expect(retrieved).toBeNull();
    });

    it('lists items with pagination', () => {
      // Create fresh database for this test
      const freshDataDir = join(tmpdir(), `clipboard-pagination-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      const freshResolver = new MockPathResolver(freshDataDir);
      const freshDb = new ClipboardDatabase(freshResolver);
      
      const item1 = freshDb.addTextItem('item 1');
      const item2 = freshDb.addTextItem('item 2');
      const item3 = freshDb.addTextItem('item 3');

      // Test pagination works correctly
      const items = freshDb.listItems(2);
      expect(items.length).toBe(2);
      
      // Get all items to verify total count  
      const allItems = freshDb.listItems(10);
      expect(allItems.length).toBe(3);
      
      freshDb.close();
    });

    it('excludes private items by default', () => {
      testDb.addTextItem('public item');
      testDb.addTextItem('private item', 'text', true);

      const items = testDb.listItems(10, false);
      expect(items.length).toBe(1);
      expect(items[0].content).toBe('public item');
    });

    it('includes private items when requested', () => {
      testDb.addTextItem('public item');
      testDb.addTextItem('private item', 'text', true);

      const items = testDb.listItems(10, true);
      expect(items.length).toBe(2);
    });
  });

  describe('Search Operations', () => {
    beforeEach(() => {
      testDb.addTextItem('The quick brown fox');
      testDb.addTextItem('jumps over the lazy dog');
      testDb.addTextItem('Hello world from clipboard');
    });

    it('searches content using FTS', () => {
      const results = testDb.searchItems('fox');
      expect(results.length).toBe(1);
      expect(results[0].content).toContain('fox');
    });

    it('searches across multiple words', () => {
      const results = testDb.searchItems('quick brown');
      expect(results.length).toBe(1);
      expect(results[0].content).toContain('quick brown');
    });

    it('returns empty array for empty query', () => {
      const results = testDb.searchItems('');
      expect(results.length).toBe(0);
    });

    it('excludes private items from search', () => {
      testDb.addTextItem('private fox content', 'text', true);
      
      const results = testDb.searchItems('fox');
      expect(results.length).toBe(1);
      expect(results[0].is_private).toBe(false);
    });
  });

  describe('Pin Operations', () => {
    it('pins items correctly', () => {
      const item = testDb.addTextItem('test content');
      
      const result = testDb.pinItem(item.id, true);
      expect(result).toBe(true);

      const updated = testDb.getItem(item.id);
      expect(updated!.is_pinned).toBe(true);
    });

    it('unpins items correctly', () => {
      const item = testDb.addTextItem('test content');
      testDb.pinItem(item.id, true);
      
      const result = testDb.pinItem(item.id, false);
      expect(result).toBe(true);

      const updated = testDb.getItem(item.id);
      expect(updated!.is_pinned).toBe(false);
    });

    it('returns false for non-existent items', () => {
      const result = testDb.pinItem(99999, true);
      expect(result).toBe(false);
    });
  });

  describe('Delete Operations', () => {
    it('deletes items correctly', () => {
      const item = testDb.addTextItem('test content');
      
      const result = testDb.deleteItem(item.id);
      expect(result).toBe(true);

      const retrieved = testDb.getItem(item.id);
      expect(retrieved).toBeNull();
    });

    it('deletes cached files when deleting file items', () => {
      const testFile = join(testDataDir, 'delete-test.txt');
      writeFileSync(testFile, 'test content');
      
      const item = testDb.addFileItem(testFile);
      const cachedPath = item.cached_file_path!;
      expect(existsSync(cachedPath)).toBe(true);

      testDb.deleteItem(item.id);
      expect(existsSync(cachedPath)).toBe(false);
    });

    it('returns false for non-existent items', () => {
      const result = testDb.deleteItem(99999);
      expect(result).toBe(false);
    });
  });

  describe('Clear Operations', () => {
    it('clears only non-pinned items by default', () => {
      // Create completely isolated database for this test
      const clearDataDir = join(tmpdir(), `clipboard-clear-nonpinned-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      const clearResolver = new MockPathResolver(clearDataDir);
      const clearDb = new ClipboardDatabase(clearResolver);
      
      clearDb.addTextItem('normal item 1');
      clearDb.addTextItem('normal item 2');
      const pinnedItem = clearDb.addTextItem('pinned item');
      clearDb.pinItem(pinnedItem.id, true);

      const cleared = clearDb.clearItems(false);
      expect(cleared).toBe(2);

      const remaining = clearDb.listItems(50);
      expect(remaining.length).toBe(1);
      expect(remaining[0].content).toBe('pinned item');
      
      clearDb.close();
    });

    it('clears all items when requested', () => {
      // Create completely isolated database for this test
      const clearAllDataDir = join(tmpdir(), `clipboard-clear-all-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      const clearAllResolver = new MockPathResolver(clearAllDataDir);
      const clearAllDb = new ClipboardDatabase(clearAllResolver);
      
      clearAllDb.addTextItem('normal item 1');
      clearAllDb.addTextItem('normal item 2');
      const pinnedItem = clearAllDb.addTextItem('pinned item');
      clearAllDb.pinItem(pinnedItem.id, true);

      const cleared = clearAllDb.clearItems(true);
      expect(cleared).toBe(3);

      const remaining = clearAllDb.listItems(50);
      expect(remaining.length).toBe(0);
      
      clearAllDb.close();
    });
  });

  describe('Statistics', () => {
    it('provides accurate statistics', () => {
      // Create a separate database instance for stats test
      const statsDataDir = join(tmpdir(), `clipboard-stats-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
      const statsResolver = new MockPathResolver(statsDataDir);
      const statsDb = new ClipboardDatabase(statsResolver);
      
      // Start with clean database
      statsDb.clearItems(true);
      
      statsDb.addTextItem('text item');
      const pinnedItem = statsDb.addTextItem('pinned item');
      statsDb.pinItem(pinnedItem.id, true);
      
      const testFile = join(statsDataDir, 'stats-test.txt');
      writeFileSync(testFile, 'file content');
      statsDb.addFileItem(testFile);

      const stats = statsDb.getStats();
      expect(stats.total).toBe(3);
      expect(stats.pinned).toBe(1);
      expect(stats.files).toBe(1);
      expect(stats.cacheSize).toContain('B'); // Should be formatted size
      
      statsDb.close();
    });
  });

  describe('Error Handling', () => {
    it('handles invalid file paths gracefully', () => {
      expect(() => testDb.addFileItem('')).toThrow('Invalid file path');
    });

    it('handles path resolution errors gracefully', () => {
      const errorResolver = new MockPathResolver(
        testDataDir,
        () => { throw new Error('Path resolution failed'); }
      );
      const db = new ClipboardDatabase(errorResolver);

      expect(() => db.addFileItem('test.txt')).toThrow('Path resolution failed');

      db.close();
    });
  });
});