<script>
  export let channel = {};
  export let active = false;
  export let onclick = () => {};
  
  function handleClick() {
    onclick();
  }
</script>

<div 
  class="channel-card {active ? 'active' : ''}"
  data-testid="channel-card-{channel.channel}"
  data-channel={channel.channel}
  on:pointerup={handleClick}
  on:keydown={(e) => e.key === 'Enter' && handleClick()}
  role="button"
  tabindex="0"
>
  <h3>Channel {channel.channel + 1}</h3>
  <div class="status">
    <span class="online-status" class:online={channel.online}>
      {channel.online ? 'Online' : 'Offline'}
    </span>
    <span class="machine-type">{channel.machineType || 'Unknown'}</span>
  </div>
  <div class="measurements">
    <div>{(channel.voltage || 0).toFixed(3)} V</div>
    <div>{(channel.current || 0).toFixed(3)} A</div>
    <div>{(channel.power || 0).toFixed(3)} W</div>
    <div>{(channel.temperature || 0).toFixed(1)} °C</div>
  </div>
</div>

<style>
  .channel-card {
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.2s;
  }
  
  .channel-card:hover {
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  .channel-card.active {
    border-color: #007bff;
    background-color: #f0f8ff;
  }
  
  .online-status.online {
    color: #28a745;
  }
  
  .measurements {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    margin-top: 8px;
  }
</style>