<script>
  import OutputButton from './OutputButton.svelte';
  import Sparkline from './Sparkline.svelte';
  
  export let channel;
  export let active = false;
  export let onclick = undefined;
  
  let showModeDetails = false;
  
  function getAvailableModes(machineType) {
    if (machineType === 'L1060') {
      return ['CC', 'CV', 'CR', 'CP'];
    } else if (machineType === 'P906') {
      return ['CC', 'CV'];
    }
    return [];
  }
  
  function getModeDescription(mode) {
    const descriptions = {
      'CC': 'Constant Current - Device maintains set current',
      'CV': 'Constant Voltage - Device maintains set voltage',
      'CR': 'Constant Resistance - Device simulates fixed resistance',
      'CP': 'Constant Power - Device maintains constant power'
    };
    return descriptions[mode] || 'Unknown mode';
  }
  
  function toggleModeDetails(event) {
    event.stopPropagation();
    showModeDetails = !showModeDetails;
  }
</script>

<div class="channel-card" class:active class:online={channel.online}
     onpointerup={onclick}
     onkeydown={(e) => e.key === 'Enter' && onclick?.()} 
     role="button" 
     tabindex="0">
  <div class="header">
    <h3>Channel {channel.channel + 1}</h3>
    <span class="status" class:online={channel.online}>
      {channel.online ? 'Online' : 'Offline'}
    </span>
  </div>
  
  {#if channel.online}
    <div class="info">
      <div class="machine-type">{channel.machineType}</div>
    </div>
    
    <div class="measurements-table">
      <div class="table-header">
        <div class="header-cell"></div>
        <div class="header-cell">ACTUAL</div>
        <div class="header-cell">TARGET</div>
        <div class="header-cell">TREND</div>
      </div>
      <div class="table-row">
        <div class="label-cell">Voltage</div>
        <div class="value-cell">{channel.voltage.toFixed(3)} V</div>
        <div class="value-cell">{(channel.targetVoltage || 0).toFixed(3)} V</div>
        <div class="sparkline-cell">
          <Sparkline 
            channel={channel.channel} 
            metric="voltage" 
            targetValue={channel.targetVoltage}
            width={80} 
            height={30} 
            showAxes={false}
            showTooltip={true}
          />
        </div>
      </div>
      <div class="table-row">
        <div class="label-cell">Current</div>
        <div class="value-cell">{channel.current.toFixed(3)} A</div>
        <div class="value-cell">{(channel.targetCurrent || 0).toFixed(3)} A</div>
        <div class="sparkline-cell">
          <Sparkline 
            channel={channel.channel} 
            metric="current" 
            targetValue={channel.targetCurrent}
            width={80} 
            height={30} 
            showAxes={false}
            showTooltip={true}
          />
        </div>
      </div>
      <div class="table-row">
        <div class="label-cell">Power</div>
        <div class="value-cell">{channel.power.toFixed(3)} W</div>
        <div class="value-cell">{(channel.targetPower || 0).toFixed(3)} W</div>
        <div class="sparkline-cell">
          <Sparkline 
            channel={channel.channel} 
            metric="power" 
            targetValue={channel.targetPower}
            width={80} 
            height={30} 
            showAxes={false}
            showTooltip={true}
          />
        </div>
      </div>
      <div class="temperature-row">
        <span class="temp-value">{channel.temperature.toFixed(1)} °C</span>
      </div>
    </div>
    
    <div class="status-row">
      <button 
        class="mode-expand-btn"
        onpointerup={toggleModeDetails}
        onkeydown={(e) => e.key === 'Enter' && toggleModeDetails(e)}
        aria-expanded={showModeDetails}
        aria-label="Toggle mode details"
      >
        Mode: {channel.mode}
        <span class="chevron" class:expanded={showModeDetails}>▼</span>
      </button>
      <OutputButton 
        channel={channel.channel}
        isOutput={channel.isOutput}
        machineType={channel.machineType}
        size="small"
      />
    </div>
    
    {#if showModeDetails}
      <div class="mode-details">
        <p class="mode-info">{getModeDescription(channel.mode)}</p>
        <p class="mode-note">Mode is automatically determined by device</p>
        
        <div class="available-modes">
          <span class="modes-label">Available modes:</span>
          {#each getAvailableModes(channel.machineType) as mode}
            <span class="mode-chip" class:current={mode === channel.mode}>
              {mode}
            </span>
          {/each}
        </div>
      </div>
    {/if}
  {:else}
    <div class="offline-message">
      No device connected
    </div>
  {/if}
</div>

<style>
  .channel-card {
    background: white;
    border-radius: 8px;
    padding: 1.25rem;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    cursor: pointer;
    transition: all 0.2s;
    border: 2px solid transparent;
    text-align: left;
    font-family: inherit;
    font-size: inherit;
    color: inherit;
    width: 100%;
    box-sizing: border-box;
    touch-action: manipulation;
    user-select: none;
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
  
  .measurements-table {
    margin-bottom: 1rem;
  }
  
  .table-header {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 100px;
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
    grid-template-columns: 1fr 1fr 1fr 100px;
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
  
  .sparkline-cell {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 30px;
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
  
  .mode-expand-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    padding: 0;
    font-size: 0.875rem;
    color: #666;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    touch-action: manipulation;
    user-select: none;
  }
  
  .mode-expand-btn:hover {
    color: #333;
  }
  
  .chevron {
    font-size: 0.75rem;
    transition: transform 0.2s;
  }
  
  .chevron.expanded {
    transform: rotate(180deg);
  }
  
  .mode-details {
    margin-top: 1rem;
    padding: 1rem;
    background: #f5f5f5;
    border-radius: 4px;
    animation: slideDown 0.2s ease-out;
  }
  
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  
  .mode-info {
    margin: 0 0 0.5rem 0;
    font-size: 0.875rem;
    color: #333;
    line-height: 1.4;
  }
  
  .mode-note {
    margin: 0 0 1rem 0;
    font-size: 0.8rem;
    color: #666;
    font-style: italic;
  }
  
  .available-modes {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  
  .modes-label {
    font-size: 0.8rem;
    color: #666;
    font-weight: 500;
  }
  
  .mode-chip {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    background: white;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    color: #666;
  }
  
  .mode-chip.current {
    background: #2196f3;
    color: white;
    border-color: #2196f3;
  }
  
  .offline-message {
    text-align: center;
    color: #999;
    padding: 2rem 0;
  }
</style>