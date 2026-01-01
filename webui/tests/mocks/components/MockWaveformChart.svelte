<script>
  export let data = [];
  export let isRecording = false;
  export let width = 800;
  export let height = 400;
  export let title = 'Voltage & Current vs Time';
  
  // Mock chart functionality
  let chartElement;
  
  $: dataPoints = data.length;
  $: hasData = dataPoints > 0;
  $: recordingStatus = isRecording ? 'Recording...' : 'Stopped';
</script>

<div class="waveform-chart" data-testid="waveform-chart" bind:this={chartElement}>
  <div class="chart-header">
    <h3>{title}</h3>
    <span class="data-info">Data points: {dataPoints} | {recordingStatus}</span>
  </div>
  
  <div class="chart-container" style="width: {width}px; height: {height}px;">
    {#if hasData}
      <div class="chart-canvas" data-testid="chart-canvas">
        <svg width="100%" height="100%" viewBox="0 0 {width} {height}">
          <!-- Mock chart visualization -->
          <rect x="0" y="0" width="100%" height="100%" fill="#f8f9fa" stroke="#dee2e6"/>
          <text x="50%" y="50%" text-anchor="middle" dy="0.35em" fill="#6c757d">
            Mock Chart ({dataPoints} points)
          </text>
          
          <!-- Mock waveform line -->
          {#if dataPoints > 0}
            <polyline
              points={data.slice(0, Math.min(10, dataPoints)).map((point, i) => 
                `${(i / Math.max(1, dataPoints - 1)) * width},${height/2 + (point.voltage || 0) * 50}`
              ).join(' ')}
              fill="none"
              stroke="#007bff"
              stroke-width="2"
              data-testid="waveform-line"
            />
          {/if}
        </svg>
      </div>
    {:else}
      <div class="no-data" data-testid="no-data">
        {isRecording ? 'Waiting for data...' : 'No data recorded yet. Click "Start Recording" to begin.'}
      </div>
    {/if}
  </div>
</div>

<style>
  .waveform-chart {
    border: 1px solid #dee2e6;
    border-radius: 8px;
    background: white;
    overflow: hidden;
  }
  
  .chart-header {
    padding: 12px 16px;
    background: #f8f9fa;
    border-bottom: 1px solid #dee2e6;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .chart-header h3 {
    margin: 0;
    font-size: 16px;
    color: #495057;
  }
  
  .data-info {
    font-size: 12px;
    color: #6c757d;
  }
  
  .chart-container {
    position: relative;
    overflow: hidden;
  }
  
  .chart-canvas {
    width: 100%;
    height: 100%;
  }
  
  .no-data {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #6c757d;
    font-style: italic;
  }
</style>