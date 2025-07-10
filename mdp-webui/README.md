# MDP-WebUI

A web-based interface for the Miniware MDP (M01/M02) multi-channel power supply system. This application provides real-time monitoring, control, and data logging capabilities directly from your web browser.

## Features

- **Real-time Dashboard**: Monitor all 6 channels simultaneously with live voltage, current, power, and temperature readings
- **Channel Control**: Set voltage/current parameters and toggle output states for each channel
- **Waveform Recording**: Capture time-series data with interactive visualization
- **Data Export**: Export recorded waveforms as CSV files for external analysis
- **Web Serial API**: Direct USB communication without drivers or installation

## Requirements

- Modern web browser with Web Serial API support (Chrome, Edge, Opera)
- Miniware MDP M01/M02 device connected via USB

## Installation

1. Install dependencies:
```bash
npm install --legacy-peer-deps
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to http://localhost:5173

## Usage

1. Click "Connect" and select your MDP device from the serial port list
2. The dashboard will display all connected channels
3. Click any channel card to access detailed controls
4. Use the recording feature to capture and analyze waveform data

## Architecture

- **Frontend**: Svelte framework for reactive UI
- **Communication**: Web Serial API for direct USB access
- **Protocol**: Binary protocol parsed using Kaitai Struct
- **Visualization**: uPlot for high-performance charting

## Development

The project structure:
- `/src/lib/serial.js` - Serial connection management
- `/src/lib/packet-encoder.js` - Binary packet encoding
- `/src/lib/packet-decoder.js` - Binary packet decoding using Kaitai
- `/src/lib/stores/channels.js` - Global state management
- `/src/lib/components/` - UI components

## License

This project is part of the miniware-mdp-m01 repository.