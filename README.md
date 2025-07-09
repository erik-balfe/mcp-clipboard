# MCP Clipboard Manager

> **Persistent clipboard for AI agents** - Never lose context again! 🚀

A Model Context Protocol (MCP) server that gives AI agents like Claude a powerful clipboard with persistent storage, search, and multimodal support. Think of it as a sophisticated clipboard manager designed specifically for AI workflows.

## ✨ Why You Need This

**The Problem**: AI agents have no working memory. They can't remember that error message you copied 5 minutes ago, or keep track of useful code snippets across conversations.

**The Solution**: MCP Clipboard Manager provides AI agents with persistent, searchable clipboard history that survives across sessions - just like desktop clipboard managers, but designed for AI workflows.

## 🎯 Perfect For

- **Developers**: Store error messages, code snippets, and commands across AI conversations
- **Researchers**: Keep references, quotes, and data snippets organized
- **Content Creators**: Manage drafts, ideas, and revisions with AI assistance
- **Anyone**: Who wants their AI to remember context between conversations

## 🚀 Quick Start

### 1. Install

Choose your preferred method:

#### Option A: Download Release (Recommended)
```bash
# Download the latest release
curl -L https://github.com/erik/mcp-clipboard/releases/latest/download/mcp-clipboard-latest.tar.gz | tar -xz

# Install
./install.sh
```

#### Option B: Use Bun Package Manager
```bash
# Install Bun if you haven't already
curl -fsSL https://bun.sh/install | bash

# Run directly
bunx mcp-clipboard
```

### 2. Configure Your AI Client

Add this to your MCP client configuration:

#### Claude Desktop
Add to your `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "clipboard": {
      "command": "bun",
      "args": ["run", "/path/to/mcp-clipboard/dist/server.js"]
    }
  }
}
```

#### Other MCP Clients
Point your MCP client to the `dist/server.js` file using the Bun runtime.

### 3. Start Using!

Your AI agent now has access to powerful clipboard tools:

```
You: "Remember this API key for later: sk-1234..."
AI: [Uses clipboard_copy with private mode]

You: "What was that error from earlier?"
AI: [Uses clipboard_search to find it]

You: "Show me my clipboard history"
AI: [Uses clipboard_list to display everything]
```

## 🔧 Available Tools

Your AI agent can now use these clipboard tools:

| Tool | Purpose | Example |
|------|---------|---------|
| `clipboard_copy` | Store text content | Save error messages, code snippets |
| `clipboard_copy_file` | Store files (images, docs) | Cache screenshots, documents |
| `clipboard_paste` | Retrieve content | Get the latest copied item |
| `clipboard_list` | Browse history | See all clipboard items |
| `clipboard_search` | Find content | Search for specific text |
| `clipboard_pin` | Keep items permanently | Pin important references |
| `clipboard_delete` | Remove items | Clean up unwanted content |
| `clipboard_clear` | Clear history | Fresh start |
| `clipboard_look_at` | View files | AI can "see" cached images |

## 💡 Features

### 🎪 **Multimodal Support**
- **Text**: Code snippets, error messages, notes
- **Images**: Screenshots, diagrams, photos (AI can view them!)
- **Documents**: PDFs, Word docs, presentations
- **Videos**: Screen recordings, tutorials

### 🔍 **Smart Organization**
- **Search**: Full-text search across all content
- **Pin**: Keep important items permanently
- **Private Mode**: Auto-clearing for sensitive data
- **Smart Previews**: See content at a glance

### 🔒 **Privacy & Security**
- **Local Storage**: Everything stays on your machine
- **No Network**: Completely offline operation
- **Secure**: Path validation, input sanitization
- **Private Mode**: Sensitive content auto-expires

### ⚡ **Performance**
- **Fast**: SQLite database with smart indexing
- **Efficient**: 50 item limit with 100MB per file
- **Persistent**: Survives reboots and session changes

