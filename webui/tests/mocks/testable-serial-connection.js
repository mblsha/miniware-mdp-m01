import { writable, derived } from 'svelte/store';
import { TestSerialConnection } from './test-serial-connection.js';
import { tick } from 'svelte';

/**
 * Enhanced TestSerialConnection with better async testing support
 * Provides both automatic and manual packet processing modes
 */
export class TestableSerialConnection extends TestSerialConnection {
  constructor() {
    super();
    this.testQueue = [];
    this.autoProcess = false;
    this.processPromises = [];
    this.packetLog = [];
    this.eventLog = [];
  }

  /**
   * Enable/disable automatic packet processing
   * When enabled, packets are processed immediately when queued
   */
  setAutoProcess(enabled) {
    this.autoProcess = enabled;
    if (enabled && this.testQueue.length > 0) {
      this.processQueue();
    }
  }

  /**
   * Queue a packet for processing
   * If autoProcess is enabled, processes immediately
   */
  queuePacket(packet) {
    this.testQueue.push(packet);
    this.packetLog.push({ 
      type: 'queued', 
      packet: Array.from(packet),
      timestamp: Date.now() 
    });
    
    if (this.autoProcess) {
      return this.processQueue();
    }
    return Promise.resolve();
  }

  /**
   * Queue multiple packets at once
   */
  queuePackets(packets) {
    const promises = packets.map(packet => this.queuePacket(packet));
    return Promise.all(promises);
  }

  /**
   * Process all queued packets synchronously
   * Ensures each packet is fully processed before the next
   */
  async processQueue() {
    const promise = this._processQueueInternal();
    this.processPromises.push(promise);
    return promise;
  }

  async _processQueueInternal() {
    while (this.testQueue.length > 0) {
      const packet = this.testQueue.shift();
      
      // Add to receive buffer as if it came from serial
      this.receiveBuffer.push(...packet);
      
      // Process the buffer
      this.processBuffer();
      
      // Allow Svelte reactive updates
      await tick();
      
      // Log processing
      this.packetLog.push({
        type: 'processed',
        packet: Array.from(packet),
        timestamp: Date.now()
      });
    }
  }

  /**
   * Wait for all packet processing to complete
   */
  async waitForProcessing() {
    await Promise.all(this.processPromises);
    this.processPromises = [];
    await tick();
  }

  /**
   * Simulate a complete connection flow with initial packets
   */
  async simulateConnection(options = {}) {
    const {
      machineType = 0x10,
      channels = 6,
      initialChannelData = {}
    } = options;

    // Connect
    await this.connect();
    await tick();

    // Send machine type packet
    if (machineType !== null) {
      const machinePacket = [0x5A, 0x5A, 0x15, 0x07, 0xEE, 0x00, machineType];
      await this.queuePacket(machinePacket);
    }

    // Send initial synthesize packet
    if (channels > 0) {
      const channelData = [];
      for (let i = 0; i < channels; i++) {
        const data = {
          online: 1,
          voltage: 0,
          current: 0,
          temperature: 250,
          isOutput: 0,
          machineType: 0,
          ...initialChannelData[i]
        };
        channelData.push(data);
      }
      
      // Create synthesize packet
      const packet = this._createSynthesizePacket(channelData);
      await this.queuePacket(packet);
    }

    await this.waitForProcessing();
  }

  /**
   * Helper to create synthesize packet
   */
  _createSynthesizePacket(channelData) {
    const packet = [0x5A, 0x5A, 0x11, 156, 0xEE, 0x00];
    const data = [];
    
    for (let i = 0; i < 6; i++) {
      const ch = channelData[i] || {
        online: 0,
        voltage: 0,
        current: 0,
        temperature: 0,
        isOutput: 0,
        machineType: 0
      };
      
      // Build channel data (25 bytes per channel)
      data.push(i); // channel number
      data.push(ch.voltage & 0xFF, (ch.voltage >> 8) & 0xFF); // voltage
      data.push(ch.current & 0xFF, (ch.current >> 8) & 0xFF); // current
      data.push(0, 0); // in voltage
      data.push(0, 0); // in current  
      data.push(ch.voltage & 0xFF, (ch.voltage >> 8) & 0xFF); // set voltage
      data.push(ch.current & 0xFF, (ch.current >> 8) & 0xFF); // set current
      data.push(ch.temperature & 0xFF, (ch.temperature >> 8) & 0xFF); // temperature
      data.push(ch.online);
      data.push(ch.machineType);
      data.push(0); // lock
      data.push(0); // mode
      data.push(ch.isOutput);
      data.push(0, 0, 0); // color
      data.push(0); // error
      data.push(0xFF); // end marker
    }
    
    // Calculate checksum
    let checksum = 0;
    for (const byte of data) {
      checksum ^= byte;
    }
    packet[5] = checksum;
    
    return new Uint8Array([...packet, ...data]);
  }

  /**
   * Simulate disconnection with proper error handling
   */
  async simulateDisconnect() {
    this.eventLog.push({ type: 'disconnect', timestamp: Date.now() });
    
    if (this.port && this.port.readable.reader) {
      this.port.simulateDisconnect();
    }
    
    // Process any error
    await this.triggerPacketProcessing();
    await tick();
  }

  /**
   * Get packet history for debugging
   */
  getPacketHistory() {
    return this.packetLog;
  }

  /**
   * Clear all test state
   */
  clearTestState() {
    this.testQueue = [];
    this.processPromises = [];
    this.packetLog = [];
    this.eventLog = [];
    this.receiveBuffer = [];
  }

  /**
   * Wait for a specific packet type to be handled
   */
  waitForPacketType(packetType, timeout = 1000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.packetHandlers.delete(packetType);
        reject(new Error(`Timeout waiting for packet type 0x${packetType.toString(16)}`));
      }, timeout);

      const originalHandler = this.packetHandlers.get(packetType);
      
      this.packetHandlers.set(packetType, (packet) => {
        clearTimeout(timeoutId);
        
        // Restore original handler
        if (originalHandler) {
          this.packetHandlers.set(packetType, originalHandler);
          originalHandler(packet);
        } else {
          this.packetHandlers.delete(packetType);
        }
        
        resolve(packet);
      });
    });
  }
}

// Export singleton for tests that need it
export const testableSerialConnection = new TestableSerialConnection();