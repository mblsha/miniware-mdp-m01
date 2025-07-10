# MDP-WebUI Comprehensive Testing Plan

## Option 1: Vitest + Svelte Testing Library (Recommended)

### Setup
```bash
npm install -D vitest @testing-library/svelte @testing-library/jest-dom @testing-library/user-event jsdom @vitest/coverage-v8
```

### Test Structure

```
tests/
├── unit/
│   ├── serial.test.js          # Serial connection logic
│   ├── packet-encoder.test.js  # Packet encoding functions
│   ├── packet-decoder.test.js  # Packet decoding with Kaitai
│   └── stores/
│       └── channels.test.js    # Channel store logic
├── components/
│   ├── App.test.js            # Main app component
│   ├── Dashboard.test.js      # Dashboard component
│   ├── ChannelCard.test.js   # Channel card component
│   ├── ChannelDetail.test.js # Channel detail view
│   └── WaveformChart.test.js # Chart component
├── integration/
│   ├── serial-flow.test.js   # Full serial communication flow
│   └── recording-flow.test.js # Recording and export flow
└── mocks/
    ├── serial-api.js         # Web Serial API mock
    ├── packet-data.js        # Sample packet data
    └── kaitai-mock.js        # Kaitai parser mock
```

### Mock Data Strategy

#### 1. Web Serial API Mock
```javascript
// tests/mocks/serial-api.js
export class MockSerialPort {
  constructor() {
    this.readable = new MockReadableStream();
    this.writable = new MockWritableStream();
    this.opened = false;
  }
  
  async open(config) {
    this.opened = true;
    return Promise.resolve();
  }
  
  async close() {
    this.opened = false;
    return Promise.resolve();
  }
}

export class MockSerial {
  async requestPort() {
    return new MockSerialPort();
  }
}
```

#### 2. Packet Data Fixtures
```javascript
// tests/mocks/packet-data.js
export const mockPackets = {
  synthesize: new Uint8Array([
    0x5A, 0x5A, 0x11, 0x9C, 0x00, 0xA5,
    // Channel 0 data (25 bytes)
    0x01, // online
    0x01, // machine type (P906)
    0xE4, 0x0C, // voltage (3300mV)
    0xF4, 0x01, // current (500mA)
    // ... rest of channel data
  ]),
  
  wave: new Uint8Array([
    0x5A, 0x5A, 0x12, 0x7E, 0x00, 0xB2,
    // 10 groups of timestamp + 2 data points
    // ... wave data
  ]),
  
  machine: new Uint8Array([
    0x5A, 0x5A, 0x15, 0x07, 0xEE, 0x00, 0x10 // M01 with LCD
  ])
};
```

### Testing Categories

#### 1. Unit Tests (40% of coverage)

**Serial Connection Tests:**
- Connection establishment with mock port
- Disconnection handling
- Error scenarios (port not available, connection lost)
- Packet buffer processing
- Heartbeat timer management

**Packet Encoder Tests:**
- Each packet creation function with valid inputs
- Checksum calculation verification
- Invalid parameter handling
- Boundary value testing

**Packet Decoder Tests:**
- Decoding each packet type from mock data
- Handling malformed packets
- Data transformation accuracy
- Kaitai integration testing

**Store Tests:**
- Initial state verification
- Action dispatching
- State updates from packets
- Recording state management

#### 2. Component Tests (40% of coverage)

**App Component:**
- Connection button states
- View switching logic
- Error display
- Device type display

**Dashboard Component:**
- Channel grid rendering
- Active channel highlighting
- Click event handling
- Data binding from store

**Channel Detail Component:**
- Control rendering based on machine type
- Input validation
- Recording button states
- Export functionality
- Back navigation

**WaveformChart Component:**
- Chart initialization
- Data updates during recording
- Pan/zoom interactions (simulated)
- Empty state handling

#### 3. Integration Tests (20% of coverage)

**Serial Communication Flow:**
- Connect → Get Machine → Receive Synthesize → Update UI
- Send command → Receive response → Update state
- Error recovery scenarios
- Reconnection handling

**Recording Flow:**
- Start recording → Receive wave packets → Stop → Export
- Large dataset handling
- Memory management
- Export file generation

### Test Implementation Examples

#### Unit Test Example
```javascript
// tests/unit/packet-encoder.test.js
import { describe, it, expect } from 'vitest';
import { createSetVoltagePacket, createHeartbeatPacket } from '../../src/lib/packet-encoder.js';

describe('Packet Encoder', () => {
  describe('createSetVoltagePacket', () => {
    it('should create valid voltage packet', () => {
      const packet = createSetVoltagePacket(0, 3.3, 0.5);
      expect(packet).toEqual([
        0x5A, 0x5A, 0x1A, 0x0A, 0x00, 0xB8,
        0xE4, 0x0C, // 3300mV
        0xF4, 0x01  // 500mA
      ]);
    });
    
    it('should handle maximum values', () => {
      const packet = createSetVoltagePacket(5, 30, 5);
      expect(packet[2]).toBe(0x1A); // packet type
      expect(packet[4]).toBe(5);    // channel
    });
  });
});
```

