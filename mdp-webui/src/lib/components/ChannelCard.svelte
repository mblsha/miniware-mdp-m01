<script>
  import { channelStore } from '../stores/channels.js';
  
  export let channel;
  export let active = false;
  export let onclick = undefined;
  
  async function toggleOutput(event) {
    event.stopPropagation(); // Prevent card click when clicking output button
    await channelStore.setOutput(channel.channel, !channel.isOutput);
  }
</script>

<button type="button" class="channel-card" class:active class:online={channel.online} {onclick}>
  <div class="header">
    <h3>Channel {channel.channel + 1}</h3>
    <span class="status" class:online={channel.online}>
      {channel.online ? 'Online' : 'Offline'}
    </span>
  </div>
  
  {#if channel.online}
    <div class="info">
      <div class="machine-type">{channel.machineType}</div>
      <div class="mode">Mode: {channel.mode}</div>
    </div>
    
    <div class="measurements-table">
      <div class="table-header">
        <div class="header-cell"></div>
        <div class="header-cell">ACTUAL</div>
        <div class="header-cell">TARGET</div>
      </div>
      <div class="table-row">
        <div class="label-cell">Voltage</div>
        <div class="value-cell">{channel.voltage.toFixed(3)}V</div>
        <div class="value-cell">{channel.targetVoltage.toFixed(3)}V</div>
      </div>
      <div class="table-row">
        <div class="label-cell">Current</div>
        <div class="value-cell">{channel.current.toFixed(3)}A</div>
        <div class="value-cell">{channel.targetCurrent.toFixed(3)}A</div>
      </div>
      <div class="table-row">
        <div class="label-cell">Power</div>
        <div class="value-cell">{channel.power.toFixed(3)}W</div>
        <div class="value-cell">{channel.targetPower.toFixed(3)}W</div>
      </div>
      <div class="temperature-row">
        <span class="temp-value">{channel.temperature.toFixed(1)}°C</span>
      </div>
    </div>
    
    <div class="status-row">
      <span class="mode-display">Mode: {channel.mode}</span>
      <button 
        class="output-button" 
        class:on={channel.isOutput}
        onclick={toggleOutput}
        type="button"
      >
        Output: {channel.isOutput ? 'ON' : 'OFF'}
      </button>
    </div>
  {:else}
    <div class="offline-message">
      No device connected
    </div>
  {/if}
</button>

<style>
  .channel-card {
    background: white;
    border-radius: 8px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    cursor: pointer;
    transition: all 0.2s;
    border: 2px solid transparent;
    text-align: left;
    font-family: inherit;
    font-size: inherit;
    color: inherit;
    width: 100%;
  }
  
  .channel-card:hover {
    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
  }
  
  .channel-card.active {
    border-color: #2196f3;
  }
  
  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  
  h3 {
    margin: 0;
    font-size: 1.25rem;
    color: #333;
  }
  
  .status {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    background-color: #ccc;
    color: white;
  }
  
  .status.online {
    background-color: #4caf50;
  }
  
  .info {
    margin-bottom: 1rem;
  }
  
  .machine-type {
    font-weight: 600;
    color: #555;
    margin-bottom: 0.25rem;
  }
  
  .mode {
    font-size: 0.875rem;
    color: #666;
  }
  
  .measurements-table {
    margin-bottom: 1rem;
  }
  
  .table-header {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    padding-bottom: 0.25rem;
    border-bottom: 1px solid #e0e0e0;
  }
  
  .header-cell {
    font-size: 0.75rem;
    font-weight: 600;
    color: #666;
    text-align: center;
  }
  
  .header-cell:first-child {
    text-align: left;
  }
  
  .table-row {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    align-items: center;
  }
  
  .label-cell {
    font-size: 0.875rem;
    color: #666;
    font-weight: 500;
  }
  
  .value-cell {
    font-size: 1rem;
    font-weight: 600;
    color: #333;
    text-align: center;
  }
  
  .temperature-row {
    margin-top: 0.75rem;
    padding-top: 0.75rem;
    border-top: 1px solid #e0e0e0;
    text-align: center;
  }
  
  .temp-value {
    font-size: 0.875rem;
    color: #666;
    font-weight: 500;
  }
  
  .status-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }
  
  .mode-display {
    font-size: 0.875rem;
    color: #666;
    font-weight: 500;
  }
  
  .output-button {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    border: 1px solid #ccc;
    background-color: #f44336;
    color: white;
    font-weight: 500;
    font-size: 0.875rem;
    text-align: center;
    min-width: 80px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .output-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }
  
  .output-button.on {
    background-color: #4caf50;
    border-color: #45a049;
  }
  
  .output-button.on:hover {
    background-color: #45a049;
  }
  
  .output-button:not(.on):hover {
    background-color: #d32f2f;
  }
  
  .offline-message {
    text-align: center;
    color: #999;
    padding: 2rem 0;
  }
</style>