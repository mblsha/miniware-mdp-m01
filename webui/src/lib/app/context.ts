import { getContext, setContext } from 'svelte';
import type { AppRuntime } from './runtime';

const RUNTIME_CONTEXT_KEY: unique symbol = Symbol('mdp-webui:runtime');

export function setRuntime(runtime: AppRuntime): void {
  setContext(RUNTIME_CONTEXT_KEY, runtime);
}

export function getRuntime(): AppRuntime | undefined {
  return getContext<AppRuntime | undefined>(RUNTIME_CONTEXT_KEY);
}

export function useRuntime(): AppRuntime {
  const runtime = getContext<AppRuntime | undefined>(RUNTIME_CONTEXT_KEY);
  if (!runtime) {
    throw new Error('AppRuntime not found in Svelte context');
  }
  return runtime;
}
