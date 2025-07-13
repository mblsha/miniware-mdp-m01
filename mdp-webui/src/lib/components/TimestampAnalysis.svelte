<script>
  import * as Plot from '@observablehq/plot';
  import { onDestroy } from 'svelte';
  
  import { serialConnection } from '../serial';
  import { decodePacket } from '../packet-decoder';
  
  export let channel = 0;
  export let isRecording = false;
  
  let chartContainer;
  let resizeObserver;
  let packetData = [];
  let packetIndex = 0;
  
  // Store packet handlers
  let waveHandler;
  
  // Initialize packet tracking when component mounts
  $: if (typeof window !== 'undefined') {
    setupPacketHandlers();
  }
  
  function setupPacketHandlers() {
    // Clean up old handlers
    cleanupHandlers();
    
    // Create new handlers
    waveHandler = (packet) => {
      if (!isRecording) return;
      
      const decoded = decodePacket(packet);
      if (!decoded || !decoded.data) return;
      
      const wave = decoded.data;
      if (wave.channel !== channel) return;
      
      // Extract timestamp data from groups
      wave.groups.forEach((group, groupIndex) => {
        packetData.push({
          packetIndex: packetIndex,
          groupIndex: groupIndex,
          timestamp: group.timestamp,
          itemCount: group.items.length
        });
      });
      
      packetIndex++;
      
      // Keep only last 50 packets worth of data
      const maxDataPoints = 50 * 10; // 50 packets * 10 groups
      if (packetData.length > maxDataPoints) {
        const toRemove = packetData.length - maxDataPoints;
        packetData = packetData.slice(toRemove);
        
        // Adjust packet indices
        const minPacketIndex = packetData[0]?.packetIndex || 0;
        packetData = packetData.map(d => ({
          ...d,
          packetIndex: d.packetIndex - minPacketIndex
        }));
        packetIndex = packetIndex - minPacketIndex;
      }
      
      updatePlot();
    };
    
    // Register handlers
    serialConnection.registerPacketHandler(0x12, waveHandler); // WAVE
  }
  
  function cleanupHandlers() {
    // Note: We need a way to unregister handlers - this is a limitation
    // For now, handlers will check isRecording flag
  }
  
  // Clear data when recording starts
  $: if (isRecording) {
    packetData = [];
    packetIndex = 0;
  }
  
  function createPlot(containerWidth = 800) {
    if (packetData.length === 0) return null;
    
    return Plot.plot({
      width: containerWidth,
      height: 300,
      marginLeft: 60,
      marginRight: 80,
      marginBottom: 40,
      title: "Timestamp Analysis",
      subtitle: "Device timestamps by packet index, colored by group",
      grid: true,
      x: {
        label: "Packet Index",
        nice: true
      },
      y: {
        label: "Device Timestamp",
        nice: true
      },
      color: {
        type: "ordinal",
        scheme: "tableau10",
        label: "Group",
        legend: true,
        domain: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      },
      marks: [
        // Points for each timestamp
        Plot.dot(packetData, {
          x: "packetIndex",
          y: "timestamp",
          fill: "groupIndex",
          r: 3,
          opacity: 0.8,
          title: d => `Packet ${d.packetIndex}, Group ${d.groupIndex}, Timestamp ${d.timestamp}`
        }),
        // Vertical lines showing packet boundaries
        Plot.ruleX(
          Array.from(new Set(packetData.map(d => d.packetIndex))),
          {
            stroke: "lightgray",
            strokeOpacity: 0.3
          }
        )
      ]
    });
  }
  
  function updatePlot() {
    if (!chartContainer) return;
    
    // Remove old chart
    chartContainer.replaceChildren();
    
    // Add new chart if we have data
    if (packetData.length > 0) {
      const containerWidth = chartContainer.getBoundingClientRect().width || 800;
      const plot = createPlot(containerWidth);
      if (plot) {
        chartContainer.append(plot);
      }
    }
  }
  
  // Handle resize
  function handleResize() {
    updatePlot();
  }
  
  // Set up resize observer when container is available
  $: if (chartContainer && !resizeObserver) {
    resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(chartContainer);
  }
  
  onDestroy(() => {
    if (resizeObserver) {
      resizeObserver.disconnect();
    }
    cleanupHandlers();
  });
  
  // Analyze patterns in collected data
  $: timestampPatterns = analyzePatterns(packetData);
  
  function analyzePatterns(data) {
    if (data.length === 0) return null;
    
    // Group by packet
    const packets = {};
    data.forEach(d => {
      if (!packets[d.packetIndex]) {
        packets[d.packetIndex] = [];
      }
      packets[d.packetIndex].push(d.timestamp);
    });
    
    // Analyze each packet
    let monotonicCount = 0;
    let nonMonotonicCount = 0;
    let sameTimestampCount = 0;
    
    Object.values(packets).forEach(timestamps => {
      const sorted = [...timestamps].sort((a, b) => a - b);
      const isMonotonic = JSON.stringify(timestamps) === JSON.stringify(sorted);
      const hasSameTimestamps = new Set(timestamps).size < timestamps.length;
      
      if (isMonotonic) monotonicCount++;
      else nonMonotonicCount++;
      if (hasSameTimestamps) sameTimestampCount++;
    });
    
    return {
      totalPackets: Object.keys(packets).length,
      monotonicPackets: monotonicCount,
      nonMonotonicPackets: nonMonotonicCount,
      packetsWithDuplicates: sameTimestampCount
    };
  }
</script>

<div class="timestamp-analysis">
  <div class="chart-container" bind:this={chartContainer}>
    {#if packetData.length === 0}
      <div class="no-data">
        {isRecording ? 'Collecting timestamp data...' : 'Start recording to see timestamp analysis'}
      </div>
    {/if}
  </div>
  
  {#if timestampPatterns && packetData.length > 0}
    <div class="analysis-summary">
      <div class="stat">
        <span class="stat-label">Packets:</span>
        <span class="stat-value">{timestampPatterns.totalPackets}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Monotonic:</span>
        <span class="stat-value">{timestampPatterns.monotonicPackets}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Non-monotonic:</span>
        <span class="stat-value">{timestampPatterns.nonMonotonicPackets}</span>
      </div>
      <div class="stat">
        <span class="stat-label">With duplicates:</span>
        <span class="stat-value">{timestampPatterns.packetsWithDuplicates}</span>
      </div>
    </div>
  {/if}
</div>

<style>
  .timestamp-analysis {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .chart-container {
    position: relative;
    width: 100%;
    min-height: 300px;
    background: white;
  }
  
  .no-data {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #999;
    text-align: center;
  }
  
  .analysis-summary {
    display: flex;
    gap: 2rem;
    padding: 1rem;
    background: #f5f5f5;
    border-radius: 4px;
    font-size: 0.875rem;
  }
  
  .stat {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  
  .stat-label {
    color: #666;
  }
  
  .stat-value {
    font-weight: 600;
    color: #333;
  }
</style>