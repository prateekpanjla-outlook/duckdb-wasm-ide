# User Session Management Options for DuckDB WASM IDE

## Overview

This document explores different approaches for implementing user sessions in the DuckDB WASM IDE, enabling persistence of user data, preferences, and query history across browser sessions.

---

## Option 1: localStorage (Recommended for Current Use Case)

### Description
Browser's built-in key-value storage that persists across sessions. Data is stored as strings and has no expiration time.

### Pros
- ✅ Simple to implement
- ✅ Persists across browser restarts
- ✅ Synchronous API (no async/await needed)
- ✅ ~5-10MB storage limit
- ✅ Widely supported
- ✅ No server needed

### Cons
- ❌ String-only storage (need JSON.stringify/parse for objects)
- ❌ Not suitable for large files
- ❌ Shared across all tabs (same domain)

### Best For
- Query history
- User preferences (theme, editor settings)
- Recent file names (not file contents)
- Connection settings

### Implementation Example

```javascript
// Save query to history
const queries = JSON.parse(localStorage.getItem('queryHistory') || '[]');
queries.push({ query: 'SELECT * FROM table', timestamp: Date.now() });
localStorage.setItem('queryHistory', JSON.stringify(queries));

// Retrieve query history
const savedQueries = JSON.parse(localStorage.getItem('queryHistory') || '[]');
```

### Storage Limits
- **Desktop**: 5-10 MB per domain
- **Mobile**: ~5 MB per domain
- **Warning**: Browser may prompt user at quota limit

---

## Option 2: sessionStorage

### Description
Similar to localStorage but data is cleared when the page session ends (tab/window closed).

### Pros
- ✅ Simple API (same as localStorage)
- ✅ Faster than localStorage
- ✅ Data isolated per tab

### Cons
- ❌ Lost when tab closes
- ❌ Same 5-10MB limit
- ❌ String-only storage

### Best For
- Temporary query state
- Undo/redo history (current session)
- Form data backup (auto-save)

### Implementation Example

```javascript
// Save current query as backup
sessionStorage.setItem('currentQueryBackup', queryEditor.getValue());

// Restore after refresh
const backup = sessionStorage.getItem('currentQueryBackup');
if (backup) queryEditor.setValue(backup);
```

---

## Option 3: IndexedDB (For Large Data)

### Description
Low-level API for significant amounts of structured data, including files/blobs. Asynchronous API.

### Pros
- ✅ Large storage capacity (50MB - several GB)
- ✅ Supports binary data (Blobs, ArrayBuffers)
- ✅ Indexed searching capability
- ✅ Transactions and cursors
- ✅ No server needed

### Cons
- ❌ Complex API (promises, events)
- ❌ Verbose to implement
- ❌ Asynchronous only
- ❌ Browser compatibility issues (older browsers)

### Best For
- Storing uploaded CSV files
- Cached query results (large datasets)
- Offline file storage
- Application state

### Implementation Example

```javascript
// Open database
const request = indexedDB.open('DuckDBIDE', 1);

request.onupgradeneeded = (event) => {
    const db = event.target.result;
    db.createObjectStore('files', { keyPath: 'name' });
    db.createObjectStore('queries', { keyPath: 'id', autoIncrement: true });
};

// Save file
const db = await openDB();
const tx = db.transaction('files', 'readwrite');
tx.objectStore('files').put({ name: file.name, data: file, timestamp: Date.now() });

// Retrieve file
const tx = db.transaction('files', 'readonly');
const file = await tx.objectStore('files').get(fileName);
```

### Storage Limits
- **Chrome**: Unlimited (asks for permission at ~50MB)
- **Firefox**: Unlimited (asks at 50MB)
- **Safari**: ~1GB (no permission prompt)
- **Edge**: Same as Chrome

---

## Option 4: File System Access API (Modern Approach)

### Description
Allows web apps to read/write files and directories on user's device with explicit permission.

### Pros
- ✅ Direct file system access
- ✅ No storage limits
- ✅ User has full control
- ✅ Can edit files in place

### Cons
- ❌ Chrome/Edge only (limited support)
- ❌ Requires user permission each time
- ❌ More complex API
- ❌ Not for all use cases

### Best For
- Opening/saving files from local disk
- File explorer functionality
- Desktop-like experience

### Implementation Example

```javascript
// Open file picker
const [fileHandle] = await window.showOpenFilePicker({
    types: [{ description: 'CSV Files', accept: { 'text/csv': ['.csv'] } }]
});

// Read file
const file = await fileHandle.getFile();
const contents = await file.text();

// Save file (requires permission first time)
const writable = await fileHandle.createWritable();
await writable.write(contents);
await writable.close();
```

### Browser Support
- ✅ Chrome 86+
- ✅ Edge 86+
- ⚠️ Firefox (behind flag)
- ❌ Safari (not supported)

---

## Option 5: Remote Server Sessions (Backend Required)

### Description
Store session data on a remote server, accessed via API.

### Pros
- ✅ Sync across devices
- ✅ No storage limits
- ✅ Persistent backup
- ✅ User accounts & sharing

### Cons
- ❌ Requires backend server
- ❌ Internet connection needed
- ❌ Privacy concerns
- ❌ Complex implementation
- ❌ Hosting costs

### Best For
- Multi-device synchronization
- Collaborative features
- Cloud backup
- Sharing queries/results

### Implementation Example

```javascript
// Save session to server
await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        sessionId: 'user123',
        queries: queryHistory,
        preferences: userSettings
    })
});

// Load session from server
const response = await fetch('/api/sessions/user123');
const session = await response.json();
```

---

