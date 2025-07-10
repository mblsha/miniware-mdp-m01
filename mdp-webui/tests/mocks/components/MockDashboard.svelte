<script>
  export let onselectchannel = undefined;
</script>

<div data-testid="mock-dashboard">
  <h2>Mock Dashboard</h2>
  <button onclick={() => onselectchannel?.(0)}>Channel 0</button>
  <button onclick={() => onselectchannel?.(1)}>Channel 1</button>
</div>