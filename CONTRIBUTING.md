# Contributing to MCP Clipboard Manager

Thank you for your interest in contributing to MCP Clipboard Manager! This document provides guidelines for contributing to the project.

## Quick Start

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a branch** for your changes
4. **Make your changes** and test them
5. **Submit a pull request**

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) runtime
- Node.js 18+ (for compatibility testing)

### Installation

```bash
# Clone the repository
git clone https://github.com/erik/mcp-clipboard.git
cd mcp-clipboard

# Install dependencies
bun install

# Run in development mode
bun run dev
```

### Testing

```bash
# Run security tests
bun run src/security.test.ts

# Test server startup
bun run start

# Test with MCP Inspector
npx @modelcontextprotocol/inspector dist/server.js
```

## Code Guidelines

### Code Style

- Use TypeScript throughout
- Follow existing code patterns
- Add type annotations where helpful
- Use meaningful variable names
- Keep functions focused and small

### Security

- **Always validate user input** before processing
- **Never trust file paths** - use `validateFilePath()`
- **Sanitize search queries** - use `sanitizeFtsQuery()`
- **Test security features** - add tests for security-related changes

### Database

- Use prepared statements for all SQL queries
- Maintain FTS5 search index consistency
- Handle database errors gracefully
- Test database operations thoroughly

## Project Structure

```
src/
├── server.ts       # MCP server implementation
├── database.ts     # SQLite database operations
├── security.ts     # Security utilities
├── constants.ts    # Configuration constants
└── security.test.ts # Security test suite

docs/
├── development/    # Development documentation
└── design/         # Design philosophy and UX
```

## Adding New Features

### MCP Tools

When adding new MCP tools:

1. **Define the tool** in `server.ts`
2. **Add database operations** in `database.ts` if needed
3. **Update constants** in `constants.ts` if new limits are needed
4. **Add security validation** where appropriate
5. **Write tests** for the new functionality
6. **Update documentation** in relevant files

### Database Schema Changes

For database schema changes:

1. **Plan migrations** - consider backward compatibility
2. **Test thoroughly** - ensure existing data remains intact
3. **Document changes** - update schema documentation
4. **Consider performance** - add indexes where needed

## Testing

### Security Testing

Always run security tests before submitting:

```bash
bun run src/security.test.ts
```

### Manual Testing

Test your changes with:

```bash
# Start the server
bun run start

# Test with MCP Inspector
npx @modelcontextprotocol/inspector dist/server.js
```

### Integration Testing

Test with actual MCP clients:

1. **Claude Desktop** - Add to configuration and test
2. **Other MCP clients** - Verify compatibility

## Pull Request Process

### Before Submitting

1. **Run all tests** and ensure they pass
2. **Test security features** thoroughly
3. **Build the project** successfully
4. **Update documentation** if needed
5. **Check for typos** and formatting issues

### Pull Request Requirements

- **Clear description** of what the change does
- **Testing details** - how you tested the changes
- **Security considerations** - any security implications
- **Breaking changes** - clearly marked if any
- **Documentation updates** - if public APIs change

### Review Process

1. **Automated checks** must pass (CI/CD)
2. **Security review** for security-related changes
3. **Code review** by maintainers
4. **Testing** by maintainers if needed

## Issue Reporting

### Bug Reports

Include:
- **Steps to reproduce** the issue
- **Expected behavior** vs **actual behavior**
- **Environment details** (OS, Bun version, etc.)
- **Error messages** or logs if available

### Feature Requests

Include:
- **Use case** - why this feature is needed
- **Proposed solution** - how you envision it working
- **Alternatives considered** - other approaches you thought of
- **Implementation ideas** - if you have technical suggestions

## Code of Conduct

- **Be respectful** and constructive in discussions
- **Focus on the code** and technical aspects
- **Help others** learn and contribute
- **Follow project guidelines** and standards

## Security

### Reporting Security Issues

**Do NOT open public issues for security vulnerabilities.**

Instead:
1. Email security issues privately to the maintainers
2. Provide detailed information about the vulnerability
3. Allow time for the issue to be fixed before public disclosure

### Security Review

All security-related changes require:
- **Security test coverage**
- **Code review** by security-conscious contributors
- **Testing** with potential attack vectors

## Getting Help

- **GitHub Issues** - For bug reports and feature requests
- **GitHub Discussions** - For questions and community discussion
- **Code Review** - For specific code questions in PRs

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be recognized in:
- **GitHub contributors** page
- **Release notes** for significant contributions
- **Documentation** where appropriate

---

Thank you for contributing to MCP Clipboard Manager! 🚀