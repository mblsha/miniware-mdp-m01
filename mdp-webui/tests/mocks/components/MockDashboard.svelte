<script>
  import { channelStore } from '$lib/stores/channels.js';
  import ChannelCard from './MockChannelCard.svelte';
  
  export let onselectchannel = undefined;
  
  const { channels, activeChannel } = channelStore;
  
  function selectChannel(channel) {
    onselectchannel?.(channel);
  }
</script>

<div class="dashboard" data-testid="mock-dashboard">
  <div class="channel-grid">
    {#each $channels as channel (channel.channel)}
      <ChannelCard 
        {channel} 
        active={channel.channel === $activeChannel}
        onclick={() => selectChannel(channel.channel)}
      />
    {/each}
  </div>
</div>

<style>
  .dashboard {
    flex: 1;
    padding: 2rem;
  }
  
  .channel-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
  }
</style>