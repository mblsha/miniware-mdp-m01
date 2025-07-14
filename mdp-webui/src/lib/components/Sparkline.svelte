<script>
  import * as Plot from '@observablehq/plot';
  import { onDestroy } from 'svelte';
  import { theme } from '$lib/stores/theme.js';
  import { sparklineStore } from '$lib/stores/sparkline.js';
  
  export let channel = 0;
  export let metric = 'voltage'; // 'voltage', 'current', or 'power'
  export let targetValue = null; // Optional target value for reference line
  export let width = 200;
  export let height = 60;
  export let showAxes = false; // Minimal sparkline by default
  export let showTooltip = true;
  
  let chartContainer;
  let currentTheme;
  let metricData = [];
  
  // Subscribe to theme changes
  $: currentTheme = $theme;
  
  // Subscribe to sparkline data for this channel and metric
  $: dataStore = sparklineStore.getChannelMetricData(channel, metric);
  $: metricData = $dataStore;
  
  // Get theme-specific colors
  $: chartColors = getChartColors(currentTheme, metric);
  
  // Get metric-specific configuration
  $: metricConfig = getMetricConfig(metric);
  
  function getChartColors(theme, metric) {
    const isDark = theme === 'dark';
    
    const colors = {
      voltage: isDark ? '#ff5722' : '#d32f2f',
      current: isDark ? '#2196f3' : '#1976d2', 
      power: isDark ? '#4caf50' : '#388e3c'
    };
    
    return {
      line: colors[metric] || colors.voltage,
      target: 'rgba(0, 0, 0, 0.3)', // Use same color for both themes
      text: isDark ? 'rgba(255, 255, 255, 0.87)' : '#213547',
      grid: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'
    };
  }
  
  function getMetricConfig(metric) {
    const configs = {
      voltage: {
        label: 'V',
        decimals: 3,
        unit: 'V'
      },
      current: {
        label: 'A', 
        decimals: 3,
        unit: 'A'
      },
      power: {
        label: 'W',
        decimals: 2,
        unit: 'W'
      }
    };
    
    return configs[metric] || configs.voltage;
  }
  
  // Transform data for Plot - use relative timestamps
  $: plotData = metricData.map((point, index) => {
    // Calculate seconds ago from now
    const now = Date.now();
    const secondsAgo = -(now - point.timestamp) / 1000;
    
    return {
      time: secondsAgo,
      value: point.value,
      timestamp: point.timestamp
    };
  });
  
  // Create the sparkline plot
  function createSparkline() {
    if (plotData.length === 0) return null;
    
    
    // Calculate Y-axis domain to include both data and target value
    const dataValues = plotData.map(d => d.value);
    const minData = Math.min(...dataValues);
    const maxData = Math.max(...dataValues);
    
    let yDomain = [minData, maxData];
    
    // Include target value in domain if present
    if (targetValue !== null && typeof targetValue === 'number' && targetValue !== 0) {
      const minY = Math.min(minData, targetValue);
      const maxY = Math.max(maxData, targetValue);
      // Add 10% padding
      const padding = (maxY - minY) * 0.1 || 0.1; // Ensure minimum padding
      yDomain = [minY - padding, maxY + padding];
    }
    
    const marks = [];
    
    // Add target value line FIRST if provided and not zero
    if (targetValue !== null && typeof targetValue === 'number' && targetValue !== 0) {
      // Create synthetic data points for the target line across the full time range
      const targetData = [];
      for (let t = -60; t <= 0; t += 5) {
        targetData.push({ time: t, targetY: targetValue });
      }
      
      // Add target line as a separate lineY mark
      marks.push(
        Plot.lineY(targetData, {
          x: "time",
          y: "targetY",
          stroke: chartColors.target,
          strokeWidth: 1,
          strokeDasharray: "3,3",
          opacity: 0.7,
          curve: "linear"
        })
      );
    }
    
    // Main data line
    marks.push(
      Plot.lineY(plotData, {
        x: "time",
        y: "value",
        stroke: chartColors.line,
        strokeWidth: 2,
        curve: "linear"
      })
    );
    
    // Add dots for recent data points if not too many
    if (plotData.length < 20) {
      marks.push(
        Plot.dot(plotData, {
          x: "time",
          y: "value",
          fill: chartColors.line,
          r: 1.5,
          opacity: 0.8
        })
      );
    }
    
    const plotConfig = {
      width,
      height,
      marginTop: showAxes ? 20 : 2,
      marginRight: showAxes ? 30 : 2,
      marginBottom: showAxes ? 30 : 2,
      marginLeft: showAxes ? 40 : 2,
      style: {
        color: chartColors.text,
        fontFamily: 'inherit',
        fontSize: '10px',
        backgroundColor: 'transparent',
        overflow: 'visible'
      },
      x: {
        axis: showAxes ? "bottom" : null,
        label: showAxes ? "Seconds ago" : null,
        tickFormat: showAxes ? (d => `${Math.abs(d)}s`) : null,
        labelColor: chartColors.text,
        tickColor: chartColors.text,
        grid: false,
        domain: [-60, 0]
      },
      y: {
        axis: showAxes ? "left" : null,
        label: showAxes ? metricConfig.unit : null,
        tickFormat: showAxes ? (d => d.toFixed(metricConfig.decimals)) : null,
        labelColor: chartColors.text,
        tickColor: chartColors.text,
        grid: false,
        domain: yDomain,
        nice: false,
        clamp: false,
        zero: false
      },
      marks
    };
    
    // Add tooltip if enabled
    if (showTooltip && plotData.length > 0) {
      // Replace the main data line with one that has tooltips
      const mainLineIndex = targetValue !== null && typeof targetValue === 'number' && targetValue !== 0 ? 1 : 0;
      marks[mainLineIndex] = Plot.lineY(plotData, {
        x: "time",
        y: "value", 
        stroke: chartColors.line,
        strokeWidth: 2,
        curve: "linear",
        title: d => `${Math.abs(d.time).toFixed(1)}s ago: ${d.value.toFixed(metricConfig.decimals)}${metricConfig.unit}`
      });
    }
    
    
    return Plot.plot(plotConfig);
  }
  
  // Update plot when data or theme changes
  $: if (chartContainer && (plotData.length > 0 || currentTheme)) {
    // Remove old chart
    chartContainer.replaceChildren();
    
    // Add new chart if we have data
    if (plotData.length > 0) {
      const plot = createSparkline();
      if (plot) {
        chartContainer.append(plot);
      }
    }
  }
  
  onDestroy(() => {
    // Cleanup handled by sparklineStore
  });
