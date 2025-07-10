<script>
  import { channelStore } from '../stores/channels.js';
  import ChannelCard from './ChannelCard.svelte';
  
  export let onselectchannel = undefined;
  
  $: channels = channelStore.channels;
  $: activeChannel = channelStore.activeChannel;
  
  function selectChannel(channel) {
    onselectchannel?.(channel);
  }
</script>

<div class="dashboard">
  <h2>Channels Overview</h2>
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
  
  h2 {
    margin: 0 0 1.5rem 0;
    color: #333;
  }
  
  .channel-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1.5rem;
  }
</style>