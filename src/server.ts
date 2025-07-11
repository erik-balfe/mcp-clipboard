import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { ClipboardDatabase, ClipboardItem } from './database.js';
import { readFileSync } from 'fs';
import { RateLimiter } from './security.js';
import { 
  RATE_LIMIT_WINDOW, 
  RATE_LIMIT_MAX_REQUESTS, 
  RATE_LIMIT_MAX_FILE_OPS 
} from './constants.js';

interface CopyToolArguments {
  content: string;
  content_type?: 'text' | 'html' | 'image' | 'file';
  private?: boolean;
}

interface PasteToolArguments {
  id?: number;
}

interface SearchToolArguments {
  query: string;
  limit?: number;
}

interface ListToolArguments {
  limit?: number;
}

interface DeleteToolArguments {
  id: number;
}

interface PinToolArguments {
  id: number;
}

interface ClearToolArguments {
  clear_all?: boolean;
}

interface CopyFileToolArguments {
  file_path: string;
  private?: boolean;
}

interface LookAtToolArguments {
  id: number;
}

class ClipboardServer {
  private server: Server;
  private db: ClipboardDatabase;
  private rateLimiter: RateLimiter;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-clipboard',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.db = new ClipboardDatabase();
    this.rateLimiter = new RateLimiter(
      RATE_LIMIT_WINDOW,
      RATE_LIMIT_MAX_REQUESTS,
      RATE_LIMIT_MAX_FILE_OPS
    );
    
