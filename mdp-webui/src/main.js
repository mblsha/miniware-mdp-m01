import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { initializeTimeseriesIntegration } from './lib/stores/timeseries-integration.js'

initializeTimeseriesIntegration()

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app
