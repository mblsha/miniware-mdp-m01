<script>
  export let channel;
  export let active = false;
  export let onclick = undefined;
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
    
    <div class="measurements">
      <div class="measurement">
        <span class="label">Voltage</span>
        <span class="value">{channel.voltage.toFixed(3)} V</span>
      </div>
      <div class="measurement">
        <span class="label">Current</span>
        <span class="value">{channel.current.toFixed(3)} A</span>
      </div>
      <div class="measurement">
        <span class="label">Power</span>
        <span class="value">{channel.power.toFixed(3)} W</span>
      </div>
      <div class="measurement">
        <span class="label">Temperature</span>
        <span class="value">{channel.temperature.toFixed(1)} °C</span>
      </div>
    </div>
    
    <div class="output-status" class:on={channel.isOutput}>
      Output: {channel.isOutput ? 'ON' : 'OFF'}
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
  
  .measurements {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.75rem;
    margin-bottom: 1rem;
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
    font-size: 1.125rem;
    font-weight: 600;
    color: #333;
  }
  
  .output-status {
    text-align: center;
    padding: 0.5rem;
    border-radius: 4px;
    background-color: #f0f0f0;
    color: #666;
    font-weight: 500;
  }
  
  .output-status.on {
    background-color: #e8f5e9;
    color: #2e7d32;
  }
  
  .offline-message {
    text-align: center;
    color: #999;
    padding: 2rem 0;
  }
</style>