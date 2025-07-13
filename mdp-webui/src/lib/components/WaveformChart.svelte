<script>
  import * as Plot from '@observablehq/plot';
  import { onDestroy } from 'svelte';
  
  export let data = [];
  export let isRecording = false;
  
  let chartContainer;
  let resizeObserver;
  
  // Transform data for Plot
  $: plotData = data.map(d => ({
    timestamp: d.timestamp / 1000, // Convert to seconds for better readability
    voltage: d.voltage,
    current: d.current
  }));
  
  // Create the plot configuration
  function createPlot(containerWidth = 800) {
    if (plotData.length === 0) return null;
    
    // If recording and lots of data, show only last 10 seconds
    let displayData = plotData;
    if (isRecording && plotData.length > 100) {
      const lastTimestamp = plotData[plotData.length - 1].timestamp;
      const startTime = lastTimestamp - 10; // 10 seconds ago
      displayData = plotData.filter(d => d.timestamp >= startTime);
    }
    
    return Plot.plot({
      width: containerWidth,
      height: 400,
      marginLeft: 60,
      marginRight: 60,
      title: "Voltage & Current vs Time",
      grid: true,
      x: {
        label: "Time (s)",
        nice: true
      },
      y: {
        label: "Voltage (V)",
        nice: true,
        grid: true
      },
      color: {
        legend: true,
        domain: ["Voltage", "Current"],
        range: ["#2196f3", "#ff5722"]
      },
      marks: [
        // Voltage line
        Plot.lineY(displayData, {
          x: "timestamp",
          y: "voltage",
          stroke: "#2196f3",
          strokeWidth: 2,
          title: d => `Time: ${d.timestamp.toFixed(1)}s\nVoltage: ${d.voltage.toFixed(3)}V`
        }),
        // Current line (scaled to secondary axis)
        Plot.lineY(displayData, {
          x: "timestamp", 
          y: d => d.current * 10, // Scale current for visibility
          stroke: "#ff5722",
          strokeWidth: 2,
          title: d => `Time: ${d.timestamp.toFixed(1)}s\nCurrent: ${d.current.toFixed(3)}A`
        }),
        // Add dots for data points if not too many
        ...(displayData.length < 200 ? [
          Plot.dot(displayData, {
            x: "timestamp",
            y: "voltage", 
            fill: "#2196f3",
            r: 2
          }),
          Plot.dot(displayData, {
            x: "timestamp",
            y: d => d.current * 10,
            fill: "#ff5722", 
            r: 2
          })
        ] : [])
      ]
    });
  }
  
  // Update plot when data changes
  $: if (chartContainer) {
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
    color: #999;
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