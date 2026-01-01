import { get, writable, derived } from 'svelte/store';
import { tick } from 'svelte';
import { vi } from 'vitest';

/**
 * Wait for a store to meet a condition
 * @param {import('svelte/store').Readable} store - The store to watch
 * @param {Function} predicate - Function that returns true when condition is met
 * @param {Object} options - Options
 * @param {number} options.timeout - Maximum time to wait in milliseconds
 * @param {number} options.interval - Check interval in milliseconds
 * @returns {Promise} Resolves with store value when condition is met
 */
export async function waitForStore(store, predicate, options = {}) {
  const { timeout = 1000, interval = 10 } = options;
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    let unsubscribe;
    let intervalId;
    
    const cleanup = () => {
      if (unsubscribe) unsubscribe();
      if (intervalId) clearInterval(intervalId);
    };
    
    const check = () => {
      const value = get(store);
      
      if (predicate(value)) {
        cleanup();
        resolve(value);
        return true;
      }
      
      if (Date.now() - startTime > timeout) {
        cleanup();
        reject(new Error(`Store condition timeout after ${timeout}ms. Last value: ${JSON.stringify(value)}`));
        return true;
      }
      
      return false;
    };
    
    // Check immediately
    if (check()) return;
    
    // Subscribe to changes
    unsubscribe = store.subscribe(() => {
      tick().then(() => check());
    });
    
    // Also check periodically in case subscription doesn't fire
    intervalId = setInterval(check, interval);
  });
}

/**
 * Wait for multiple stores to meet conditions
 * @param {Array<{store: import('svelte/store').Readable, predicate: Function}>} conditions
 * @param {Object} options - Options
 * @returns {Promise<Array>} Resolves with all store values when conditions are met
 */
export async function waitForStores(conditions, options = {}) {
  const promises = conditions.map(({ store, predicate }) => 
    waitForStore(store, predicate, options)
  );
  
  return Promise.all(promises);
}

/**
 * Create a store that logs all updates
 * Useful for debugging test failures
 */
export function createLoggingStore(name, initialValue) {
  const { subscribe, set, update } = writable(initialValue);
  const log = [];
  
  return {
    subscribe,
    set: (value) => {
      log.push({ 
        type: 'set', 
        value, 
        timestamp: Date.now(),
        stack: new Error().stack 
      });
      console.log(`[${name}] set:`, value);
      set(value);
    },
    update: (fn) => {
      update(currentValue => {
        const newValue = fn(currentValue);
        log.push({ 
          type: 'update', 
          oldValue: currentValue,
          newValue, 
          timestamp: Date.now(),
          stack: new Error().stack 
        });
        console.log(`[${name}] update:`, currentValue, '->', newValue);
        return newValue;
      });
    },
    getLog: () => log,
    clearLog: () => { log.length = 0; }
  };
}

/**
 * Create a controllable derived store
 * Allows manual updates in tests
 */
export function createControllableDerived(stores, fn, initialValue) {
  let manualValue = undefined;
  let useManual = false;
  
  const derivedStore = derived(
    stores,
    ($stores) => useManual ? manualValue : fn($stores),
    initialValue
  );
  
  return {
    subscribe: derivedStore.subscribe,
    setManual: (value) => {
      manualValue = value;
      useManual = true;
      // Force update
      const dummy = writable(0);
      dummy.update(n => n + 1);
    },
    setAuto: () => {
      useManual = false;
      const dummy = writable(0);
      dummy.update(n => n + 1);
    }
  };
}

/**
 * Batch store updates and wait for all to complete
 * Ensures all reactive updates are processed
 */
export async function batchStoreUpdates(updates) {
  // Execute all updates
  for (const update of updates) {
    await update();
  }
  
  // Wait for Svelte to process
  await tick();
  
  // Additional microtask to ensure derived stores update
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Create a test harness for store testing
 */
export class StoreTestHarness {
  constructor() {
    this.stores = new Map();
    this.subscriptions = [];
  }
  
  /**
   * Register a store for monitoring
   */
  addStore(name, store) {
    const history = [];
    
    const unsubscribe = store.subscribe(value => {
      history.push({
        value: structuredClone(value),
        timestamp: Date.now()
      });
    });
    
    this.subscriptions.push(unsubscribe);
    this.stores.set(name, { store, history });
    
    return this;
  }
  
  /**
   * Get store history
   */
  getHistory(name) {
    return this.stores.get(name)?.history || [];
  }
  
  /**
   * Get current store value
   */
  getValue(name) {
    const storeInfo = this.stores.get(name);
    if (!storeInfo) return undefined;
    
    return get(storeInfo.store);
  }
  
  /**
   * Wait for a specific store state
   */
  async waitFor(name, predicate, timeout = 1000) {
    const storeInfo = this.stores.get(name);
    if (!storeInfo) throw new Error(`Store '${name}' not found`);
    
    return waitForStore(storeInfo.store, predicate, { timeout });
  }
  
  /**
   * Assert store transitions
   */
  assertTransitions(name, expectedTransitions) {
    const history = this.getHistory(name);
    const actualTransitions = history.map(h => h.value);
    
    expect(actualTransitions).toEqual(expectedTransitions);
  }
  
  /**
   * Clean up subscriptions
   */
  cleanup() {
    this.subscriptions.forEach(unsub => unsub());
    this.subscriptions = [];
    this.stores.clear();
  }
}

/**
 * Helper to wait for next tick and microtask
 */
export async function waitForAsyncUpdates() {
  await tick();
  await new Promise(resolve => setTimeout(resolve, 0));
}

/**
 * Create a mock store that can be controlled in tests
 */
export function createMockStore(initialValue) {
  const { subscribe, set, update } = writable(initialValue);
  const setters = [];
  const updates = [];
  
  return {
    subscribe,
    set: vi.fn((value) => {
      setters.push(value);
      set(value);
    }),
    update: vi.fn((fn) => {
      updates.push(fn);
      update(fn);
    }),
    // Test helpers
    mockSetValue: (value) => set(value),
    getSetterCalls: () => setters,
    getUpdateCalls: () => updates,
    reset: () => {
      setters.length = 0;
      updates.length = 0;
      set(initialValue);
    }
  };
}