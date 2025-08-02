import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { initializeTimeseriesIntegration } from './lib/stores/timeseries-integration.js'

initializeTimeseriesIntegration()

const target = document.getElementById('app');
if (!target) throw new Error('Could not find app element');

const app = mount(App, {
  target: target,
})

export default app
