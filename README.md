# MCP Clipboard Manager

> **Give your AI agent a memory** - Never lose context again! 🚀

The easiest way to add persistent clipboard functionality to Claude Desktop, VS Code, or any MCP-compatible AI agent.

## 🎯 What This Does

**Problem**: AI agents forget everything between conversations. That useful code snippet or error message? Gone.

**Solution**: This gives your AI a persistent, searchable clipboard that remembers everything across sessions.

## ⚡ One-Click Installation

### **Option 1: Docker (Recommended - No Setup Required)**

Just add this to your MCP client config and restart:

```json
{
  "mcpServers": {
    "clipboard": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-v", "mcp-clipboard-data:/app/data",
        "-e", "DOCKER_CONTAINER=true",
        "ghcr.io/erik-balfe/mcp-clipboard:latest"
      ]
    }
  }
}
```

### **Option 2: Direct Install (Requires Bun)**

1. **Install Bun**: `curl -fsSL https://bun.sh/install | bash`
2. **Add to config**:
```json
{
  "mcpServers": {
    "clipboard": {
      "command": "npx",
      "args": ["@tyr/mcp-clipboard@latest"]
    }
  }
}
```

## 📁 Where to Put the Config

| Client | Location |
|--------|----------|
| **Claude Desktop** (macOS) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| **Claude Desktop** (Windows) | `%AppData%\Claude\claude_desktop_config.json` |
| **Claude Desktop** (Linux) | `~/.config/claude/claude_desktop_config.json` |
| **VS Code/Cursor** | MCP extension settings |

## ✅ That's It!

Restart your AI client and you're done. Your AI can now:

- **Remember** code snippets, error messages, and notes
- **Search** through everything it's saved
- **View** images and files you've copied
- **Pin** important items to keep forever

## 🎪 What Your AI Can Do Now

| What AI Sees | What It Can Do |
|--------------|----------------|
| `clipboard_copy` | Save any text or content |
| `clipboard_copy_file` | Save images, documents, files |
| `clipboard_paste` | Get the latest copied item |
| `clipboard_search` | Find anything in the history |
| `clipboard_list` | Show clipboard history |
| `clipboard_pin` | Keep important items |
| `clipboard_look_at` | View saved images/files |

## 💬 Example Usage

```
You: "Save this error for debugging later"
AI: I'll save that error message to the clipboard.

[Later conversation]
You: "What was that database error from earlier?"
AI: Let me search the clipboard... Found it! Here's the error:
```

## 🔒 Privacy & Security

- **100% Local**: Everything stays on your machine
- **No Network**: Completely offline operation  
- **Secure**: Built-in path validation and rate limiting
- **Private Mode**: Sensitive content auto-expires

## 💡 Common Use Cases

### 💻 For Developers
- Save error messages and ask AI to debug them later
- Keep useful code snippets across conversations  
- Pin frequently used commands and references
- Build a searchable knowledge base with AI help

### 📚 For Research
- Save quotes and references while reading
- Ask AI to synthesize information from multiple clips
- Keep track of important sources and data
- Build connections between different research threads

### ✍️ For Content Creation  
- Save draft versions and get AI feedback
- Compare different revisions of your work
- Keep inspiration and ideas organized
- Let AI help you refine and improve content

## 🔧 Settings

- **Storage**: Everything saved in Docker volume `mcp-clipboard-data` (persistent)
- **Limits**: 50 items max (pinned items don't count)  
- **File Size**: Up to 100MB per file
- **Search**: Full-text search across all content
- **Persistence**: Data survives container restarts

## 🚨 Need Help?

### Quick Fixes

**Docker not working?**
- Make sure Docker is installed and running
- Try the direct install option instead

**AI can't see clipboard tools?**  
- Restart your AI client after adding the config
- Check that the config file is valid JSON

**Permission errors?**
- Make sure the config file location is writable
- Use absolute paths (like `/Users/username`) instead of `~` or `${HOME}`
- Ensure the mounted directories exist and are readable

### Still Having Issues?

1. **Check the logs** in your AI client for error messages
2. **Test manually**: `docker run ghcr.io/erik-balfe/mcp-clipboard:latest` 
3. **File a bug report** on [GitHub Issues](https://github.com/erik-balfe/mcp-clipboard/issues)

---

## 🎉 That's It!

Your AI agent now has a persistent memory. It can remember conversations, build knowledge over time, and help you way more effectively.

**Questions?** [Open an issue](https://github.com/erik-balfe/mcp-clipboard/issues) and we'll help you get set up.

---

<details>
<summary>🔧 Technical Details (for developers)</summary>

### Architecture
- **Runtime**: Bun with SQLite database
- **Protocol**: Model Context Protocol (MCP)  
- **Security**: Path validation, rate limiting, input sanitization

### Performance  
- 50 item limit with automatic cleanup
- 100MB max file size per item
- Full-text search with FTS5
- WAL mode for concurrent access

### Development
```bash
git clone https://github.com/erik-balfe/mcp-clipboard.git
cd mcp-clipboard
bun install
bun run dev
```

### Contributing
See `CONTRIBUTING.md` for development setup and guidelines.

</details>

## 📜 License

MIT License - Free to use however you want!