## 📖 Common Use Cases

### For Developers
```
1. Copy error message → Ask AI to debug
2. AI provides solution → Copy code snippet
3. Later conversation → Search for that solution
4. Pin frequently used commands
```

### For Research
```
1. Copy interesting quote → Continue reading
2. Find related article → Copy key points
3. Ask AI to synthesize → Reference all clips
4. Pin important sources
```

### For Content Creation
```
1. Copy draft paragraph → Get AI feedback
2. Copy revised version → Compare with original
3. Copy final version → Pin for later use
4. Search through all versions
```

## 🛠️ Requirements

- **Bun Runtime**: Install from [bun.sh](https://bun.sh)
- **MCP Client**: Claude Desktop, or any MCP-compatible client
- **Storage**: ~100MB for cache folder

## 🔧 Configuration

The clipboard stores data in `~/.mcp-clipboard/`:
- `clipboard.db` - SQLite database
- `cache/` - Cached files (images, documents)

Default limits (configurable):
- **Max Items**: 50 (excluding pinned)
- **Max File Size**: 100MB
- **Storage Location**: `~/.mcp-clipboard/`

## 🚨 Troubleshooting

### Common Issues

**"Command not found"**
- Make sure Bun is installed and in your PATH
- Check that the server.js file is executable

**"Database error"**
- Ensure `~/.mcp-clipboard/` directory is writable
- Try clearing the cache: `rm -rf ~/.mcp-clipboard/`

**"MCP connection failed"**
- Verify your client configuration
- Check that the server starts: `bun run server.js`

### Get Help

- 📚 See `docs/` folder for detailed documentation
- 🐛 Report issues on GitHub
- 💬 Join discussions in GitHub Issues

## 🎉 What's Next?

This tool transforms how AI agents work with temporary data. Instead of losing context, your AI can:

- Remember error messages across conversations
- Build up a library of useful code snippets
- Keep track of research findings
- Maintain context in complex workflows

**Ready to give your AI agent a memory upgrade?** Install MCP Clipboard Manager today!

---

## 📜 License

MIT License - Use it however you want!

## 🙏 Contributing

Contributions welcome! See `CONTRIBUTING.md` for details.

## 🚀 Next Steps

### First Release

To create your first release:

1. **Push to GitHub**: Initialize your repository and push the code
2. **Create a release**: Use GitHub's release interface or the Actions workflow
3. **Test the installation**: Download and test the release package

### Development Workflow

```bash
# Development
bun run dev      # Development with hot reload
bun run start    # Run from source
bun run build    # Build for production

# Testing
bun run src/security.test.ts  # Run security tests
npx @modelcontextprotocol/inspector dist/server.js  # Test with MCP Inspector
```

### Creating Releases

The project includes automated CI/CD:

- **Dev builds**: Automatic on every push to master
- **Production releases**: Manual trigger or GitHub releases
- **Semantic versioning**: Automatically validated

## 🔧 Technical Details

### Architecture
- **Runtime**: Bun for performance
- **Database**: SQLite with FTS5 search
- **Protocol**: Model Context Protocol (MCP)
- **Security**: Path validation, input sanitization, rate limiting

### Performance
- **50 item limit** with automatic cleanup
- **100MB file size** limit per item
- **WAL mode** for better concurrent access
- **Prepared statements** for SQL injection protection

### Security Features
- Path traversal protection
- FTS injection prevention
- Rate limiting (100 ops/min, 10 files/min)
- Input validation and sanitization

## 🆘 Support

- **Documentation**: See `docs/` folder
- **Issues**: Report bugs on GitHub
- **Contributing**: See `CONTRIBUTING.md`
- **Security**: Email security issues privately

## 📈 Project Status

- ✅ Core functionality complete
- ✅ Security vulnerabilities fixed
- ✅ CI/CD pipeline ready
- ✅ Documentation complete
- 🚀 **Ready for production use**
