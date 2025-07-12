import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { createMockSerial, MockSerialPort } from './tests/mocks/serial-api.js';
import { TestSerialConnection, ConnectionStatus } from './tests/mocks/test-serial-connection.js';
import App from './src/App.svelte';

// Mock the serial connection module to use TestSerialConnection
const mockSerial = createMockSerial();
global.navigator.serial = mockSerial;

const testConnection = new TestSerialConnection();

console.log('Testing connection...');

try {
  const mockPort = new MockSerialPort();
  mockSerial.setNextPort(mockPort);
  
  console.log('Before connect, status:', testConnection.statusStore);
  await testConnection.connect();
  console.log('After connect, status:', testConnection.statusStore);
  
} catch (error) {
  console.error('Connection failed:', error);
}
EOF < /dev/null