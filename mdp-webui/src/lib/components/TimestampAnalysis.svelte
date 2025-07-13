<script>
  import * as Plot from '@observablehq/plot';
  import * as d3 from 'd3';
  import { onDestroy } from 'svelte';
  
  import { serialConnection } from '../serial';
  import { decodePacket } from '../packet-decoder';
  import { theme } from '$lib/stores/theme.js';
  
  export let channel = 0;
  export let isRecording = false;
  
  let chartContainer;
  let resizeObserver;
  let packetData = [];
  let packetIndex = 0;
  let currentTheme;
  let lastWavePacketTime = null; // Track time of last wave packet
  
  // Store packet handlers
  let waveHandler;
  
  // Subscribe to theme changes
  $: currentTheme = $theme;
  
  // Get theme-specific colors
  $: chartColors = {
    text: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.87)' : '#213547',
    grid: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    background: currentTheme === 'dark' ? '#242424' : '#ffffff'
  };
  
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
      let timestampSum = 0;
      wave.groups.forEach((group, groupIndex) => {
        packetData.push({
          packetIndex: packetIndex,
          groupIndex: groupIndex,
          timestamp: group.timestamp,
          itemCount: group.items.length
        });
        timestampSum += group.timestamp;
      });
      
      // Add synthetic group 100 with sum of all timestamps
      packetData.push({
        packetIndex: packetIndex,
        groupIndex: 100,
        timestamp: timestampSum,
        itemCount: wave.groups.length // Number of groups summed
      });
      
      // Add synthetic group 200 with milliseconds since last packet
      const currentTime = Date.now();
      let msSinceLastPacket = 0;
      if (lastWavePacketTime !== null) {
        msSinceLastPacket = currentTime - lastWavePacketTime;
      }
      lastWavePacketTime = currentTime;
      
      packetData.push({
        packetIndex: packetIndex,
        groupIndex: 200,
        timestamp: msSinceLastPacket,
        itemCount: 1 // Single time measurement
      });
      
      packetIndex++;
      
      // Keep only last 50 packets worth of data
      const maxDataPoints = 50 * 12; // 50 packets * 12 groups (10 regular + 2 synthetic)
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
    lastWavePacketTime = null; // Reset timing
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
      subtitle: "Device timestamps by packet index (Group 100 = sum, Group 200 = ms between packets)",
      grid: true,
      style: {
        color: chartColors.text,
        fontFamily: 'inherit',
        fontSize: '12px',
        backgroundColor: 'transparent'
      },
      x: {
        label: "Packet Index",
        nice: true,
        labelColor: chartColors.text,
        tickColor: chartColors.text,
        gridColor: chartColors.grid
      },
      y: {
        label: "Device Timestamp",
        nice: true,
        labelColor: chartColors.text,
        tickColor: chartColors.text,
        gridColor: chartColors.grid
      },
      color: {
        type: "ordinal",
        label: "Group",
        legend: true,
        domain: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 100, 200],
        range: [...d3.schemeCategory10, '#ff00ff', '#00ff00'] // Magenta for 100, green for 200
      },
      marks: [
        // Lines connecting timestamps for each group (including synthetic groups)
        ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 100, 200].map(groupIndex => {
          const groupData = packetData.filter(d => d.groupIndex === groupIndex);
          if (groupData.length === 0) return null;
          
          return Plot.line(groupData, {
            x: "packetIndex",
            y: "timestamp",
            stroke: groupIndex,
            strokeWidth: groupIndex >= 100 ? 3 : 2, // Thicker line for synthetic groups
            opacity: groupIndex >= 100 ? 1 : 0.8,
            strokeDasharray: groupIndex === 100 ? "5,5" : groupIndex === 200 ? "2,2" : null // Different dash patterns
          });
        }).filter(mark => mark !== null),
        
        // Points for each timestamp
        Plot.dot(packetData, {
          x: "packetIndex",
          y: "timestamp",
          fill: "groupIndex",
          r: d => d.groupIndex >= 100 ? 3 : 2, // Larger dots for synthetic groups
          opacity: 0.8,
          title: d => {
            if (d.groupIndex === 100) {
              return `Packet ${d.packetIndex}, Group SUM (100), Timestamp ${d.timestamp} (sum of ${d.itemCount} groups)`;
            } else if (d.groupIndex === 200) {
              return `Packet ${d.packetIndex}, Group TIMING (200), ${d.timestamp}ms since last packet`;
            } else {
              return `Packet ${d.packetIndex}, Group ${d.groupIndex}, Timestamp ${d.timestamp}`;
            }
          }
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
  
  // Update plot when theme changes
  $: if (chartContainer && currentTheme && packetData.length > 0) {
    updatePlot();
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
  
  function exportToCSV() {
    if (packetData.length === 0) return;
    
    // Create CSV header
    const headers = ['Packet Index', 'Group Index', 'Timestamp', 'Item Count'];
    
    // Create CSV rows
    const rows = packetData.map(d => [
      d.packetIndex,
      d.groupIndex,
      d.timestamp,
      d.itemCount
    ]);
    
    // Combine header and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');
    
    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `timestamp_analysis_channel_${channel}_${new Date().toISOString()}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    URL.revokeObjectURL(url);
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
    <div class="analysis-footer">
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
      <button class="export-button" onpointerup={exportToCSV}>
        Export CSV
      </button>
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
    background: transparent;
  }
  
  .no-data {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: var(--text-color-secondary);
    text-align: center;
  }
  
  .analysis-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }
  
  .analysis-summary {
    display: flex;
    gap: 2rem;
    padding: 1rem;
    background: var(--chart-grid-color);
    border-radius: 4px;
    font-size: 0.875rem;
    flex: 1;
  }
  
  .stat {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  
  .stat-label {
    color: var(--text-color-secondary);
  }
  
  .stat-value {
    font-weight: 600;
    color: var(--text-color);
  }
  
  .export-button {
    background-color: var(--chart-voltage-color);
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    white-space: nowrap;
  }
  
  .export-button:hover {
    opacity: 0.9;
  }
</style>