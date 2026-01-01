export function createKaitaiMock() {
  const PackType = {
    SYNTHESIZE: 0x11,  // 17
    WAVE: 0x12,        // 18
    ADDR: 0x13,        // 19
    UPDAT_CH: 0x14,    // 20
    MACHINE: 0x15      // 21
  };

  class KaitaiStream {
    constructor(buffer) {
      // Ensure buffer is an ArrayBuffer
      this.buffer = buffer.buffer instanceof ArrayBuffer ? buffer.buffer : buffer;
      this.pos = 0;
      this.view = new DataView(this.buffer);
    }
    
    readU1() {
      return this.view.getUint8(this.pos++);
    }
    
    readU2le() {
      if (this.pos + 2 > this.buffer.byteLength) throw new RangeError("Offset is outside the bounds of the DataView");
      const val = this.view.getUint16(this.pos, true);
      this.pos += 2;
      return val;
    }
    
    readU4le() {
      if (this.pos + 4 > this.buffer.byteLength) throw new RangeError("Offset is outside the bounds of the DataView");
      const val = this.view.getUint32(this.pos, true);
      this.pos += 4;
      return val;
    }
    
    readBytes(n) {
      if (this.pos + n > this.buffer.byteLength) throw new RangeError("Offset is outside the bounds of the DataView");
      const bytes = new Uint8Array(this.buffer.slice(this.pos, this.pos + n));
      this.pos += n;
      return bytes;
    }
  }

  class MiniwareMdpM01 {
    constructor(stream) {
      this.stream = stream;
      this.packets = [];
      this._read();
    }
    
    _read() {
      if (this.stream.buffer.byteLength < 6) return;
      // Read header
      this.header1 = this.stream.readU1();
      this.header2 = this.stream.readU1();
      const packetType = this.stream.readU1();
      this.size = this.stream.readU1();
      this.channel = this.stream.readU1();
      this.checksum = this.stream.readU1();
      
      // Create packet structure matching real Kaitai output
      const packet = {
        packType: packetType,
        size: this.size,
        channel: this.channel,
        checksum: this.checksum,
        data: null
      };
      
      // Read data based on type
      switch (packetType) {
        case PackType.SYNTHESIZE:
          packet.data = this._readSynthesize();
          break;
        case PackType.WAVE:
          packet.data = this._readWave();
          break;
        case PackType.ADDR:
          packet.data = this._readAddress();
          break;
        case PackType.MACHINE:
          packet.data = this._readMachine();
          break;
      }
      
      this.packets.push(packet);
    }
    
    _readSynthesize() {
      const channels = [];
      for (let i = 0; i < 6; i++) {
        const ch = {
          num: this.stream.readU1(),
          outVoltageRaw: this.stream.readU2le(),
          outCurrentRaw: this.stream.readU2le(),
          inVoltageRaw: this.stream.readU2le(),
          inCurrentRaw: this.stream.readU2le(),
          setVoltageRaw: this.stream.readU2le(),
          setCurrentRaw: this.stream.readU2le(),
          tempRaw: this.stream.readU2le(),
          online: this.stream.readU1(),
          type: this.stream.readU1(),
          lock: this.stream.readU1(),
          statusLoad: this.stream.readU1(),
          outputOn: this.stream.readU1(),
          color: this.stream.readBytes(3),
          error: this.stream.readU1(),
          end: this.stream.readBytes(1)
        };
        ch.outVoltage = ch.outVoltageRaw / 1000.0;
        ch.outCurrent = ch.outCurrentRaw / 1000.0;
        ch.temperature = ch.tempRaw / 10.0;
        channels.push(ch);
      }
      return { channels, channel: 0, dummy: 0 };
    }
    
    _readWave() {
      const groups = [];
      const groupCount = 10;
      const pointsPerGroup = this.size === 126 ? 2 : 4;
      
      for (let i = 0; i < groupCount; i++) {
        const group = {
          timestamp: this.stream.readU4le(),
          items: []
        };
        
        for (let j = 0; j < pointsPerGroup; j++) {
          const item = {
            voltageRaw: this.stream.readU2le(),
            currentRaw: this.stream.readU2le()
          };
          item.voltage = item.voltageRaw / 1000.0;
          item.current = item.currentRaw / 1000.0;
          group.items.push(item);
        }
        
        groups.push(group);
      }
      
      return { 
        groups,
        channel: this.channel
      };
    }
    
    _readAddress() {
      const channels = [];
      
      for (let i = 0; i < 6; i++) {
        channels.push({
          address: this.stream.readBytes(5),
          frequencyOffset: this.stream.readU1()
        });
      }
      
      return { addresses: channels };
    }
    
    _readMachine() {
      const channel = this.stream.readU1();
      const dummy = this.stream.readU1();
      const machineTypeRaw = this.stream.readU1();
      return {
        channel,
        dummy,
        machineTypeRaw
      };
    }
  }

  return {
    KaitaiStream,
    MiniwareMdpM01
  };
}
