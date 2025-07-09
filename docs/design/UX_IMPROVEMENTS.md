# UX Improvements Needed

## 1. Clarify Pinned vs Latest Behavior

**Current Issue**: `clipboard_paste()` without ID returns pinned items instead of the latest item.

**Problem**: This violates user expectations. When I paste without specifying, I expect the LAST thing I copied, not something I pinned days ago.

**Expected Behavior**:
- **Pin** = "Keep this item permanently, don't auto-delete"
- **Latest** = "The most recently copied item"
- `clipboard_paste()` → Always return the most recent item
- `clipboard_paste(id)` → Return specific item by ID

**Visual Separation Needed**:
```
📋 Clipboard History (8 items)

📌 Pinned Items (1):
  📝 ID:7 | Code snippets...

📝 Recent Items (7):
  🔒 ID:9 | Another secret... (2025-07-08 12:01:24) ← LATEST
  ID:6 | Second test copy...
  ID:5 | Testing the bug fix...
  ...
```

## 2. Make Private Mode More Explicit

**Current**: Private items auto-clear previous private items
**Better**: Add explicit notice when this happens

```
✅ Copied to clipboard! (Previous private item cleared)
```

## 3. Improve List Organization

**Option A**: Separate sections
- Pinned items in their own section at top
- Recent items below with clear "LATEST" indicator

**Option B**: Visual indicators
- Add "← LATEST" marker to the most recent item
- Keep pinned items at top but clearly separated

## 4. Clarify Tool Documentation

Update tool descriptions to be explicit:

- `clipboard_paste`: "Paste the MOST RECENT item (or specific ID if provided)"
- `clipboard_pin`: "Keep item permanently (won't be auto-deleted, stays in history)"

## 5. Consider Additional Tools

- `clipboard_paste_latest`: Always get the latest item
- `clipboard_paste_pinned`: Get list of pinned items
- `clipboard_unpin_all`: Clear all pins

## Summary

The main issue is that **pinned should mean "persistent" not "default"**. Users expect:
1. Pin = Don't delete this
2. Latest = What I just copied
3. Paste without ID = Give me what I just copied

This matches desktop clipboard manager behavior where pinned items are preserved but don't interfere with normal copy/paste flow.