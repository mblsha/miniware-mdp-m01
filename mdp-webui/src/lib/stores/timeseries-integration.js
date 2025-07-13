/**
 * Integration module for timeseries store with packet handlers
 * This shows how to connect the timeseries store to the existing packet processing
 */

import { timeseriesStore } from './timeseries.js';
import { channelStore } from './channels.js';
import { serialConnection } from '../serial.js';
import { get } from 'svelte/store';

/**
 * Initialize timeseries integration with packet handlers
 */
export function initializeTimeseriesIntegration() {
  // Register synthesize packet handler for timeseries logging
  serialConnection.registerPacketHandler(0x11, (packet) => {
    const activeSession = get(timeseriesStore.activeSession);
    if (!activeSession) return;
    
    // Process synthesize packet data
    const decoder = serialConnection.getDecoder();
    const parsedData = decoder.decodeSynthesize(packet);
    
    if (parsedData && parsedData.data && parsedData.data.channels) {
      const timestamp = Date.now();
      const points = [];
      
      parsedData.data.channels.forEach((channelData, index) => {
        // Only record channels that are in the active session
        if (activeSession.channels.has(index)) {
          points.push({
            channel: index,
            timestamp,
            data: {
              voltage: channelData.outVoltage,
              current: channelData.outCurrent,
              temperature: channelData.temperature,
              mode: channelData.statusLoad || channelData.statusPsu || 'Normal',
              isOutput: channelData.outputOn !== 0
            }
          });
        }
      });
      
      // Add all points in batch for efficiency
      if (points.length > 0) {
        timeseriesStore.addDataPoints(points);
      }
    }
  });
  
  // Register wave packet handler for high-frequency data
  serialConnection.registerPacketHandler(0x12, (packet) => {
    const activeSession = get(timeseriesStore.activeSession);
    if (!activeSession) return;
    
    // Get the channel from packet header
    const channel = packet[4];
    if (!activeSession.channels.has(channel)) return;
    
    // Process wave packet data
    const decoder = serialConnection.getDecoder();
    const parsedData = decoder.decodeWave(packet);
    
    if (parsedData && parsedData.data && parsedData.data.groups) {
      const points = [];
      
      parsedData.data.groups.forEach(group => {
        if (group.items) {
          group.items.forEach((item, index) => {
            points.push({
              channel,
              timestamp: group.timestamp + index * 10, // 10ms between points
              data: {
                voltage: item.voltage,
                current: item.current
              }
            });
          });
        }
      });
      
      // Add all points in batch
      if (points.length > 0) {
        timeseriesStore.addDataPoints(points);
      }
    }
  });
}

/**
 * Start a new recording session for specified channels
 * @param {Array<number>} channels - Channel numbers to record
 * @returns {string} Session ID
 */
export function startRecording(channels) {
  // Create new session
  const sessionId = timeseriesStore.createSession(channels);
  
  // Update channel store recording state
  channels.forEach(channel => {
    channelStore.startRecording(channel);
  });
  
  return sessionId;
}

/**
 * Stop the current recording session
 */
export function stopRecording() {
  const activeSession = get(timeseriesStore.activeSession);
  if (!activeSession) return;
  
  // Update channel store recording state
  const channelData = get(channelStore.channels);
  channelData.forEach((ch, index) => {
    if (ch.recording) {
      channelStore.stopRecording(index);
    }
  });
  
  // Close the session
  timeseriesStore.closeSession(activeSession.id);
}

/**
 * Export session data to CSV format
 * @param {string} sessionId - Session ID to export
 * @param {Array<number>} channels - Channels to include (null for all)
 * @returns {string} CSV data
 */
export function exportSessionToCSV(sessionId = null, channels = null) {
  const targetSessionId = sessionId || get(timeseriesStore.activeSession)?.id;
  if (!targetSessionId) return '';
  
  const sessions = get(timeseriesStore.sessionList);
  const session = sessions.find(s => s.id === targetSessionId);
  if (!session) return '';
  
  // Get all data for the session
  const data = timeseriesStore.getDataRange(
    session.metadata.minTimestamp || session.startTime,
    session.metadata.maxTimestamp || Date.now(),
    channels,
    targetSessionId
  );
  
  if (data.length === 0) return '';
  
  // Build CSV header
  const channelsToExport = channels || Array.from(session.channels);
  const headers = ['Timestamp (ms)', 'Time (s)'];
  channelsToExport.forEach(ch => {
    headers.push(`Ch${ch} Voltage (V)`, `Ch${ch} Current (A)`, `Ch${ch} Power (W)`);
  });
  
  // Build CSV rows
  const rows = [headers.join(',')];
  const startTime = data[0].timestamp;
  
  data.forEach(point => {
    const row = [
      point.timestamp,
      ((point.timestamp - startTime) / 1000).toFixed(3)
    ];
    
    channelsToExport.forEach(ch => {
      const chData = point.data[`ch${ch}`];
      if (chData) {
        row.push(
          chData.voltage?.toFixed(3) || '',
          chData.current?.toFixed(3) || '',
          chData.power?.toFixed(3) || ''
        );
      } else {
        row.push('', '', '');
      }
    });
    
    rows.push(row.join(','));
  });
  
  return rows.join('\n');
}

