<script>
  import { serialConnection as defaultSerialConnection, ConnectionStatus } from './lib/serial.js';
  import { channelStore as defaultChannelStore } from './lib/stores/channels.js';
  import Dashboard from './lib/components/Dashboard.svelte';
  import ChannelDetail from './lib/components/ChannelDetail.svelte';
  
  // Allow dependency injection for testing
  export let serialConnection = defaultSerialConnection;
  export let channelStore = defaultChannelStore;
  
  let currentView = 'dashboard';
  let selectedChannel = 0;
  
  // Extract stores from serialConnection object (now reactive to prop changes)
  $: ({ status, error, deviceType } = serialConnection);
  
  async function handleConnect() {
    try {
      await serialConnection.connect();
    } catch (error) {
      console.error('Connection failed:', error);
    }
  }
  
  async function handleDisconnect() {
    await serialConnection.disconnect();
  }
  
  export function showChannelDetail(channel) {
    selectedChannel = channel;
    currentView = 'detail';
  }
  
  export function showDashboard() {
    currentView = 'dashboard';
  }
</script>

<main>
  <header>
    <h1>MDP-WebUI</h1>
    <div class="connection-status">
      {#if $status === ConnectionStatus.DISCONNECTED}
        <button onclick={handleConnect}>Connect</button>
      {:else if $status === ConnectionStatus.CONNECTING}
        <span class="status connecting">Connecting...</span>
      {:else if $status === ConnectionStatus.CONNECTED}
        <span class="status connected">Connected</span>
        {#if $deviceType}
          <span class="device-type">({$deviceType.type})</span>
        {/if}
        <button onclick={handleDisconnect}>Disconnect</button>
      {:else if $status === ConnectionStatus.ERROR}
        <span class="status error">Error: {$error}</span>
        <button onclick={handleConnect}>Retry</button>
      {/if}
    </div>
  </header>
  
  {#if $status === ConnectionStatus.CONNECTED}
    {#if currentView === 'dashboard'}
      <Dashboard {channelStore} onselectchannel={showChannelDetail} />
    {:else if currentView === 'detail'}
      <ChannelDetail {channelStore} channel={selectedChannel} onback={showDashboard} />
    {/if}
  {:else}
    <div class="placeholder">
      <p>Connect to your MDP device to begin</p>
    </div>
  {/if}
</main>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #f5f5f5;
  }
  
  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  
  header {
    background-color: #1a1a1a;
    color: white;
    padding: 1rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  }
  
  h1 {
    margin: 0;
    font-size: 1.5rem;
  }
  
  .connection-status {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  
  .status {
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.875rem;
  }
  
  .status.connecting {
    background-color: #ffa500;
    color: white;
  }
  
  .status.connected {
    background-color: #4caf50;
    color: white;
  }
  
  .status.error {
    background-color: #f44336;
    color: white;
  }
  
  .device-type {
    color: #ccc;
    font-size: 0.875rem;
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
  
  .placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #666;
  }
</style>