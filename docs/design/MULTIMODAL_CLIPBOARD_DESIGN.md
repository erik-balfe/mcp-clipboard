# Multimodal Clipboard Design for AI Agents

## Current Limitations

### What Works Now
- **Text**: ✅ Full content stored
- **Images**: ❌ Only path stored (just text)
- **Files**: ❌ Only path stored (just text)
- **Folders**: ❌ Only path stored (just text)
- **HTML**: ⚠️ Stored as text (no rendering)

### The Terminal-First Problem
AI agents operate in a text-based environment. We can't "display" images, but we can:
1. Store file paths/references
2. Store base64 encoded data
3. Store file metadata

## Implementation Strategies

### 1. Path Reference Mode (Current)
```javascript
clipboard_copy("/path/to/image.png", "image")
// Stores: "/path/to/image.png"
// Preview: "[Image]"
```

**Pros**: Simple, lightweight
**Cons**: Breaks if file moves/deletes

### 2. Base64 Encoding Mode
```javascript
// Read file → Convert to base64 → Store in clipboard
clipboard_copy_file("/path/to/image.png")
// Stores: "data:image/png;base64,iVBORw0KGgoAAAANS..."
// Preview: "[Image: 256KB, 800x600]"
```

**Pros**: Truly portable, survives file deletion
**Cons**: Large storage, database bloat

### 3. Hybrid Smart Mode
```javascript
clipboard_copy_smart("/path/to/file.png")
// For small files (<1MB): Store base64
// For large files: Store path + metadata
// For directories: Store path + file list
```

## Proposed Implementation

### Enhanced Content Types
```typescript
type ContentType = 
  | 'text' 
  | 'html'
  | 'image_path'      // Just the path
  | 'image_data'      // Base64 encoded
  | 'file_path'       // Any file path
  | 'file_data'       // File content (text files)
  | 'directory'       // Directory path + listing
  | 'code'            // Syntax-highlighted code
  | 'json'            // Validated JSON
  | 'url'             // Validated URL
```

### Smart File Handling
```typescript
async function copyFile(filePath: string) {
  const stats = await fs.stat(filePath);
  
  if (stats.isDirectory()) {
    // Store directory listing
    const files = await fs.readdir(filePath);
    return {
      type: 'directory',
      content: JSON.stringify({ path: filePath, files }),
      preview: `[Directory: ${files.length} items]`
    };
  }
  
  if (isImage(filePath)) {
    if (stats.size < 1024 * 1024) { // <1MB
      const data = await fs.readFile(filePath, 'base64');
      return {
        type: 'image_data',
        content: `data:${mime};base64,${data}`,
        preview: `[Image: ${formatSize(stats.size)}]`
      };
    } else {
      return {
        type: 'image_path',
        content: filePath,
        preview: `[Image: ${formatSize(stats.size)}, path only]`
      };
    }
  }
  
  if (isTextFile(filePath)) {
    const content = await fs.readFile(filePath, 'utf-8');
    return {
      type: 'file_data',
      content: content,
      preview: content.substring(0, 100)
    };
  }
  
  // Default: just store path
  return {
    type: 'file_path',
    content: filePath,
    preview: `[File: ${path.basename(filePath)}]`
  };
}
```

### AI Agent Integration

For AI agents like Claude who can "see" images:

```typescript
// When pasting image_data type:
if (item.content_type === 'image_data') {
  // AI agent could process base64 image directly
  return {
    type: 'image',
    data: item.content // base64 data
  };
}
```

### New Tools Needed

```typescript
// Copy file with smart detection
clipboard_copy_file(file_path: string, options?: {
  force_embed?: boolean,  // Always embed content
  metadata?: boolean      // Include file stats
})

// Copy directory listing
clipboard_copy_directory(dir_path: string, options?: {
  recursive?: boolean,
  max_depth?: number
})

// Multi-file copy
clipboard_copy_files(file_paths: string[])

// Paste to file
clipboard_paste_to_file(id: number, output_path: string)
```

## Use Cases for AI Agents

### 1. Screenshot Analysis
```
Human: "Look at this screenshot"
AI: clipboard_copy_file("/tmp/screenshot.png", { force_embed: true })
AI: clipboard_paste() // Can now "see" the image via base64
```

### 2. Code File Reference
```
AI: clipboard_copy_file("src/index.ts")
// Later in conversation...
AI: "Let me check that file we discussed earlier"
AI: clipboard_paste() // Full file content available
```

### 3. Directory Context
```
AI: clipboard_copy_directory("./src", { recursive: true })
AI: "I've captured the project structure for reference"
```

## Challenges

1. **Size Limits**: SQLite has limits, base64 inflates size by ~33%
2. **Performance**: Large files could slow down operations
3. **Cleanup**: Need policies for embedded data
4. **Security**: Copying sensitive files needs careful handling

## Recommendation

Implement a **hybrid approach**:

1. **Text/Code**: Store content directly (current behavior)
2. **Small Images** (<1MB): Auto-embed as base64
3. **Large Files**: Store path + metadata + checksum
4. **Directories**: Store listing + metadata
5. **Smart Preview**: Generate useful previews for all types

This would maintain the clipboard's usefulness while extending it to handle the multimodal nature of modern AI agents.