/**
 * Get real-time chart data for active session
 * @param {number} channel - Channel number
 * @param {number} duration - Duration in milliseconds to retrieve
 * @returns {Object} Chart data with timestamps and values
 */
export function getChartData(channel, duration = 10000) {
  const activeSession = get(timeseriesStore.activeSession);
  if (!activeSession || !activeSession.channels.has(channel)) {
    return { timestamps: [], voltage: [], current: [], power: [] };
  }
  
  const endTime = Date.now();
  const startTime = endTime - duration;
  
  const data = timeseriesStore.getDataRange(startTime, endTime, [channel]);
  
  const result = {
    timestamps: [],
    voltage: [],
    current: [],
    power: []
  };
  
  data.forEach(point => {
    const chData = point.data[`ch${channel}`];
    if (chData) {
      result.timestamps.push(point.timestamp);
      result.voltage.push(chData.voltage || 0);
      result.current.push(chData.current || 0);
      result.power.push(chData.power || 0);
    }
  });
  
  return result;
}

/**
 * Get session statistics
 * @param {string} sessionId - Session ID (null for active)
 * @returns {Object} Statistics object
 */
export function getSessionStats(sessionId = null) {
  const targetSessionId = sessionId || get(timeseriesStore.activeSession)?.id;
  if (!targetSessionId) return null;
  
  const sessions = get(timeseriesStore.sessionList);
  const session = sessions.find(s => s.id === targetSessionId);
  if (!session) return null;
  
  const stats = {
    sessionId: session.id,
    startTime: session.startTime,
    endTime: session.endTime,
    duration: (session.endTime || Date.now()) - session.startTime,
    channels: Array.from(session.channels),
    pointCount: session.pointCount,
    sampleRate: session.metadata.sampleRate,
    channelStats: {}
  };
  
  // Calculate per-channel statistics
  const data = timeseriesStore.getDataRange(
    session.metadata.minTimestamp || session.startTime,
    session.metadata.maxTimestamp || Date.now(),
    null,
    targetSessionId
  );
  
  // Initialize channel stats
  stats.channels.forEach(ch => {
    stats.channelStats[ch] = {
      voltage: { min: Infinity, max: -Infinity, avg: 0 },
      current: { min: Infinity, max: -Infinity, avg: 0 },
      power: { min: Infinity, max: -Infinity, avg: 0 },
      sampleCount: 0
    };
  });
  
  // Calculate statistics
  data.forEach(point => {
    stats.channels.forEach(ch => {
      const chData = point.data[`ch${ch}`];
      if (chData) {
        const chStats = stats.channelStats[ch];
        
        // Voltage stats
        if (chData.voltage !== undefined) {
          chStats.voltage.min = Math.min(chStats.voltage.min, chData.voltage);
          chStats.voltage.max = Math.max(chStats.voltage.max, chData.voltage);
          chStats.voltage.avg += chData.voltage;
        }
        
        // Current stats
        if (chData.current !== undefined) {
          chStats.current.min = Math.min(chStats.current.min, chData.current);
          chStats.current.max = Math.max(chStats.current.max, chData.current);
          chStats.current.avg += chData.current;
        }
        
        // Power stats
        if (chData.power !== undefined) {
          chStats.power.min = Math.min(chStats.power.min, chData.power);
          chStats.power.max = Math.max(chStats.power.max, chData.power);
          chStats.power.avg += chData.power;
        }
        
        chStats.sampleCount++;
      }
    });
  });
  
  // Calculate averages
  stats.channels.forEach(ch => {
    const chStats = stats.channelStats[ch];
    if (chStats.sampleCount > 0) {
      chStats.voltage.avg /= chStats.sampleCount;
      chStats.current.avg /= chStats.sampleCount;
      chStats.power.avg /= chStats.sampleCount;
    }
  });
  
  return stats;
}

// Consumers must explicitly initialize integration
// e.g. call initializeTimeseriesIntegration() in the application entry point