<script lang="ts">
  import type { Readable } from 'svelte/store';
  import type { Channel } from '$lib/types';
  import type { ChannelStore } from '$lib/stores/channels';
  import { getRuntime } from '$lib/app/context';
  import ChannelCard from './ChannelCard.svelte';
  
  export let channelStore: ChannelStore | undefined = undefined;
  export let onselectchannel: ((_channel: number) => void) | undefined = undefined;
  
  let channels: Readable<Channel[]>;
  let activeChannel: Readable<number>;

  let resolvedChannelStore: ChannelStore;
  $: {
    const runtime = getRuntime();
    const resolved = channelStore ?? runtime?.channels;
    if (!resolved) {
      throw new Error('Dashboard requires `channelStore` prop or AppRuntime context');
    }
    resolvedChannelStore = resolved;
  }
  
  $: ({ channels, activeChannel } = resolvedChannelStore);
  
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
