<script>
  import { serialConnection as defaultSerialConnection, ConnectionStatus } from './lib/serial.js';
  import { channelStore as defaultChannelStore } from './lib/stores/channels.js';
  import { debugEnabled } from './lib/debug-logger.js';
  import Dashboard from './lib/components/Dashboard.svelte';
  import ChannelDetail from './lib/components/ChannelDetail.svelte';
  import ThemeToggle from './lib/components/ThemeToggle.svelte';
  import { theme } from './lib/stores/theme.js';
  import { onMount } from 'svelte';
  
  // Allow dependency injection for testing
  export let serialConnection = defaultSerialConnection;
  export let channelStore = defaultChannelStore;

  let currentView = 'dashboard';
  let selectedChannel = 0;

  // Initialize theme on mount
  onMount(() => {
    theme.init();
  });
  
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

<ThemeToggle />

<main>
  <header>
    <h1>MDP-WebUI</h1>
    <div class="header-controls">
      <div class="debug-controls">
        <label class="debug-checkbox">
          <input type="checkbox" bind:checked={$debugEnabled} />
          console.log incoming data
        </label>
      </div>
      <div class="connection-status">
        {#if $status === ConnectionStatus.DISCONNECTED}
          <button onpointerup={handleConnect}>Connect</button>
        {:else if $status === ConnectionStatus.CONNECTING}
          <span class="status connecting">Connecting...</span>
        {:else if $status === ConnectionStatus.CONNECTED}
          <span class="status connected">Connected</span>
          {#if $deviceType}
            <span class="device-type">({$deviceType.type})</span>
          {/if}
          <button onpointerup={handleDisconnect}>Disconnect</button>
        {:else if $status === ConnectionStatus.ERROR}
          <span class="status error">Error: {$error}</span>
          <button onpointerup={handleConnect}>Retry</button>
        {/if}
      </div>
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
    background-color: var(--bg-color);
    color: var(--text-color);
  }
  
  main {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  
  header {
    background-color: var(--bg-color);
    color: var(--text-color);
    padding: 1rem 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    border-bottom: 1px solid var(--chart-grid-color);
  }
  
  h1 {
    margin: 0;
    font-size: 1.5rem;
  }
  
  .header-controls {
    display: flex;
    align-items: center;
    gap: 2rem;
  }
  
  .debug-controls {
    display: flex;
    align-items: center;
  }
  
  .debug-checkbox {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-size: 0.875rem;
    color: var(--text-color-secondary);
  }
  
  .debug-checkbox input[type="checkbox"] {
    margin: 0;
    cursor: pointer;
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
    color: var(--text-color-secondary);
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
    touch-action: manipulation;
    user-select: none;
  }
  
  button:hover {
    background-color: #1976d2;
  }
  
  button:active {
    transform: scale(0.98);
  }
  
  .placeholder {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-color-secondary);
  }
</style>