    this.setupToolHandlers();
    
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    
    setInterval(() => this.rateLimiter.cleanup(), RATE_LIMIT_WINDOW);
  }

  private cleanup(): void {
    this.db.close();
    process.exit(0);
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'clipboard_copy',
          description: 'Copy content to clipboard history',
          inputSchema: {
            type: 'object',
            properties: {
              content: {
                type: 'string',
                description: 'Content to copy to clipboard',
              },
              content_type: {
                type: 'string',
                enum: ['text', 'html', 'image', 'file'],
                description: 'Type of content being copied',
                default: 'text',
              },
              private: {
                type: 'boolean',
                description: 'Whether this is private content (will clear previous private items)',
                default: false,
              },
            },
            required: ['content'],
          },
        },
        {
          name: 'clipboard_paste',
          description: 'Paste content from clipboard history (latest if no ID specified)',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'number',
                description: 'Specific clipboard item ID to paste. If not provided, returns latest item.',
              },
            },
            required: [],
          },
        },
        {
          name: 'clipboard_list',
          description: 'List clipboard history items with previews',
          inputSchema: {
            type: 'object',
            properties: {
              limit: {
                type: 'number',
                description: 'Maximum number of items to return',
                default: 30,
              },
            },
            required: [],
          },
        },
        {
          name: 'clipboard_search',
          description: 'Search clipboard history using full-text search',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query to find in clipboard content',
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return',
                default: 30,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'clipboard_delete',
          description: 'Delete a specific clipboard item',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'number',
                description: 'ID of the clipboard item to delete',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'clipboard_pin',
          description: 'Toggle pin status of a clipboard item (pinned items are kept permanently)',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'number',
                description: 'ID of the clipboard item to pin/unpin',
              },
            },
            required: ['id'],
          },
        },
        {
          name: 'clipboard_clear',
          description: 'Clear clipboard history',
          inputSchema: {
            type: 'object',
            properties: {
              clear_all: {
                type: 'boolean',
                description: 'If true, clears all items including pinned ones. If false, clears only non-pinned items.',
                default: false,
              },
            },
            required: [],
          },
        },
        {
          name: 'clipboard_stats',
          description: 'Get clipboard statistics (total items, pinned items, etc.)',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'clipboard_copy_file',
          description: 'Copy a file (image, document, video) to clipboard with caching',
          inputSchema: {
            type: 'object',
            properties: {
              file_path: {
                type: 'string',
                description: 'Absolute path to the file to copy',
              },
              private: {
                type: 'boolean',
                description: 'Whether this is private content (will clear previous private items)',
                default: false,
              },
            },
            required: ['file_path'],
          },
        },
        {
          name: 'clipboard_look_at',
          description: 'View/analyze a cached file (images can be seen by AI agents)',
          inputSchema: {
            type: 'object',
            properties: {
              id: {
                type: 'number',
                description: 'ID of the clipboard item to view',
              },
            },
            required: ['id'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const clientId = 'default'; // In real implementation, extract from request context
      const isFileOperation = name === 'clipboard_copy_file';
      
      if (!this.rateLimiter.checkLimit(clientId, isFileOperation)) {
        throw new McpError(
          ErrorCode.InternalError,
          `Rate limit exceeded. Please try again later.`
        );
      }

      try {
        switch (name) {
          case 'clipboard_copy':
            return await this.handleCopy(args as CopyToolArguments);
          case 'clipboard_paste':
            return await this.handlePaste(args as PasteToolArguments);
          case 'clipboard_list':
            return await this.handleList(args as ListToolArguments);
          case 'clipboard_search':
            return await this.handleSearch(args as SearchToolArguments);
          case 'clipboard_delete':
            return await this.handleDelete(args as DeleteToolArguments);
          case 'clipboard_pin':
            return await this.handlePin(args as PinToolArguments);
          case 'clipboard_clear':
            return await this.handleClear(args as ClearToolArguments);
          case 'clipboard_stats':
            return await this.handleStats();
          case 'clipboard_copy_file':
            return await this.handleCopyFile(args as CopyFileToolArguments);
          case 'clipboard_look_at':
            return await this.handleLookAt(args as LookAtToolArguments);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  private async handleCopy(args: CopyToolArguments) {
    const { content, content_type = 'text', private: isPrivate = false } = args;
    
    if (!content || content.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidParams, 'Content cannot be empty');
    }
    
    const item = this.db.addTextItem(content, content_type as 'text' | 'html', isPrivate);
    
    return {
      content: [
        {
          type: 'text',
          text: `✅ Copied to clipboard!\n\nID: ${item.id}\nType: ${item.content_type}\nPreview: ${item.preview}\nPrivate: ${item.is_private ? 'Yes' : 'No'}\nCreated: ${item.created_at}`,
        },
      ],
    };
  }

  private async handlePaste(args: PasteToolArguments) {
    const { id } = args;
    
    let item: ClipboardItem | null;
    
    if (id) {
      item = this.db.getItem(id);
      if (!item) {
        throw new McpError(ErrorCode.InvalidParams, `Clipboard item with ID ${id} not found`);
      }
    } else {
      const items = this.db.listItems(1);
      item = items.length > 0 ? items[0] : null;
      if (!item) {
        throw new McpError(ErrorCode.InvalidParams, 'Clipboard is empty');
      }
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `📋 Clipboard Content (ID: ${item.id})\n\nType: ${item.content_type}\nPinned: ${item.is_pinned ? 'Yes' : 'No'}\nCreated: ${item.created_at}\n\n--- Content ---\n${item.content}`,
        },
      ],
    };
  }

  private async handleList(args: ListToolArguments) {
    const { limit = 30 } = args;
    const items = this.db.listItems(limit, true);
    
    if (items.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: '📋 Clipboard is empty',
          },
        ],
      };
    }
    
    const itemsList = items.map(item => {
      const pinnedIcon = item.is_pinned ? '📌 ' : '';
      const privateIcon = item.is_private ? '🔒 ' : '';
      const typeIcon = {
        text: '📝',
        html: '🌐',
        image: '🖼️',
        file: '📁'
      }[item.content_type] || '📝';
      
      return `${pinnedIcon}${privateIcon}${typeIcon} ID:${item.id} | ${item.preview} (${item.created_at})`;
    }).join('\n');
    
    const allItems = this.db.listItems(Number.MAX_SAFE_INTEGER, true);
    const stats = {
      total_items: allItems.length,
      pinned_items: allItems.filter(item => item.is_pinned).length,
      private_items: allItems.filter(item => item.is_private).length
    };
    
    return {
      content: [
        {
          type: 'text',
          text: `📋 Clipboard History (${stats.total_items} items, ${stats.pinned_items} pinned)\n\n${itemsList}\n\n💡 Use clipboard_paste with an ID to get the full content`,
        },
      ],
    };
  }

  private async handleSearch(args: SearchToolArguments) {
    const { query, limit = 30 } = args;
    
    if (!query || query.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidParams, 'Search query cannot be empty');
    }
    
    const items = this.db.searchItems(query, limit);
    
    if (items.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `🔍 No results found for: "${query}"`,
          },
        ],
      };
    }
    
    const itemsList = items.map(item => {
      const pinnedIcon = item.is_pinned ? '📌 ' : '';
      const privateIcon = item.is_private ? '🔒 ' : '';
      const typeIcon = {
        text: '📝',
        html: '🌐',
        image: '🖼️',
        file: '📁'
      }[item.content_type] || '📝';
      
      return `${pinnedIcon}${privateIcon}${typeIcon} ID:${item.id} | ${item.preview} (${item.created_at})`;
    }).join('\n');
    
    return {
      content: [
        {
          type: 'text',
          text: `🔍 Search results for: "${query}" (${items.length} found)\n\n${itemsList}\n\n💡 Use clipboard_paste with an ID to get the full content`,
        },
      ],
    };
  }

  private async handleDelete(args: DeleteToolArguments) {
    const { id } = args;
    
    const item = this.db.getItem(id);
    if (!item) {
      throw new McpError(ErrorCode.InvalidParams, `Clipboard item with ID ${id} not found`);
    }
    
    const success = this.db.deleteItem(id);
    if (!success) {
      throw new McpError(ErrorCode.InternalError, 'Failed to delete clipboard item');
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `🗑️ Deleted clipboard item ID:${id}\nPreview: ${item.preview}`,
        },
      ],
    };
  }

  private async handlePin(args: PinToolArguments) {
    const { id } = args;
    
    const item = this.db.getItem(id);
    if (!item) {
      throw new McpError(ErrorCode.InvalidParams, `Clipboard item with ID ${id} not found`);
    }
    
    const currentItem = this.db.getItem(id);
    if (!currentItem) {
      throw new McpError(ErrorCode.InvalidParams, `Clipboard item with ID ${id} not found`);
    }
    const success = this.db.pinItem(id, !currentItem.is_pinned);
    if (!success) {
      throw new McpError(ErrorCode.InternalError, 'Failed to toggle pin status');
    }
    
    const updatedItem = this.db.getItem(id);
    const action = updatedItem?.is_pinned ? 'Pinned' : 'Unpinned';
    const icon = updatedItem?.is_pinned ? '📌' : '📋';
    
    return {
      content: [
        {
          type: 'text',
          text: `${icon} ${action} clipboard item ID:${id}\nPreview: ${item.preview}`,
        },
      ],
    };
  }

  private async handleClear(args: ClearToolArguments) {
    const { clear_all = false } = args;
    
    const deletedCount = this.db.clearItems(clear_all || false);
    const message = clear_all 
      ? `🗑️ Cleared all clipboard items (${deletedCount} items removed)`
      : `🗑️ Cleared clipboard history (${deletedCount} items removed, pinned items kept)`;
    
    return {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
    };
  }

  private async handleStats() {
    const allItems = this.db.listItems(Number.MAX_SAFE_INTEGER, true);
    const stats = {
      total_items: allItems.length,
      pinned_items: allItems.filter(item => item.is_pinned).length,
      private_items: allItems.filter(item => item.is_private).length
    };
    
    return {
      content: [
        {
          type: 'text',
          text: `📊 Clipboard Statistics\n\n📋 Total items: ${stats.total}\n📌 Pinned items: ${stats.pinned}\n🔒 Private items: ${stats.private}`,
        },
      ],
    };
  }

  private async handleCopyFile(args: CopyFileToolArguments) {
    const { file_path, private: isPrivate = false } = args;
    
    if (!file_path || file_path.trim().length === 0) {
      throw new McpError(ErrorCode.InvalidParams, 'File path cannot be empty');
    }
    
    try {
      const item = this.db.addFileItem(file_path, isPrivate);
      
      return {
        content: [
          {
            type: 'text',
            text: `✅ File copied to clipboard!\n\nID: ${item.id}\nType: ${item.content_type}\nFile: ${item.original_path}\nSize: ${item.file_size ? this.formatFileSize(item.file_size) : 'Unknown'}\nPrivate: ${item.is_private ? 'Yes' : 'No'}\nCached: ${item.cached_file_path}\nCreated: ${item.created_at}`,
          },
        ],
      };
    } catch (error) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Failed to copy file: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  private async handleLookAt(args: LookAtToolArguments) {
    const { id } = args;
    
    const item = this.db.getItem(id);
    if (!item) {
      throw new McpError(ErrorCode.InvalidParams, `Clipboard item with ID ${id} not found`);
    }
    
    if (!item.cached_file_path) {
      return {
        content: [
          {
            type: 'text',
            text: `📋 Clipboard Content (ID: ${item.id})\n\nThis is not a file item. Use clipboard_paste to view text content.\n\nType: ${item.content_type}\nPreview: ${item.preview}`,
          },
        ],
      };
    }
    
    const clipboardItem = this.db.getItem(id);
    if (!clipboardItem || !clipboardItem.cached_file_path) {
      throw new McpError(ErrorCode.InvalidParams, `Cached file for clipboard item ${id} not found`);
    }
    const cachedPath = clipboardItem.cached_file_path;
    if (!cachedPath) {
      throw new McpError(ErrorCode.InvalidParams, `Cached file not found for item ${id}`);
    }
    
    if (item.content_type === 'image_file' && item.mime_type?.startsWith('image/')) {
      return {
        content: [
          {
            type: 'text',
            text: `🖼️ Image from clipboard (ID: ${item.id})\n\nOriginal: ${item.original_path}\nSize: ${item.file_size ? this.formatFileSize(item.file_size) : 'Unknown'}\nMIME: ${item.mime_type}\nCached at: ${cachedPath}`,
          },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: item.mime_type || 'image/png',
              data: readFileSync(cachedPath, 'base64'),
            },
          },
        ],
      };
    }
    
    return {
      content: [
        {
          type: 'text',
          text: `📁 File from clipboard (ID: ${item.id})\n\nType: ${item.content_type}\nOriginal: ${item.original_path}\nSize: ${item.file_size ? this.formatFileSize(item.file_size) : 'Unknown'}\nMIME: ${item.mime_type}\nCached at: ${cachedPath}\n\n💡 Use this path to access the file with other tools.`,
        },
      ],
    };
  }

  private formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}GB`;
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('MCP Clipboard Server running on stdio');
  }
}

const server = new ClipboardServer();
server.run().catch(console.error);