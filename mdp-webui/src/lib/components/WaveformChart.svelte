<script>
  import { onMount, onDestroy } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  
  export let data = [];
  export let isRecording = false;
  
  let chartContainer;
  let chart = null;
  let animationFrame = null;
  
  const chartOptions = {
    width: 800,
    height: 400,
    title: "Voltage & Current vs Time",
    scales: {
      x: {
        time: false,
      },
      y: {
        auto: true,
      },
      current: {
        auto: true,
        side: 1,
      }
    },
    axes: [
      {},
      {
        label: "Voltage (V)",
        stroke: "#2196f3",
        grid: { show: true },
      },
      {
        side: 1,
        label: "Current (A)",
        stroke: "#ff5722",
        grid: { show: false },
      }
    ],
    series: [
      {
        label: "Time (ms)",
      },
      {
        label: "Voltage",
        stroke: "#2196f3",
        width: 2,
        scale: "y",
      },
      {
        label: "Current",
        stroke: "#ff5722",
        width: 2,
        scale: "current",
      }
    ],
    cursor: {
      sync: {
        key: "mdp-chart",
      }
    },
    legend: {
      show: true,
      live: true,
    }
  };
  
  function updateChart() {
    if (!chart || data.length === 0) return;
    
    const timestamps = data.map(d => d.timestamp);
    const voltages = data.map(d => d.voltage);
    const currents = data.map(d => d.current);
    
    const chartData = [timestamps, voltages, currents];
    
    chart.setData(chartData);
    
    if (isRecording && data.length > 100) {
      // Auto-scale to show last 10 seconds during recording
      const lastTimestamp = timestamps[timestamps.length - 1];
      const startTime = Math.max(0, lastTimestamp - 10000);
      chart.setScale('x', { min: startTime, max: lastTimestamp });
    }
  }
  
  function resizeChart() {
    if (!chart || !chartContainer) return;
    
    const rect = chartContainer.getBoundingClientRect();
    chart.setSize({ width: rect.width, height: 400 });
  }
  
  onMount(() => {
    if (chartContainer) {
      const rect = chartContainer.getBoundingClientRect();
      chartOptions.width = rect.width;
      
      chart = new uPlot(chartOptions, [[0], [0], [0]], chartContainer);
      
      window.addEventListener('resize', resizeChart);
      
      // Start animation loop for live updates
      function animate() {
        if (isRecording) {
          updateChart();
        }
        animationFrame = requestAnimationFrame(animate);
      }
      animate();
    }
  });
  
  onDestroy(() => {
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
    if (chart) {
      chart.destroy();
    }
    window.removeEventListener('resize', resizeChart);
  });
  
  // Update chart when data changes and not recording
  $: if (chart && !isRecording && data.length >= 0) {
    updateChart();
  }
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
  
  :global(.uplot) {
    font-family: inherit;
  }
  
  :global(.u-legend) {
    font-size: 12px;
  }
</style>