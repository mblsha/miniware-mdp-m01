/**
 * Set up packet handlers for integration tests that mock the channelStore.
 * This simulates the packet handling that would normally be done by the real channelStore.
 */
export function setupTestPacketHandlers(serialConnection, channelStore) {
  // Register machine packet handler to update deviceTypeStore
  serialConnection.registerPacketHandler(0x15, (packet) => { // MACHINE type = 0x15 = 21
    if (packet.length >= 9) {
      const machineType = packet[8]; // Data starts at index 6, machine type is 3rd byte in data
      serialConnection.deviceTypeStore.set({
        type: machineType === 0x10 ? 'M01' : 'M02',
        hasLCD: machineType === 0x10
      });
    }
  });
  
  // Register synthesize packet handler to update channels
  serialConnection.registerPacketHandler(0x11, (packet) => { // SYNTHESIZE type = 0x11 = 17
    // Set waitingSynthesize to false when we receive synthesize packet
    channelStore.waitingSynthesize.set(false);
    // Update the mock channel store with synthesize data
    const channelData = [];
    
    // Parse synthesize packet (6 channels × 25 bytes each)
    for (let i = 0; i < 6; i++) {
      const offset = 6 + i * 25; // Skip header + checksum
      if (packet.length >= offset + 25) {
        const voltage = packet[offset + 1] | (packet[offset + 2] << 8);
        const current = packet[offset + 3] | (packet[offset + 4] << 8);
        const tempRaw = packet[offset + 13] | (packet[offset + 14] << 8);
        const online = packet[offset + 15];
        const outputOn = packet[offset + 19];
        const machineType = packet[offset + 16];
        
        channelData.push({
          channel: i,
          online: online !== 0,
          machineType: machineType === 0 ? 'P905' : 
                      machineType === 1 ? 'P906' : 
                      machineType === 2 ? 'P906' : 
                      machineType === 3 ? 'L1060' : 'Unknown',
          voltage: voltage / 1000, // Convert mV to V
          current: current / 1000, // Convert mA to A
          power: (voltage * current) / 1000000, // Calculate power in W
          temperature: tempRaw / 10, // Convert raw temperature to °C
          isOutput: outputOn !== 0,
          mode: 'Normal',
          address: [0, 0, 0, 0, 0],
          targetVoltage: voltage / 1000,
          targetCurrent: current / 1000,
          recording: false,
          waveformData: []
        });
      }
    }
    
    // Update the mock store directly
    channelStore.channels.set(channelData);
  });
  
  // Register update channel packet handler
  serialConnection.registerPacketHandler(0x14, (packet) => { // UPDATE_CH type = 0x14 = 20
    if (packet.length >= 7) {
      const channel = packet[6];
      // Use setActiveChannel function instead of trying to set derived store
      if (channelStore.setActiveChannel) {
        channelStore.setActiveChannel(channel);
      }
    }
  });
  
  // Register wave packet handler
  serialConnection.registerPacketHandler(0x12, (packet) => { // WAVE type = 0x12 = 18
    if (packet.length >= 6) {
      const channel = packet[4];
      // Simple wave packet handling - just add some mock waveform data
      const currentChannels = channelStore.channels.subscribe ? undefined : channelStore.channels.get();
      if (currentChannels && currentChannels[channel] && currentChannels[channel].recording) {
        const waveformData = currentChannels[channel].waveformData || [];
        // Add some mock points
        for (let i = 0; i < 2; i++) {
          waveformData.push({
            timestamp: waveformData.length * 10,
            voltage: 5.0 + Math.random() * 0.2,
            current: 1.0 + Math.random() * 0.1
          });
        }
        
        // Update the channel with new waveform data
        channelStore.channels.update(channels => {
          channels[channel].waveformData = waveformData;
          return channels;
        });
      }
    }
  });
}