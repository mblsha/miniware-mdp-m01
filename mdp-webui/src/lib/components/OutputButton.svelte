<script>
  import { channelStore } from '../stores/channels.js';
  import { createEventDispatcher } from 'svelte';

  export let channel;
  export let isOutput;
  export let machineType;
  export let disabled = false;
  export let size = 'normal'; // 'small' or 'normal'

  const dispatch = createEventDispatcher();

  // State for optimistic updates
  let optimisticState = null;
  let isWaitingForAck = false;
  let timeoutId = null;

  // Get button text based on device type
  $: buttonText = getButtonText(machineType);
  $: displayState = optimisticState !== null ? optimisticState : isOutput;

  function getButtonText(type) {
    if (type === 'L1060 Load' || type === 'L1060') {
      return 'Input';
    }
    return 'Output';
  }

  async function toggleOutput(event) {
    if (event) {
      event.stopPropagation();
    }
    
    if (isWaitingForAck || disabled) {
      return;
    }

    const newState = !displayState;
    
    // Set optimistic state immediately
    optimisticState = newState;
    isWaitingForAck = true;
    
    // Clear any existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    // Set timeout to revert if no acknowledgement
    timeoutId = setTimeout(() => {
      optimisticState = null;
      isWaitingForAck = false;
      console.warn(`Output toggle timeout for channel ${channel} - reverting to actual state`);
    }, 5000);

    try {
      await channelStore.setOutput(channel, newState);
      
      // Success - wait for actual state update to clear optimistic state
      // The actual state will be updated by the synthesize packet handler
      dispatch('toggle', { channel, newState });
      
    } catch (error) {
      console.error(`Failed to toggle output for channel ${channel}:`, error);
      
      // Revert optimistic state on error
      optimisticState = null;
      isWaitingForAck = false;
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    }
  }

  // Clear optimistic state when actual state matches optimistic state
  $: if (optimisticState !== null && isOutput === optimisticState && isWaitingForAck) {
    optimisticState = null;
    isWaitingForAck = false;
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  }

  // Cleanup timeout on component destroy
  import { onDestroy } from 'svelte';
  onDestroy(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  });
</script>

<button 
  class="output-button"
  class:on={displayState}
  class:waiting={isWaitingForAck}
  class:small={size === 'small'}
  onpointerup={toggleOutput}
  {disabled}
  type="button"
>
  {buttonText}: {displayState ? 'ON' : 'OFF'}
  {#if isWaitingForAck}
    <span class="spinner"></span>
  {/if}
</button>

<style>
  .output-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    background-color: #f44336;
    color: white;
    font-weight: 500;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
    touch-action: manipulation;
    user-select: none;
    min-width: 100px;
    justify-content: center;
  }

  .output-button.small {
    padding: 6px 12px;
    font-size: 12px;
    min-width: 80px;
  }

  .output-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
  }

  .output-button:active {
    transform: scale(0.98);
  }

  .output-button.on {
    background-color: #4caf50;
  }

  .output-button.waiting {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .output-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .output-button:disabled:hover {
    transform: none;
    box-shadow: none;
  }

  .spinner {
    width: 12px;
    height: 12px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .output-button.small .spinner {
    width: 10px;
    height: 10px;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>