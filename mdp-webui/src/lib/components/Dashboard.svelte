<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { Channel } from '$lib/types';
  import { channelStore as defaultChannelStore } from '../stores/channels.js';
  import ChannelCard from './ChannelCard.svelte';
  
  export let channelStore = defaultChannelStore;
  export let onselectchannel: ((_channel: number) => void) | undefined = undefined;
  
  let channels: Readable<Channel[]>;
  let activeChannel: Readable<number>;
  
  $: ({ channels, activeChannel } = channelStore);
  
  function selectChannel(channel: number) {
    onselectchannel?.(channel);
  }
</script>

<div class="dashboard">
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
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 1.5rem;
    max-width: 1400px;
    margin: 0 auto;
  }
</style>
