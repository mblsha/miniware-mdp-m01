<script>
  import { channelStore } from '$lib/stores/channels.js';
  
  export let channel = 0;
  export let onback = undefined;
  
  $: channels = channelStore.channels;
  $: channelData = $channels[channel];
  $: isRecording = channelData?.recording || false;
  
  let targetVoltage = 0;
  let targetCurrent = 0;
  let recordingDuration = 0;
  
  function goBack() {
    onback?.();
  }
  
  async function toggleOutput() {
    await channelStore.setOutput(channel, !channelData.isOutput);
  }
  
  async function applyVoltage() {
    await channelStore.setVoltage(channel, targetVoltage, targetCurrent);
  }
  
  async function applyCurrent() {
    await channelStore.setCurrent(channel, targetVoltage, targetCurrent);
  }
  
  function startRecording() {
    channelStore.startRecording(channel);
    recordingDuration = 0;
  }
  
  function stopRecording() {
    channelStore.stopRecording(channel);
  }
  
  function exportData() {
    if (!channelData || !channelData.waveformData.length) return;
    
    const csv = ['Timestamp (ms),Voltage (V),Current (A)'];
    channelData.waveformData.forEach(point => {
      csv.push(`${point.timestamp},${point.voltage},${point.current}`);
    });
    
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `channel_${channel + 1}_waveform_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
</script>

<div class="channel-detail" data-testid="mock-channel-detail">
  <div class="header">
    <button class="back-button" onclick={goBack}>← Back</button>
    <h2>Channel {channel + 1} - {channelData?.machineType || 'Unknown'}</h2>
  </div>
  
  {#if channelData && channelData.online}
    <div class="content">
      <div class="control-panel">
        <div class="section">
          <h3>Output Control</h3>
          <button 
            class="output-toggle"
            class:on={channelData.isOutput}
            onclick={toggleOutput}
          >
            Output: {channelData.isOutput ? 'ON' : 'OFF'}
          </button>
        </div>
        
        <div class="section">
          <h3>Parameter Configuration</h3>
          <div class="parameter">
            <label>
              Voltage (V):
              <input 
                type="number" 
                bind:value={targetVoltage} 
                min="0" 
                max="30" 
                step="0.001"
                data-testid="voltage-input"
              />
            </label>
            <button onclick={applyVoltage}>Set V</button>
          </div>
          <div class="parameter">
            <label>
              Current (A):
              <input 
                type="number" 
                bind:value={targetCurrent} 
                min="0" 
                max="5" 
                step="0.001"
              />
            </label>
            <button onclick={applyCurrent}>Set I</button>
          </div>
        </div>
        
        <div class="section">
          <h3>Current Measurements</h3>
          <div class="measurements">
            <div class="measurement">
              <span class="label">Voltage</span>
              <span class="value">{channelData.voltage.toFixed(3)} V</span>
            </div>
            <div class="measurement">
              <span class="label">Current</span>
              <span class="value">{channelData.current.toFixed(3)} A</span>
            </div>
            <div class="measurement">
              <span class="label">Power</span>
              <span class="value">{channelData.power.toFixed(3)} W</span>
            </div>
            <div class="measurement">
              <span class="label">Temperature</span>
              <span class="value">{channelData.temperature.toFixed(1)} °C</span>
            </div>
          </div>
        </div>
        
        <div class="section">
          <h3>Waveform Recording</h3>
          <div class="recording-controls">
            {#if !isRecording}
              <button class="record-button" onclick={startRecording}>
                Start Recording
              </button>
            {:else}
              <button class="stop-button" onclick={stopRecording}>
                Stop Recording
              </button>
              <span class="recording-indicator">
                Recording... {formatDuration(recordingDuration)}
              </span>
            {/if}
            {#if channelData.waveformData.length > 0}
              <button onclick={exportData}>Export Data</button>
              <span class="data-points">
                {channelData.waveformData.length} points
              </span>
            {/if}
          </div>
        </div>
      </div>
      
      <div class="chart-section">
        <h3>Waveform Visualization</h3>
        <div data-testid="mock-waveform-chart">Mock Waveform Chart</div>
      </div>
    </div>
  {:else}
    <div class="offline">
      <p>Channel {channel + 1} is offline</p>
    </div>
  {/if}
</div>

<style>
  .channel-detail {
    flex: 1;
    padding: 2rem;
  }
  
  .header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 2rem;
  }
  
  .back-button {
    background: none;
    border: 1px solid #ccc;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
  }
  
  .content {
    display: grid;
    grid-template-columns: 350px 1fr;
    gap: 2rem;
  }
  
  .control-panel {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
  
  .section {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  .output-toggle {
    width: 100%;
    padding: 0.75rem;
    font-size: 1rem;
    font-weight: 600;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    background-color: #f44336;
    color: white;
  }
  
  .output-toggle.on {
    background-color: #4caf50;
  }
  
  .parameter {
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }
  
  .measurements {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  
  .measurement {
    display: flex;
    flex-direction: column;
  }
  
  .value {
    font-size: 1.25rem;
    font-weight: 600;
    color: #333;
  }
  
  .recording-controls {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  
  .chart-section {
    background: white;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  .offline {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 400px;
    color: #666;
  }
</style>