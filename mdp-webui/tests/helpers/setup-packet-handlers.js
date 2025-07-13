import { get } from 'svelte/store';

/**
 * Setup packet handlers to update channel store
 * This mimics what happens in the real channelStore
 */
export function setupPacketHandlers(serialConnection, channelStore) {
  // Synthesize packet handler
  serialConnection.registerPacketHandler(0x11, (packet) => {
    // Skip header (6 bytes)
    const data = packet.slice(6);
    
    channelStore.channels.update(channels => {
      // Each channel is 25 bytes
      for (let i = 0; i < 6; i++) {
        const offset = i * 25;
        const channelData = data.slice(offset, offset + 25);
        
        if (channelData.length >= 25) {
          const ch = channels[i];
          
          // Parse channel data
          const outVoltage = channelData[1] | (channelData[2] << 8);
          const outCurrent = channelData[3] | (channelData[4] << 8);
          const temperature = channelData[13] | (channelData[14] << 8);
          
          ch.online = channelData[15] === 1;
          ch.voltage = outVoltage / 1000; // Convert to V
          ch.current = outCurrent / 1000; // Convert to A
          ch.power = ch.voltage * ch.current;
          ch.temperature = temperature / 10; // Convert to °C
          ch.isOutput = channelData[19] === 1;
          ch.machineType = channelData[16] === 0 ? 'Node' : 
                          channelData[16] === 1 ? 'P905' :
                          channelData[16] === 2 ? 'P906' :
                          channelData[16] === 3 ? 'L1060' : 'Unknown';
        }
      }
      
      return [...channels];
    });
    
    // Clear waiting flag
    if (channelStore.waitingSynthesize) {
      channelStore.waitingSynthesize.set(false);
    }
  });
  
  // Wave packet handler
  serialConnection.registerPacketHandler(0x12, (packet) => {
    const activeChannelValue = get(channelStore.activeChannel);
    const waitingSynth = channelStore.waitingSynthesize ? 
      get(channelStore.waitingSynthesize) : false;
    
    if (waitingSynth) return; // Skip if waiting for synthesize
    
    // Parse wave data
    const size = packet[3];
    const channel = packet[4];
    
    // Process wave packets for any recording channel, not just active channel
    const data = packet.slice(6);
    const pointSize = 4; // 2 bytes voltage + 2 bytes current
    const timestampSize = 4; // 4 bytes for timestamp (little-endian)
    const groupSize = size === 126 ? (timestampSize + 2 * pointSize) : 
                     size === 206 ? (timestampSize + 4 * pointSize) : 0;
    
    if (groupSize === 0) return;
    
    const waveData = [];
    const numGroups = Math.floor(data.length / groupSize);
    
    for (let g = 0; g < numGroups; g++) {
      const groupOffset = g * groupSize;
      const timestamp = data[groupOffset] | 
                       (data[groupOffset + 1] << 8) |
                       (data[groupOffset + 2] << 16) |
                       (data[groupOffset + 3] << 24);
      
      const pointsPerGroup = (groupSize - timestampSize) / pointSize;
      
      for (let p = 0; p < pointsPerGroup; p++) {
        const pointOffset = groupOffset + timestampSize + (p * pointSize);
        const voltage = (data[pointOffset] | (data[pointOffset + 1] << 8)) / 1000;
        const current = (data[pointOffset + 2] | (data[pointOffset + 3] << 8)) / 1000;
        
        waveData.push({ timestamp, voltage, current });
      }
    }
    
    // Add to channel's waveform data
    if (channelStore.addWaveformData) {
      channelStore.addWaveformData(channel, waveData);
    } else {
      channelStore.channels.update(channels => {
        if (channels[channel] && channels[channel].recording) {
          channels[channel].waveformData.push(...waveData);
        }
        return [...channels];
      });
    }
  });
  
  // Update channel packet handler
  serialConnection.registerPacketHandler(0x14, (packet) => {
    const newChannel = packet[6];
    if (newChannel < 6) {
      // activeChannel is derived, so we need to call setActiveChannel
      if (channelStore.setActiveChannel) {
        channelStore.setActiveChannel(newChannel);
      }
    }
  });
  
  // Machine packet handler
  serialConnection.registerPacketHandler(0x15, (packet) => {
    const machineType = packet[8]; // Machine type is at index 8 (after header + channel + dummy)
    const deviceType = {
      type: machineType === 0x10 ? 'M01' : 'M02',
      haveLcd: machineType === 0x10
    };
    
    if (serialConnection.deviceTypeStore) {
      serialConnection.deviceTypeStore.set(deviceType);
    }
  });
  
  // Error packet handler
  serialConnection.registerPacketHandler(0x23, (packet) => {
    console.log('Error 240 packet received');
  });
  
  return {
    cleanup: () => {
      serialConnection.clearPacketHandlers();
    }
  };
}