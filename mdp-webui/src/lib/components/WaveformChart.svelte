<script>
  // @ts-nocheck
  import * as Plot from '@observablehq/plot';
  import { onDestroy } from 'svelte';
  import { theme } from '$lib/stores/theme.js';
  
  export let data = [];
  export let isRecording = false;
  
  let chartContainer;
  let resizeObserver;
  let currentTheme;
  
  // Subscribe to theme changes
  $: currentTheme = $theme;
  
  // Get theme-specific colors
  $: chartColors = {
    voltage: currentTheme === 'dark' ? '#ff5722' : '#d32f2f',
    current: currentTheme === 'dark' ? '#2196f3' : '#1976d2',
    text: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.87)' : '#213547',
    grid: currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
  };
  
  // Transform data for Plot
  $: plotData = data.map(d => ({
    timestamp: d.timestamp, // Already in milliseconds
    voltage: d.voltage,
    current: d.current
  }));
  
  // Create the plot configuration
  function createPlot(containerWidth = 800) {
    if (plotData.length === 0) return null;
    
    // If recording and lots of data, show only last 10000 ms (10 seconds)
    let displayData = plotData;
    if (isRecording && plotData.length > 100) {
      const lastTimestamp = plotData[plotData.length - 1].timestamp;
      const startTime = lastTimestamp - 10000; // 10000 ms = 10 seconds ago
      displayData = plotData.filter(d => d.timestamp >= startTime);
    }
    
    return Plot.plot({
      width: containerWidth,
      height: 400,
      marginLeft: 60,
      marginRight: 60,
      title: "Voltage & Current vs Time",
      grid: true,
      style: {
        color: chartColors.text,
        fontFamily: 'inherit',
        fontSize: '12px',
        backgroundColor: 'transparent'
      },
      x: {
        label: "Time (ms)",
        nice: true,
        labelColor: chartColors.text,
        tickColor: chartColors.text,
        gridColor: chartColors.grid
      },
      y: {
        label: "Voltage (V)",
        nice: true,
        grid: true,
        labelColor: chartColors.text,
        tickColor: chartColors.text,
        gridColor: chartColors.grid
      },
      color: {
        legend: true,
        domain: ["Voltage", "Current"],
        range: [chartColors.voltage, chartColors.current]
      },
      marks: [
        // Voltage line
        Plot.lineY(displayData, {
          x: "timestamp",
          y: "voltage",
          stroke: chartColors.voltage,
          strokeWidth: 2,
          title: d => `Time: ${d.timestamp.toFixed(1)}ms\nVoltage: ${d.voltage.toFixed(3)}V`
        }),
        // Current line (scaled to secondary axis)
        Plot.lineY(displayData, {
          x: "timestamp", 
          y: d => d.current * 10, // Scale current for visibility
          stroke: chartColors.current,
          strokeWidth: 2,
          title: d => `Time: ${d.timestamp.toFixed(1)}ms\nCurrent: ${d.current.toFixed(3)}A`
        }),
        // Add dots for data points if not too many
        ...(displayData.length < 200 ? [
          Plot.dot(displayData, {
            x: "timestamp",
            y: "voltage", 
            fill: chartColors.voltage,
            r: 2
          }),
          Plot.dot(displayData, {
            x: "timestamp",
            y: d => d.current * 10,
            fill: chartColors.current, 
            r: 2
          })
        ] : [])
      ]
    });
  }
  
  // Update plot when data or theme changes
  $: if (chartContainer && (plotData || currentTheme)) {
    // Remove old chart
    chartContainer.replaceChildren();
    
    // Add new chart if we have data
    if (plotData.length > 0) {
      const containerWidth = chartContainer.getBoundingClientRect().width || 800;
      const plot = createPlot(containerWidth);
      if (plot) {
        chartContainer.append(plot);
      }
    }
  }
  
  // Handle resize
  function handleResize() {
    if (chartContainer && plotData.length > 0) {
      chartContainer.replaceChildren();
      const containerWidth = chartContainer.getBoundingClientRect().width || 800;
      const plot = createPlot(containerWidth);
      if (plot) {
        chartContainer.append(plot);
      }
    }
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
  });
</script>

<div class="chart-container" bind:this={chartContainer}>
  {#if data.length === 0}
    <div class="no-data">
      {isRecording ? 'Waiting for data...' : 'No data recorded yet. Click "Start Recording" to begin.'}
    </div>
  {/if}
</div>

<style>
  .chart-container {
    position: relative;
    width: 100%;
    min-height: 400px;
  }
  
  .no-data {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: var(--text-color-secondary);
    text-align: center;
  }
  
  /* Observable Plot styling */
  :global(.chart-container svg) {
    font-family: inherit;
    overflow: visible;
  }
  
  :global(.chart-container .plot-d6a7b5) {
    font-size: 12px;
  }
</style>