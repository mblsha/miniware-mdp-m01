import { writable, derived } from 'svelte/store';
import { channelStore } from './channels.js';

const WINDOW_DURATION_MS = 60 * 1000; // 1 minute
const CLEANUP_INTERVAL_MS = 5 * 1000; // Clean up every 5 seconds

export function createSparklineStore() {
  // Store for sparkline data by channel and metric
  // Structure: { [channel]: { [metric]: [{timestamp, value}] } }
  const sparklineData = writable({});
  
  let cleanupInterval;
  
  // Initialize cleanup interval
  function startCleanup() {
    if (cleanupInterval) return;
    
    cleanupInterval = setInterval(() => {
      const now = Date.now();
      const cutoffTime = now - WINDOW_DURATION_MS;
      
      sparklineData.update(data => {
        const newData = {};
        
        // Clean up old data points for all channels and metrics
        Object.keys(data).forEach(channel => {
          newData[channel] = {};
          Object.keys(data[channel]).forEach(metric => {
            newData[channel][metric] = data[channel][metric]
              .filter(point => point.timestamp >= cutoffTime);
          });
        });
        
        return newData;
      });
    }, CLEANUP_INTERVAL_MS);
  }
  
  // Stop cleanup interval
  function stopCleanup() {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
      cleanupInterval = null;
    }
  }
  
  // Add data point for a specific channel and metric
  function addDataPoint(channel, metric, value, timestamp = Date.now()) {
    sparklineData.update(data => {
      if (!data[channel]) {
        data[channel] = {};
      }
      if (!data[channel][metric]) {
        data[channel][metric] = [];
      }
      
      // Add new data point
      data[channel][metric].push({ timestamp, value });
      
      // Remove old data points beyond window
      const cutoffTime = timestamp - WINDOW_DURATION_MS;
      data[channel][metric] = data[channel][metric]
        .filter(point => point.timestamp >= cutoffTime);
      
      return data;
    });
  }
  
  // Get data for a specific channel and metric
  function getChannelMetricData(channel, metric) {
    return derived(sparklineData, ($data) => {
      if (!$data[channel] || !$data[channel][metric]) {
        return [];
      }
      return $data[channel][metric];
    });
  }
  
  // Clear all data
  function clear() {
    sparklineData.set({});
  }
  
  // Subscribe to channel updates to automatically populate sparkline data
  function subscribeToChannelUpdates() {
    return channelStore.channels.subscribe($channels => {
      $channels.forEach((channel, index) => {
        if (channel.online) {
          const now = Date.now();
          
          // Add voltage data point
          addDataPoint(index, 'voltage', channel.voltage, now);
          
          // Add current data point  
          addDataPoint(index, 'current', channel.current, now);
          
          // Calculate and add power data point
          const power = channel.voltage * channel.current;
          addDataPoint(index, 'power', power, now);
        }
      });
    });
  }
  
  // Start the store
  startCleanup();
  const unsubscribeChannels = subscribeToChannelUpdates();
  
  return {
    // Read-only access to data
    data: derived(sparklineData, $data => $data),
    
    // Methods
    addDataPoint,
    getChannelMetricData,
    clear,
    
    // Cleanup
    destroy: () => {
      stopCleanup();
      unsubscribeChannels();
    }
  };
}

// Global instance
export const sparklineStore = createSparklineStore();