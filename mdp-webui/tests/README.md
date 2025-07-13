# Test Suite Import Patterns

This document explains the import patterns used in the test suite and when to use each approach.

## Import Guidelines

### 1. Regular Test Imports - Use `$lib` Alias
```javascript
import { channelStore } from '$lib/stores/channels.js';
import { createSetVoltagePacket } from '$lib/packet-encoder.js';
```

### 2. Inside vi.mock() Factories - Use Relative Paths
```javascript
vi.mock('$lib/stores/channels.js', () => {
  // Must use require() with relative paths inside mock factories
  const { createSetChannelPacket } = require('../../src/lib/packet-encoder');
  return { /* mock implementation */ };
});
```

### 3. Hoisted Variables - Use require() with Relative Paths
```javascript
const packetEncoders = vi.hoisted(() => {
  const { createSetChannelPacket } = require('../../src/lib/packet-encoder');
  return { createSetChannelPacket };
});
```

### 4. Dynamic Imports in Tests - Can Use `$lib`
```javascript
beforeEach(async () => {
  vi.resetModules();
  // Dynamic imports can use $lib alias
  const { channelStore } = await import('$lib/stores/channels.js');
});
```

## Why These Patterns?

- **vi.mock() is hoisted**: Mock factories run before any imports, so they can't access imported values
- **require() doesn't understand Vite aliases**: Inside mock factories, we must use Node.js require() which doesn't know about `$lib`
- **Dynamic imports respect Vite config**: When using `await import()` in test code, Vite's alias resolution works normally

## Best Practices

1. **Prefer top-level imports** with `$lib` alias when possible
2. **Use hoisted helpers** when you need to share code between mocks and tests
3. **Keep mock factories simple** - extract complex logic to hoisted functions
4. **Document why** you're using dynamic imports (e.g., for module reinitialization)