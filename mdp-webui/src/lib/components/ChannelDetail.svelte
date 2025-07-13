<script>
  import { onMount, onDestroy } from 'svelte';
  import { channelStore as defaultChannelStore } from '../stores/channels.js';
  import WaveformChart from './WaveformChart.svelte';
  import TimestampAnalysis from './TimestampAnalysis.svelte';
  
  export let channelStore = defaultChannelStore;
  export let channel = 0;
  export let onback = undefined;
  
  $: channels = channelStore.channels;
  $: channelData = $channels[channel];
  $: isRecording = channelData?.recording || false;
  
  let targetVoltage = 0;
  let targetCurrent = 0;
  let recordingTimer = null;
  let recordingDuration = 0;
  
  onMount(() => {
    if (channelData) {
      targetVoltage = channelData.targetVoltage || channelData.voltage;
      targetCurrent = channelData.targetCurrent || channelData.current;
    }
    channelStore.setActiveChannel(channel);
  });
  
  onDestroy(() => {
    if (recordingTimer) {
      clearInterval(recordingTimer);
    }
  });
  
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
    recordingTimer = setInterval(() => {
      recordingDuration++;
    }, 1000);
  }
  
  function stopRecording() {
    channelStore.stopRecording(channel);
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
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

<div class="channel-detail">
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
          <h3>Output Measurements</h3>
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
          <h3>Input Measurements</h3>
          <div class="measurements">
            <div class="measurement">
              <span class="label">Input Voltage</span>
              <span class="value">{channelData.inputVoltage?.toFixed(3) || '0.000'} V</span>
            </div>
            <div class="measurement">
              <span class="label">Input Current</span>
              <span class="value">{channelData.inputCurrent?.toFixed(3) || '0.000'} A</span>
            </div>
            <div class="measurement">
              <span class="label">Input Power</span>
              <span class="value">{channelData.inputPower?.toFixed(3) || '0.000'} W</span>
            </div>
            <div class="measurement">
              <span class="label">Efficiency</span>
              <span class="value">
                {channelData.inputPower > 0 ? 
                  (channelData.power / channelData.inputPower * 100).toFixed(1) : '0.0'
                }%
              </span>
            </div>
          </div>
        </div>
        
        <div class="section">
          <h3>Target Settings</h3>
          <div class="measurements">
            <div class="measurement">
              <span class="label">Target Voltage</span>
              <span class="value">{channelData.targetVoltage?.toFixed(3) || '0.000'} V</span>
            </div>
            <div class="measurement">
              <span class="label">Target Current</span>
              <span class="value">{channelData.targetCurrent?.toFixed(3) || '0.000'} A</span>
            </div>
            <div class="measurement">
              <span class="label">Target Power</span>
              <span class="value">{channelData.targetPower?.toFixed(3) || '0.000'} W</span>
            </div>
            <div class="measurement">
              <span class="label">Mode</span>
              <span class="value">{channelData.mode}</span>
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
        <WaveformChart data={channelData.waveformData} {isRecording} />
        
        <h3 style="margin-top: 2rem;">Timestamp Analysis</h3>
        <TimestampAnalysis {channel} {isRecording} />
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
  
  .back-button:hover {
    background-color: #f0f0f0;
  }
  
  h2 {
    margin: 0;
    color: #333;
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
  
  h3 {
    margin: 0 0 1rem 0;
    font-size: 1.125rem;
    color: #555;
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
  
  .parameter:last-child {
    margin-bottom: 0;
  }
  
  label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
    color: #666;
  }
  
  input {
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }
  
  button {
    background-color: #2196f3;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.875rem;
  }
  
  button:hover {
    background-color: #1976d2;
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
  
  .label {
    font-size: 0.75rem;
    color: #666;
    margin-bottom: 0.25rem;
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
  
  .record-button {
    background-color: #ff5722;
  }
  
  .record-button:hover {
    background-color: #e64a19;
  }
  
  .stop-button {
    background-color: #f44336;
  }
  
  .stop-button:hover {
    background-color: #d32f2f;
  }
  
  .recording-indicator {
    color: #f44336;
    font-weight: 600;
    animation: pulse 1s infinite;
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }
  
  .data-points {
    font-size: 0.875rem;
    color: #666;
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