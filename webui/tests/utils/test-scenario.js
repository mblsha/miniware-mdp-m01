import { render, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import { TestableSerialConnection } from '../mocks/testable-serial-connection.js';
import { StoreTestHarness, waitForAsyncUpdates } from './store-helpers.js';
import { createMockSerial, MockSerialPort } from '../mocks/serial-api.js';

/**
 * Declarative test scenario builder for complex async flows
 */
export class TestScenario {
  constructor() {
    this.steps = [];
    this.context = {
      serial: null,
      mockSerial: null,
      rendered: null,
      component: null,
      storeHarness: new StoreTestHarness(),
      cleanup: []
    };
  }
  
  /**
   * Setup initial conditions
   */
  given(description, setupFn) {
    this.steps.push({
      type: 'given',
      description,
      fn: setupFn
    });
    return this;
  }
  
  /**
   * Perform actions
   */
  when(description, actionFn) {
    this.steps.push({
      type: 'when',
      description,
      fn: actionFn
    });
    return this;
  }
  
  /**
   * Assert outcomes
   */
  then(description, assertFn) {
    this.steps.push({
      type: 'then',
      description,
      fn: assertFn
    });
    return this;
  }
  
  /**
   * Add cleanup step
   */
  cleanup(cleanupFn) {
    this.context.cleanup.push(cleanupFn);
    return this;
  }
  
  /**
   * Run the scenario
   */
  async run() {
    console.log('🎬 Starting scenario');
    
    try {
      // Initialize context
      await this._initializeContext();
      
      // Run all steps
      for (const step of this.steps) {
        console.log(`${this._getStepIcon(step.type)} ${step.description}`);
        
        const startTime = Date.now();
        await step.fn(this.context);
        await waitForAsyncUpdates();
        
        const duration = Date.now() - startTime;
        console.log(`   ✓ Completed in ${duration}ms`);
      }
      
      console.log('✅ Scenario completed successfully');
      
    } catch (error) {
      console.error('❌ Scenario failed:', error);
      throw error;
      
    } finally {
      await this._cleanup();
    }
  }
  
  /**
   * Initialize test context
   */
  async _initializeContext() {
    // Create mock serial API
    this.context.mockSerial = createMockSerial();
    global.navigator.serial = this.context.mockSerial;
    
    // Create testable serial connection
    this.context.serial = new TestableSerialConnection();
    this.context.serial.setAutoProcess(true);
    
    // Helper methods
    this.context.render = (Component, props = {}) => {
      const result = render(Component, props);
      this.context.rendered = result;
      this.context.component = result.component;
      return result;
    };
    
    this.context.waitFor = async (condition, options = {}) => {
      const { timeout = 1000, interval = 10 } = options;
      const startTime = Date.now();
      
      while (Date.now() - startTime < timeout) {
        try {
          const result = await condition();
          if (result !== false) return result;
        } catch (e) {
          // Ignore errors and keep trying
        }
        
        await new Promise(resolve => setTimeout(resolve, interval));
        await tick();
      }
      
      throw new Error(`Condition not met within ${timeout}ms`);
    };
    
    // Quick access to rendered elements
    Object.defineProperty(this.context, 'container', {
      get: () => this.context.rendered?.container
    });
    
    Object.defineProperty(this.context, 'getByText', {
      get: () => this.context.rendered?.getByText
    });
    
    Object.defineProperty(this.context, 'getByTestId', {
      get: () => this.context.rendered?.getByTestId
    });
    
    Object.defineProperty(this.context, 'queryByText', {
      get: () => this.context.rendered?.queryByText
    });
  }
  
  /**
   * Clean up after scenario
   */
  async _cleanup() {
    console.log('🧹 Cleaning up');
    
    // Run custom cleanup functions
    for (const cleanupFn of this.context.cleanup) {
      await cleanupFn(this.context);
    }
    
    // Clean up serial connection
    if (this.context.serial) {
      this.context.serial.stopHeartbeat();
      this.context.serial.clearPacketHandlers();
      this.context.serial.clearTestState();
      
      try {
        await this.context.serial.disconnect();
      } catch (e) {
        // Ignore disconnect errors during cleanup
      }
    }
    
    // Clean up store harness
    this.context.storeHarness.cleanup();
    
    // Unmount component
    if (this.context.rendered?.unmount) {
      this.context.rendered.unmount();
    }
  }
  
  /**
   * Get icon for step type
   */
  _getStepIcon(type) {
    switch (type) {
      case 'given': return '📋';
      case 'when': return '🎯';
      case 'then': return '✔️';
      default: return '•';
    }
  }
}

/**
 * Factory function to create a new test scenario
 */
export function createTestScenario() {
  return new TestScenario();
}

/**
 * Common scenario patterns
 */
export const CommonScenarios = {
  /**
   * Connected device scenario
   */
  connectedDevice: (options = {}) => {
    return createTestScenario()
      .given('a connected device', async (ctx) => {
        const mockPort = ctx.mockSerial.createPort();
        ctx.mockSerial.setNextPort(mockPort);
        ctx.mockPort = mockPort;
        
        await ctx.serial.simulateConnection({
          machineType: options.machineType || 0x10,
          channels: options.channels || 6,
          initialChannelData: options.channelData || {}
        });
      });
  },
  
  /**
   * Channel selection scenario
   */
  channelSelection: (channelIndex) => {
    return createTestScenario()
      .when(`channel ${channelIndex + 1} is selected`, async (ctx) => {
        const channelCard = ctx.getByText(`Channel ${channelIndex + 1}`)
          .closest('.channel-card');
        
        await fireEvent.pointerDown(channelCard);
      await fireEvent.pointerUp(channelCard);
        await waitForAsyncUpdates();
      });
  },
  
  /**
   * Packet reception scenario
   */
  packetReception: (packet) => {
    return createTestScenario()
      .when('packet is received', async (ctx) => {
        await ctx.serial.queuePacket(packet);
        await ctx.serial.waitForProcessing();
      });
  }
};

/**
 * Test scenario builder with fluent API
 */
export class ScenarioBuilder {
  constructor() {
    this.scenarios = [];
  }
  
  /**
   * Add a scenario
   */
  add(scenario) {
    this.scenarios.push(scenario);
    return this;
  }
  
  /**
   * Combine multiple scenarios
   */
  combine() {
    const combined = createTestScenario();
    
    for (const scenario of this.scenarios) {
      for (const step of scenario.steps) {
        combined.steps.push(step);
      }
      
      // Merge cleanup
      if (scenario.context.cleanup.length > 0) {
        combined.context.cleanup.push(...scenario.context.cleanup);
      }
    }
    
    return combined;
  }
  
  /**
   * Run all scenarios in sequence
   */
  async runSequence() {
    for (let i = 0; i < this.scenarios.length; i++) {
      console.log(`\n📍 Running scenario ${i + 1}/${this.scenarios.length}`);
      await this.scenarios[i].run();
    }
  }
}

// Export factory functions
export function scenario() {
  return createTestScenario();
}

export function scenarioBuilder() {
  return new ScenarioBuilder();
}