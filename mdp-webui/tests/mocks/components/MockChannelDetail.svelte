<script>
  export let channel = 0;
  export let onback = undefined;
</script>

<div data-testid="mock-channel-detail">
  <h2>Mock Channel Detail</h2>
  <p>Channel: {channel}</p>
  <button onclick={() => onback?.()}>Back</button>
</div>