# Known Issues

## Critical Bug: clipboard_copy fails with null error

**Status**: 🔴 Critical  
**Date**: 2025-07-08  
**Error**: `MCP error -32603: Tool execution failed: null is not an object (evaluating 'item.id')`

### Description
The `clipboard_copy` tool fails when trying to copy content, but the first copy somehow succeeded and shows in clipboard stats/list. Subsequent copy attempts fail with a null reference error when accessing `item.id`.

### Error Details
```
MCP error -32603: Tool execution failed: null is not an object (evaluating 'item.id')
```

### Investigation
- First copy worked and created ID:1 in database
- Subsequent copies fail in the addItem() method
- Error suggests the returned item from getItem() is null
- Issue likely in database layer or return value handling

### Reproduction Steps
1. Call `clipboard_copy` with any content
2. Observe error on second+ attempts
3. First item persists in database but no new items can be added

### Root Cause Analysis Needed
- Check `this.db.lastInsertRowid` return value
- Verify getItem() method implementation  
- Check Bun SQLite API compatibility differences

### Impact
- Blocks all clipboard_copy functionality after first use
- Makes the tool essentially unusable for its primary purpose
- Core feature completely broken

### Root Cause Found ✅
**Issue**: Using `this.db.lastInsertRowid` instead of `result.lastInsertRowid` in Bun SQLite API.

In Bun's SQLite implementation:
- `result.lastInsertRowid` ✅ (correct)
- `this.db.lastInsertRowid` ❌ (undefined)

### Fix Applied ✅
```typescript
// Before (broken):
return this.getItem(this.db.lastInsertRowid)!;

// After (fixed):
return this.getItem(result.lastInsertRowid as number)!;
```

### Status
**FIXED** - Ready for testing after server restart.

### Priority
**CRITICAL** - This breaks the fundamental clipboard copy functionality.