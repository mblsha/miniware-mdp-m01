import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/svelte';
import { writable, get } from 'svelte/store';
import { tick } from 'svelte';
import { 
  waitForStore, 
  StoreTestHarness,
  batchStoreUpdates,
  createMockStore
} from '../utils/store-helpers.js';
import { TestableSerialConnection } from '../mocks/testable-serial-connection.js';
import { scenario } from '../utils/test-scenario.js';

describe('Async Testing Examples', () => {
  
  describe('Store Testing Patterns', () => {
    it('should wait for store conditions', async () => {
      const count = writable(0);
      
      // Simulate async updates
      setTimeout(() => count.set(5), 50);
      setTimeout(() => count.set(10), 100);
      
      // Wait for specific value
      const result = await waitForStore(count, value => value === 10, { timeout: 200 });
      expect(result).toBe(10);
    });
    
    it('should track store history with harness', async () => {
      const harness = new StoreTestHarness();
      const userStore = writable({ name: 'Loading...', status: 'pending' });
      
      harness.addStore('user', userStore);
      
      // Simulate async user loading
      userStore.set({ name: 'Loading...', status: 'loading' });
      await tick();
      
      userStore.set({ name: 'John Doe', status: 'loaded' });
      await tick();
      
      // Check transitions
      const history = harness.getHistory('user');
      expect(history).toHaveLength(3); // initial + 2 updates
      expect(history[0].value.status).toBe('pending');
      expect(history[1].value.status).toBe('loading');
      expect(history[2].value.status).toBe('loaded');
      
      harness.cleanup();
    });
    
    it('should batch store updates', async () => {
      const store1 = writable(0);
      const store2 = writable('');
      const store3 = writable(false);
      
      let updateCount = 0;
      const unsubscribe = store1.subscribe(() => updateCount++);
      
      await batchStoreUpdates([
        () => store1.set(10),
        () => store2.set('hello'),
        () => store3.set(true)
      ]);
      
      expect(get(store1)).toBe(10);
      expect(get(store2)).toBe('hello');
      expect(get(store3)).toBe(true);
      
      unsubscribe();
    });
  });
  
  describe('Serial Connection Testing', () => {
    let serial;
    
    beforeEach(() => {
      serial = new TestableSerialConnection();
    });
    
    afterEach(() => {
      serial.clearTestState();
    });
    
    it('should process packets with auto-process mode', async () => {
      serial.setAutoProcess(true);
      
      const receivedPackets = [];
      serial.registerPacketHandler(0x15, (packet) => {
        receivedPackets.push(packet);
      });
      
      // Queue packet - will be processed automatically
      await serial.queuePacket([0x5A, 0x5A, 0x15, 0x07, 0xEE, 0x00, 0x10]);
      
      expect(receivedPackets).toHaveLength(1);
      expect(receivedPackets[0][6]).toBe(0x10); // Machine type
    });
    
    it('should process packets manually', async () => {
      serial.setAutoProcess(false);
      
      const receivedPackets = [];
      serial.registerPacketHandler(0x15, (packet) => {
        receivedPackets.push(packet);
      });
      
      // Queue multiple packets
      serial.queuePacket([0x5A, 0x5A, 0x15, 0x07, 0xEE, 0x00, 0x10]);
      serial.queuePacket([0x5A, 0x5A, 0x15, 0x07, 0xEE, 0x00, 0x11]);
      
      // Nothing processed yet
      expect(receivedPackets).toHaveLength(0);
      
      // Process all queued packets
      await serial.processQueue();
      
      expect(receivedPackets).toHaveLength(2);
      expect(receivedPackets[0][6]).toBe(0x10);
      expect(receivedPackets[1][6]).toBe(0x11);
    });
    
    it('should wait for specific packet type', async () => {
      serial.setAutoProcess(true);
      
      // Set up wait before sending packet
      const packetPromise = serial.waitForPacketType(0x11, 1000);
      
      // Send different packet first
      await serial.queuePacket([0x5A, 0x5A, 0x15, 0x07, 0xEE, 0x00, 0x10]);
      
      // Then send expected packet
      await serial.queuePacket([0x5A, 0x5A, 0x11, 0x9C, 0xEE, 0x00, ...new Array(150).fill(0)]);
      
      // Wait should resolve with the synthesize packet
      const packet = await packetPromise;
      expect(packet[2]).toBe(0x11);
    });
  });
  
  describe('Scenario Testing', () => {
    it('should run a simple scenario', async () => {
      let testValue = 0;
      
      await scenario()
        .given('initial value is 0', async (ctx) => {
          ctx.value = 0;
          expect(ctx.value).toBe(0);
        })
        .when('value is incremented', async (ctx) => {
          ctx.value += 5;
        })
        .then('value should be 5', async (ctx) => {
          expect(ctx.value).toBe(5);
          testValue = ctx.value;
        })
        .run();
        
      expect(testValue).toBe(5);
    });
    
    it('should handle async operations in scenarios', async () => {
      await scenario()
        .given('async data source', async (ctx) => {
          ctx.fetchData = () => new Promise(resolve => {
            setTimeout(() => resolve({ name: 'Test User' }), 50);
          });
        })
        .when('data is fetched', async (ctx) => {
          ctx.loading = true;
          ctx.data = await ctx.fetchData();
          ctx.loading = false;
        })
        .then('data should be available', async (ctx) => {
          expect(ctx.loading).toBe(false);
          expect(ctx.data.name).toBe('Test User');
        })
        .run();
    });
    
    it('should provide DOM helpers in scenarios', async () => {
      // Create a simple test component
      const TestComponent = {
        props: ['count'],
        $$prop_def: { count: 0 },
        create_fragment(ctx) {
          return {
            c: () => {},
            m: (target) => {
              const button = document.createElement('button');
              button.textContent = `Count: ${ctx[0]}`;
              button.onclick = () => ctx[1]();
              target.appendChild(button);
            },
            p: () => {},
            d: () => {}
          };
        },
        instance($$self, $$props) {
          let count = $$props.count || 0;
          const increment = () => count++;
          return [count, increment];
        }
      };
      
      await scenario()
        .given('component is rendered', async (ctx) => {
          // Mock component for simplicity
          const div = document.createElement('div');
          const button = document.createElement('button');
          button.textContent = 'Count: 0';
          button.onclick = () => {
            const current = parseInt(button.textContent.split(': ')[1]);
            button.textContent = `Count: ${current + 1}`;
          };
          div.appendChild(button);
          
          ctx.rendered = {
            container: div,
            getByText: (text) => {
              const elements = div.querySelectorAll('*');
              for (const el of elements) {
                if (el.textContent === text) return el;
              }
              throw new Error(`Unable to find element with text: ${text}`);
            }
          };
        })
        .when('button is clicked', async (ctx) => {
          const button = ctx.rendered.getByText('Count: 0');
          button.click();
        })
        .then('count should increment', async (ctx) => {
          const button = ctx.rendered.container.querySelector('button');
          expect(button.textContent).toBe('Count: 1');
        })
        .run();
    });
  });
  
  describe('Complex Async Flow Example', () => {
    it('should handle login flow with multiple async steps', async () => {
      // Mock services
      const authService = {
        login: vi.fn().mockImplementation(async (username, password) => {
          await new Promise(r => setTimeout(r, 50));
          if (username === 'test' && password === 'pass') {
            return { token: 'abc123', userId: 1 };
          }
          throw new Error('Invalid credentials');
        }),
        
        fetchUser: vi.fn().mockImplementation(async (token) => {
          await new Promise(r => setTimeout(r, 30));
          return { id: 1, name: 'Test User', email: 'test@example.com' };
        })
      };
      
      // Test harness for tracking state
      const harness = new StoreTestHarness();
      const appState = writable({ 
        status: 'idle',
        user: null,
        error: null 
      });
      
      harness.addStore('appState', appState);
      
      // Login function
      async function performLogin(username, password) {
        appState.update(s => ({ ...s, status: 'authenticating', error: null }));
        
        try {
          const auth = await authService.login(username, password);
          appState.update(s => ({ ...s, status: 'loading-user' }));
          
          const user = await authService.fetchUser(auth.token);
          appState.update(s => ({ 
            ...s, 
            status: 'authenticated',
            user 
          }));
          
          return { auth, user };
        } catch (error) {
          appState.update(s => ({ 
            ...s, 
            status: 'error',
            error: error.message 
          }));
          throw error;
        }
      }
      
      // Test the flow
      await scenario()
        .given('user is not logged in', async (ctx) => {
          ctx.harness = harness; // Pass harness to context
          const state = harness.getValue('appState');
          expect(state.status).toBe('idle');
          expect(state.user).toBeNull();
          
          ctx.performLogin = performLogin;
        })
        .when('user logs in with valid credentials', async (ctx) => {
          ctx.loginPromise = ctx.performLogin('test', 'pass');
        })
        .then('should show authenticating state', async (ctx) => {
          await ctx.harness.waitFor('appState', 
            state => state.status === 'authenticating',
            { timeout: 100 }
          );
        })
        .then('should show loading user state', async (ctx) => {
          await ctx.harness.waitFor('appState',
            state => state.status === 'loading-user',
            { timeout: 100 }
          );
        })
        .then('should complete login successfully', async (ctx) => {
          const result = await ctx.loginPromise;
          
          const finalState = await ctx.harness.waitFor('appState',
            state => state.status === 'authenticated',
            { timeout: 100 }
          );
          
          expect(finalState.user).toEqual({
            id: 1,
            name: 'Test User',
            email: 'test@example.com'
          });
          
          expect(authService.login).toHaveBeenCalledWith('test', 'pass');
          expect(authService.fetchUser).toHaveBeenCalledWith('abc123');
        })
        .cleanup(() => {
          harness.cleanup();
        })
        .run();
    });
  });
});