## Recommended Architecture for DuckDB WASM IDE

### Hybrid Approach

```
┌─────────────────────────────────────────────────────────────┐
│                    Storage Strategy                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  localStorage (5-10MB)                                        │
│  ├── Query history (last 100 queries)                        │
│  ├── User preferences (theme, font size)                     │
│  ├── Recent file names (not contents)                        │
│  └── Editor settings (word wrap, line numbers)               │
│                                                               │
│  sessionStorage (5-10MB, cleared on tab close)                │
│  ├── Current query state (auto-save)                         │
│  ├── Undo/redo stack (current session)                       │
│  └── Form data backup                                        │
│                                                               │
│  IndexedDB (50MB - several GB)                                │
│  ├── Cached CSV files (up to 100MB)                          │
│  ├── Query result cache                                      │
│  ├── Exported datasets                                       │
│  └── Large temporary data                                     │
│                                                               │
│  User's File System (File System Access API)                 │
│  ├── Open/edit local files directly                          │
│  ├── Save query results to disk                              │
│  └── Export functionality                                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Priority

### Phase 1: Basic localStorage (Quick Win)
- Query history persistence
- User preferences
- Recent files list
- **Effort**: 2-3 hours
- **Impact**: High

### Phase 2: IndexedDB for Caching (Performance)
- Cache uploaded files
- Store query results
- **Effort**: 4-6 hours
- **Impact**: Medium

### Phase 3: File System Access (Enhanced UX)
- Open/edit local files
- Save results to disk
- **Effort**: 3-4 hours
- **Impact**: Medium

### Phase 4: Remote Sessions (Advanced)
- User accounts
- Cloud sync
- **Effort**: 20-30 hours (requires backend)
- **Impact**: High (for multi-device users)

---

## Code Examples

### Session Manager Service

```javascript
class SessionManager {
    constructor() {
        this.storagePrefix = 'duckdb_ide_';
    }

    // Query History
    saveQuery(query) {
        const history = this.getQueryHistory();
        history.unshift({
            query,
            timestamp: Date.now(),
            id: Date.now()
        });
        // Keep only last 100
        if (history.length > 100) history.pop();
        localStorage.setItem(this.prefix('queries'), JSON.stringify(history));
    }

    getQueryHistory() {
        return JSON.parse(localStorage.getItem(this.prefix('queries')) || '[]');
    }

    // User Preferences
    savePreferences(prefs) {
        localStorage.setItem(this.prefix('prefs'), JSON.stringify(prefs));
    }

    getPreferences() {
        const defaults = { theme: 'light', fontSize: 14, wordWrap: true };
        const saved = JSON.parse(localStorage.getItem(this.prefix('prefs')) || '{}');
        return { ...defaults, ...saved };
    }

    // Recent Files
    addRecentFile(fileName) {
        const recent = JSON.parse(localStorage.getItem(this.prefix('recent')) || '[]');
        recent.unshift({ name: fileName, timestamp: Date.now() });
        if (recent.length > 10) recent.pop();
        localStorage.setItem(this.prefix('recent'), JSON.stringify(recent));
    }

    getRecentFiles() {
        return JSON.parse(localStorage.getItem(this.prefix('recent')) || '[]');
    }

    // Clear all session data
    clearAll() {
        Object.keys(localStorage)
            .filter(key => key.startsWith(this.storagePrefix))
            .forEach(key => localStorage.removeItem(key));
        sessionStorage.clear();
    }

    prefix(key) {
        return this.storagePrefix + key;
    }
}
```

### IndexedDB Wrapper for Large Files

```javascript
class FileCache {
    constructor() {
        this.dbName = 'DuckDBIDECache';
        this.storeName = 'files';
    }

    async saveFile(file, data) {
        const db = await this.open();
        const tx = db.transaction(this.storeName, 'readwrite');
        await tx.objectStore(this.storeName).put({
            name: file,
            data: data,
            timestamp: Date.now(),
            size: data.length
        });
    }

    async getFile(file) {
        const db = await this.open();
        const tx = db.transaction(this.storeName, 'readonly');
        return await tx.objectStore(this.storeName).get(file);
    }

    async deleteFile(file) {
        const db = await this.open();
        const tx = db.transaction(this.storeName, 'readwrite');
        await tx.objectStore(this.storeName).delete(file);
    }

    open() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 1);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}
```

---

## Security Considerations

### localStorage/sessionStorage
- ⚠️ Data accessible by any JavaScript on same domain
- ⚠️ Never store sensitive data (passwords, tokens)
- ⚠️ XSS vulnerability can expose all data
- ✅ Sanitize all data before storing

### IndexedDB
- ⚠️ Same security concerns as localStorage
- ⚠️ More attack surface due to complexity
- ✅ Better for binary data (less XSS risk)

### Best Practices
1. Always validate and sanitize data
2. Use JSON schema validation
3. Implement size limits
4. Provide "Clear All Data" button
5. Encrypt sensitive data (if absolutely necessary)
6. Use Content Security Policy (CSP)

---

## Testing Checklist

- [ ] Data persists across page refresh
- [ ] Data persists across browser restart
- [ ] Data survives clearing cache
- [ ] Works in private/incognito mode
- [ ] Handles quota exceeded gracefully
- [ ] Works offline
- [ ] Multiple tabs don't conflict
- [ ] Clear session works correctly
- [ ] Performance with large datasets
- [ ] Cross-browser compatibility

---

## Resources

- [MDN: Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [MDN: IndexedDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [MDN: File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [Storage Quotas](https://developer.chrome.com/docs/capabilities/storage)
- [Privacy & Security](https://web.dev/storage-for-the-web/)