</script>

<div 
  class="sparkline-container" 
  bind:this={chartContainer}
  style="width: {width}px; height: {height}px;"
>
  {#if plotData.length === 0}
    <div class="no-data">
      <span class="metric-label">{metricConfig.label}</span>
      <span class="no-data-text">—</span>
    </div>
  {/if}
</div>

<style>
  .sparkline-container {
    position: relative;
    border: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));
    border-radius: 4px;
    background: var(--background-color, transparent);
    overflow: visible;
  }
  
  .no-data {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  
  .metric-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-color-secondary);
    text-transform: uppercase;
  }
  
  .no-data-text {
    font-size: 12px;
    color: var(--text-color-muted);
  }
  
  /* Observable Plot styling */
  :global(.sparkline-container svg) {
    font-family: inherit;
    overflow: visible;
  }
  
  :global(.sparkline-container .plot-d6a7b5) {
    font-size: 10px;
  }
  
  /* Dark theme support */
  :global([data-theme="dark"]) .sparkline-container {
    --border-color: rgba(255, 255, 255, 0.1);
    --text-color-secondary: rgba(255, 255, 255, 0.7);
    --text-color-muted: rgba(255, 255, 255, 0.5);
  }
  
  :global([data-theme="light"]) .sparkline-container {
    --border-color: rgba(0, 0, 0, 0.1);
    --text-color-secondary: rgba(33, 53, 71, 0.7);
    --text-color-muted: rgba(33, 53, 71, 0.5);
  }
</style>