#### Component Test Example
```javascript
// tests/components/ChannelCard.test.js
import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import ChannelCard from '../../src/lib/components/ChannelCard.svelte';

describe('ChannelCard', () => {
  const mockChannel = {
    channel: 0,
    online: true,
    machineType: 'P906',
    voltage: 3.3,
    current: 0.5,
    power: 1.65,
    temperature: 25.5,
    isOutput: true,
    mode: 'CV'
  };
  
  it('should display channel information', () => {
    const { getByText } = render(ChannelCard, {
      props: { channel: mockChannel, active: false }
    });
    
    expect(getByText('Channel 1')).toBeInTheDocument();
    expect(getByText('3.300 V')).toBeInTheDocument();
    expect(getByText('0.500 A')).toBeInTheDocument();
    expect(getByText('1.650 W')).toBeInTheDocument();
    expect(getByText('25.5 °C')).toBeInTheDocument();
  });
  
  it('should emit click event', async () => {
    const { component, container } = render(ChannelCard, {
      props: { channel: mockChannel, active: false }
    });
    
    const clicked = vi.fn();
    component.$on('click', clicked);
    
    await fireEvent.click(container.querySelector('.channel-card'));
    expect(clicked).toHaveBeenCalled();
  });
});
```

### Coverage Goals

1. **Line Coverage: 100%**
   - Every line of code executed at least once
   - Including error handling paths

2. **Branch Coverage: 100%**
   - All if/else branches tested
   - All switch cases covered

3. **Function Coverage: 100%**
   - Every function called with various inputs

4. **Statement Coverage: 100%**
   - All statements executed

### Edge Cases to Test

1. **Serial Connection:**
   - Port already in use
   - Device disconnected during operation
   - Malformed packets
   - Partial packet reception
   - Buffer overflow scenarios

2. **Data Handling:**
   - Maximum recording duration
   - Large waveform datasets (10,000+ points)
   - Rapid channel switching
   - Concurrent operations

3. **UI Interactions:**
   - Rapid clicking
   - Invalid input values
   - Browser compatibility issues
   - Window resizing during chart display

## Option 2: Jest + Svelte Testing Library

### Pros:
- Mature ecosystem
- Extensive documentation
- Built-in mocking
- Familiar to most developers

### Cons:
- Requires additional configuration for ESM
- Slower than Vitest
- May need babel transforms

### Setup:
```bash
npm install -D jest @testing-library/svelte @testing-library/jest-dom svelte-jester babel-jest @babel/preset-env
```

### Configuration:
```javascript
// jest.config.js
export default {
  transform: {
    '^.+\\.svelte$': 'svelte-jester',
    '^.+\\.js$': 'babel-jest',
  },
  moduleFileExtensions: ['js', 'svelte'],
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['@testing-library/jest-dom/extend-expect'],
  moduleNameMapper: {
    '^\\$lib/(.*)$': '<rootDir>/src/lib/$1'
  }
};
```

## Option 3: Playwright Component Testing

### Pros:
- Real browser testing
- Visual regression testing
- Cross-browser support
- Excellent debugging tools

### Cons:
- Heavier setup
- Slower execution
- Better suited for e2e than unit tests

### Setup:
```bash
npm install -D @playwright/experimental-ct-svelte
```

### Example:
```javascript
// tests/components/Dashboard.spec.js
import { test, expect } from '@playwright/experimental-ct-svelte';
import Dashboard from '../../src/lib/components/Dashboard.svelte';

test('dashboard renders all channels', async ({ mount }) => {
  const component = await mount(Dashboard);
  const cards = await component.locator('.channel-card').all();
  expect(cards).toHaveLength(6);
});
```

## Option 4: Hybrid Approach (Best Coverage)

Combine multiple tools for optimal coverage:

1. **Vitest** for unit tests (70%)
   - Fast execution for TDD
   - Logic and utility testing

2. **Playwright CT** for component tests (20%)
   - Visual regression
   - Complex interactions

3. **Playwright E2E** for integration tests (10%)
   - Full user flows
   - Real browser behavior

### Implementation Timeline

1. **Week 1:** Setup and unit tests
   - Configure Vitest
   - Write serial module tests
   - Write encoder/decoder tests

2. **Week 2:** Component tests
   - Test all UI components
   - Mock store interactions
   - Test event handling

3. **Week 3:** Integration tests
   - Full flow testing
   - Edge case coverage
   - Performance tests

4. **Week 4:** Coverage optimization
   - Identify gaps
   - Add missing tests
   - Documentation

### CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
```

### Monitoring Test Quality

1. **Coverage Reports:**
   - Use `vitest --coverage`
   - Set minimum thresholds
   - Track trends over time

2. **Mutation Testing:**
   - Use Stryker for mutation testing
   - Ensure tests catch bugs

3. **Performance Benchmarks:**
   - Track test execution time
   - Optimize slow tests

### Best Practices

1. **Test Organization:**
   - One test file per source file
   - Clear test descriptions
   - Arrange-Act-Assert pattern

2. **Mock Management:**
   - Centralized mock definitions
   - Reusable test fixtures
   - Mock only external dependencies

3. **Continuous Testing:**
   - Watch mode during development
   - Pre-commit hooks
   - Automated CI runs