import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';
import { createRuntime } from './lib/app/runtime';

const target = document.getElementById('app');
if (!target) throw new Error('Could not find app element');

const runtime = createRuntime();

const app = mount(App, {
  target: target,
  props: { runtime },
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => runtime.destroy());
}

export default app
