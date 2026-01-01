// This is a generated file! Please edit source .ksy file and use kaitai-struct-compiler to rebuild

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['kaitai-struct/KaitaiStream'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('kaitai-struct/KaitaiStream'));
  } else {
    root.MiniwareMdpM01 = factory(root.KaitaiStream);
  }
}(typeof self !== 'undefined' ? self : this, function (KaitaiStream) {
var MiniwareMdpM01 = (function() {
  MiniwareMdpM01.L1060Type = Object.freeze({
    CC: 0,
    CV: 1,
    CR: 2,
    CP: 3,

    0: "CC",
    1: "CV",
    2: "CR",
    3: "CP",
  });

  MiniwareMdpM01.P906Type = Object.freeze({
    OFF: 0,
    CC: 1,
    CV: 2,
    ON: 3,

    0: "OFF",
    1: "CC",
    2: "CV",
    3: "ON",
  });

  MiniwareMdpM01.PackType = Object.freeze({
    SYNTHESIZE: 17,
    WAVE: 18,
    ADDR: 19,
    UPDAT_CH: 20,
    MACHINE: 21,
    SET_ISOUTPUT: 22,
    GET_ADDR: 23,
    SET_ADDR: 24,
    SET_CH: 25,
    SET_V: 26,
    SET_I: 27,
    SET_ALL_ADDR: 28,
    START_AUTO_MATCH: 29,
    STOP_AUTO_MATCH: 30,
    RESET_TO_DFU: 31,
    RGB: 32,
    GET_MACHINE: 33,
    HEARTBEAT: 34,
    ERR_240: 35,

    17: "SYNTHESIZE",
    18: "WAVE",
    19: "ADDR",
    20: "UPDAT_CH",
    21: "MACHINE",
    22: "SET_ISOUTPUT",
    23: "GET_ADDR",
    24: "SET_ADDR",
    25: "SET_CH",
    26: "SET_V",
    27: "SET_I",
    28: "SET_ALL_ADDR",
    29: "START_AUTO_MATCH",
    30: "STOP_AUTO_MATCH",
    31: "RESET_TO_DFU",
    32: "RGB",
    33: "GET_MACHINE",
    34: "HEARTBEAT",
    35: "ERR_240",
  });

  MiniwareMdpM01.MachineType = Object.freeze({
    NODE: 0,
    P905: 1,
    P906: 2,
    L1060: 3,

    0: "NODE",
    1: "P905",
    2: "P906",
    3: "L1060",
  });

  function MiniwareMdpM01(_io, _parent, _root) {
    this._io = _io;
    this._parent = _parent;
    this._root = _root || this;

    this._read();
  }
  MiniwareMdpM01.prototype._read = function() {
    this.packets = [];
    var i = 0;
    while (!this._io.isEof()) {
      this.packets.push(new Packet(this._io, this, this._root));
      i++;
    }
  }

  var SetIsoutput = MiniwareMdpM01.SetIsoutput = (function() {
    function SetIsoutput(_io, _parent, _root) {
      this._io = _io;
      this._parent = _parent;
      this._root = _root || this;

      this._read();
    }
    SetIsoutput.prototype._read = function() {
      this.channel = this._io.readU1();
      this.dummy = this._io.readU1();
      this.outputState = this._io.readU1();
    }
    Object.defineProperty(SetIsoutput.prototype, 'isOutputOn', {
      get: function() {
        if (this._m_isOutputOn !== undefined)
          return this._m_isOutputOn;
        this._m_isOutputOn = this.outputState == 1;
        return this._m_isOutputOn;
      }
    });

    return SetIsoutput;
  })();

  var Rgb = MiniwareMdpM01.Rgb = (function() {
    function Rgb(_io, _parent, _root) {
      this._io = _io;
      this._parent = _parent;
      this._root = _root || this;

      this._read();
    }
    Rgb.prototype._read = function() {
      this.channel = this._io.readU1();
      this.dummy = this._io.readU1();
      this.rgbState = this._io.readU1();
    }
    Object.defineProperty(Rgb.prototype, 'isRgbOn', {
      get: function() {
        if (this._m_isRgbOn !== undefined)
          return this._m_isRgbOn;
        this._m_isRgbOn = this.rgbState == 1;
        return this._m_isRgbOn;
      }
    });

    return Rgb;
  })();

  var UpdatCh = MiniwareMdpM01.UpdatCh = (function() {
    function UpdatCh(_io, _parent, _root) {
      this._io = _io;
      this._parent = _parent;
      this._root = _root || this;

      this._read();
    }
    UpdatCh.prototype._read = function() {
      this.channel = this._io.readU1();
      this.dummy = this._io.readU1();
      this.targetChannel = this._io.readU1();
    }

    return UpdatCh;
  })();

  var SetAllAddr = MiniwareMdpM01.SetAllAddr = (function() {
    function SetAllAddr(_io, _parent, _root) {
      this._io = _io;
      this._parent = _parent;
      this._root = _root || this;

      this._read();
    }
    SetAllAddr.prototype._read = function() {
      this.channel = this._io.readU1();
      this.dummy = this._io.readU1();
      this.addresses = [];
      for (var i = 0; i < 6; i++) {
        this.addresses.push(new AddressEntry(this._io, this, this._root));
      }
    }

    var AddressEntry = SetAllAddr.AddressEntry = (function() {
      function AddressEntry(_io, _parent, _root) {
        this._io = _io;
        this._parent = _parent;
        this._root = _root || this;

        this._read();
      }
      AddressEntry.prototype._read = function() {
        this.addrByte0 = this._io.readU1();
        this.addrByte1 = this._io.readU1();
        this.addrByte2 = this._io.readU1();
        this.addrByte3 = this._io.readU1();
        this.addrByte4 = this._io.readU1();
        this.frequencyOffset = this._io.readU1();
      }
      Object.defineProperty(AddressEntry.prototype, 'frequency', {
        get: function() {
          if (this._m_frequency !== undefined)
            return this._m_frequency;
          this._m_frequency = (2400 + this.frequencyOffset);
          return this._m_frequency;
        }
      });
      Object.defineProperty(AddressEntry.prototype, 'isEmpty', {
        get: function() {
          if (this._m_isEmpty !== undefined)
            return this._m_isEmpty;
          this._m_isEmpty =  ((this.addrByte0 == 0) && (this.addrByte1 == 0) && (this.addrByte2 == 0) && (this.addrByte3 == 0) && (this.addrByte4 == 0)) ;
          return this._m_isEmpty;
        }
      });

      return AddressEntry;
    })();

    return SetAllAddr;
  })();

  var Synthesize = MiniwareMdpM01.Synthesize = (function() {
    function Synthesize(_io, _parent, _root) {
      this._io = _io;
      this._parent = _parent;
      this._root = _root || this;

      this._read();
    }
    Synthesize.prototype._read = function() {
      this.channel = this._io.readU1();
      this.dummy = this._io.readU1();
      this.channels = [];
      for (var i = 0; i < 6; i++) {
        this.channels.push(new Chan(this._io, this, this._root));
      }
    }

    var Chan = Synthesize.Chan = (function() {
      function Chan(_io, _parent, _root) {
        this._io = _io;
        this._parent = _parent;
        this._root = _root || this;

        this._read();
      }
      Chan.prototype._read = function() {
        this.num = this._io.readU1();
        this.outVoltageRaw = this._io.readU2le();
        this.outCurrentRaw = this._io.readU2le();
        this.inVoltageRaw = this._io.readU2le();
        this.inCurrentRaw = this._io.readU2le();
        this.setVoltageRaw = this._io.readU2le();
        this.setCurrentRaw = this._io.readU2le();
        this.tempRaw = this._io.readU2le();
        this.online = this._io.readU1();
        this.type = this._io.readU1();
        this.lock = this._io.readU1();
        if (this.type == MiniwareMdpM01.MachineType.L1060) {
          this.statusLoad = this._io.readU1();
        }
        if (this.type != MiniwareMdpM01.MachineType.L1060) {
          this.statusPsu = this._io.readU1();
        }
        this.outputOn = this._io.readU1();
        this.color = this._io.readBytes(3);
        this.error = this._io.readU1();
        this.end = this._io.readBytes(1);
      }
      Object.defineProperty(Chan.prototype, 'inVoltage', {
        get: function() {
          if (this._m_inVoltage !== undefined)
            return this._m_inVoltage;
          this._m_inVoltage = (this.inVoltageRaw / 1000.0);
          return this._m_inVoltage;
        }
      });
      Object.defineProperty(Chan.prototype, 'temperature', {
        get: function() {
          if (this._m_temperature !== undefined)
            return this._m_temperature;
          this._m_temperature = (this.tempRaw / 10.0);
          return this._m_temperature;
        }
      });
      Object.defineProperty(Chan.prototype, 'inCurrent', {
        get: function() {
          if (this._m_inCurrent !== undefined)
            return this._m_inCurrent;
          this._m_inCurrent = (this.inCurrentRaw / 1000.0);
          return this._m_inCurrent;
        }
      });
      Object.defineProperty(Chan.prototype, 'outVoltage', {
        get: function() {
          if (this._m_outVoltage !== undefined)
            return this._m_outVoltage;
          this._m_outVoltage = (this.outVoltageRaw / 1000.0);
          return this._m_outVoltage;
        }
      });
      Object.defineProperty(Chan.prototype, 'outCurrent', {
        get: function() {
          if (this._m_outCurrent !== undefined)
            return this._m_outCurrent;
          this._m_outCurrent = (this.outCurrentRaw / 1000.0);
          return this._m_outCurrent;
        }
      });
      Object.defineProperty(Chan.prototype, 'setCurrent', {
        get: function() {
          if (this._m_setCurrent !== undefined)
            return this._m_setCurrent;
          this._m_setCurrent = (this.setCurrentRaw / 1000.0);
          return this._m_setCurrent;
        }
      });
      Object.defineProperty(Chan.prototype, 'setVoltage', {
        get: function() {
          if (this._m_setVoltage !== undefined)
            return this._m_setVoltage;
          this._m_setVoltage = (this.setVoltageRaw / 1000.0);
          return this._m_setVoltage;
        }
      });

      return Chan;
    })();

    return Synthesize;
  })();

  var Wave = MiniwareMdpM01.Wave = (function() {
    function Wave(_io, _parent, _root) {
      this._io = _io;
      this._parent = _parent;
      this._root = _root || this;

      this._read();
    }
    Wave.prototype._read = function() {
      this.channel = this._io.readU1();
      this.dummy = this._io.readU1();
      this.groups = [];
      for (var i = 0; i < 10; i++) {
        this.groups.push(new Group(this._io, this, this._root));
      }
    }

    var Item = Wave.Item = (function() {
      function Item(_io, _parent, _root) {
        this._io = _io;
        this._parent = _parent;
        this._root = _root || this;

        this._read();
      }
      Item.prototype._read = function() {
        this.voltageRaw = this._io.readU2le();
        this.currentRaw = this._io.readU2le();
      }
      Object.defineProperty(Item.prototype, 'voltage', {
        get: function() {
          if (this._m_voltage !== undefined)
            return this._m_voltage;
          this._m_voltage = (this.voltageRaw / 1000.0);
          return this._m_voltage;
        }
      });
      Object.defineProperty(Item.prototype, 'current', {
        get: function() {
          if (this._m_current !== undefined)
            return this._m_current;
          this._m_current = (this.currentRaw / 1000.0);
          return this._m_current;
        }
      });

      return Item;
    })();

    var Group = Wave.Group = (function() {
      function Group(_io, _parent, _root) {
        this._io = _io;
        this._parent = _parent;
        this._root = _root || this;

        this._read();
      }
      Group.prototype._read = function() {
        this.timestamp = this._io.readU4le();
        this.items = [];
        for (var i = 0; i < this._parent.groupSize; i++) {
          this.items.push(new Item(this._io, this, this._root));
        }
      }

      return Group;
    })();
    Object.defineProperty(Wave.prototype, 'groupSize', {
      get: function() {
        if (this._m_groupSize !== undefined)
          return this._m_groupSize;
        this._m_groupSize = (this._parent.size == 126 ? 2 : (this._parent.size == 206 ? 4 : 0));
        return this._m_groupSize;
      }
    });

    return Wave;
  })();

  var Machine = MiniwareMdpM01.Machine = (function() {
    function Machine(_io, _parent, _root) {
      this._io = _io;
      this._parent = _parent;
      this._root = _root || this;

      this._read();
    }
    Machine.prototype._read = function() {
      this.channel = this._io.readU1();
      this.dummy = this._io.readU1();
      this.machineTypeRaw = this._io.readU1();
    }
    Object.defineProperty(Machine.prototype, 'hasLcd', {
      get: function() {
        if (this._m_hasLcd !== undefined)
          return this._m_hasLcd;
        this._m_hasLcd = this.machineTypeRaw == 16;
        return this._m_hasLcd;
      }
    });
    Object.defineProperty(Machine.prototype, 'machineName', {
      get: function() {
        if (this._m_machineName !== undefined)
          return this._m_machineName;
        this._m_machineName = (this.machineTypeRaw == 16 ? "M01 (LCD)" : "M02 (No LCD)");
        return this._m_machineName;
      }
    });

    return Machine;
  })();

  var SetVoltageCurrent = MiniwareMdpM01.SetVoltageCurrent = (function() {
    function SetVoltageCurrent(_io, _parent, _root) {
      this._io = _io;
      this._parent = _parent;
      this._root = _root || this;

      this._read();
    }
    SetVoltageCurrent.prototype._read = function() {
      this.channel = this._io.readU1();
      this.dummy = this._io.readU1();
      this.voltageRaw = this._io.readU2le();
      this.currentRaw = this._io.readU2le();
    }
    Object.defineProperty(SetVoltageCurrent.prototype, 'voltage', {
      get: function() {
        if (this._m_voltage !== undefined)
          return this._m_voltage;
        this._m_voltage = (this.voltageRaw / 1000.0);
        return this._m_voltage;
      }
    });
    Object.defineProperty(SetVoltageCurrent.prototype, 'current', {
      get: function() {
        if (this._m_current !== undefined)
          return this._m_current;
        this._m_current = (this.currentRaw / 1000.0);
        return this._m_current;
      }
    });

    return SetVoltageCurrent;
  })();

  var Addr = MiniwareMdpM01.Addr = (function() {
    function Addr(_io, _parent, _root) {
      this._io = _io;
      this._parent = _parent;
      this._root = _root || this;

      this._read();
    }
    Addr.prototype._read = function() {
      this.channel = this._io.readU1();
      this.dummy = this._io.readU1();
      this.addresses = [];
      for (var i = 0; i < 6; i++) {
        this.addresses.push(new AddressEntry(this._io, this, this._root));
      }
    }

    var AddressEntry = Addr.AddressEntry = (function() {
      function AddressEntry(_io, _parent, _root) {
        this._io = _io;
        this._parent = _parent;
        this._root = _root || this;

        this._read();
      }
      AddressEntry.prototype._read = function() {
        this.addrByte4 = this._io.readU1();
        this.addrByte3 = this._io.readU1();
        this.addrByte2 = this._io.readU1();
        this.addrByte1 = this._io.readU1();
        this.addrByte0 = this._io.readU1();
        this.frequencyOffset = this._io.readU1();
      }
      Object.defineProperty(AddressEntry.prototype, 'frequency', {
        get: function() {
          if (this._m_frequency !== undefined)
            return this._m_frequency;
          this._m_frequency = (2400 + this.frequencyOffset);
          return this._m_frequency;
        }
      });
      Object.defineProperty(AddressEntry.prototype, 'isEmpty', {
        get: function() {
          if (this._m_isEmpty !== undefined)
            return this._m_isEmpty;
          this._m_isEmpty =  ((this.addrByte0 == 0) && (this.addrByte1 == 0) && (this.addrByte2 == 0) && (this.addrByte3 == 0) && (this.addrByte4 == 0)) ;
          return this._m_isEmpty;
        }
      });

      return AddressEntry;
    })();

    return Addr;
  })();

  var EmptyPacket = MiniwareMdpM01.EmptyPacket = (function() {
    function EmptyPacket(_io, _parent, _root) {
      this._io = _io;
      this._parent = _parent;
      this._root = _root || this;

      this._read();
    }
    EmptyPacket.prototype._read = function() {
      this.channel = this._io.readU1();
      this.dummy = this._io.readU1();
    }

    return EmptyPacket;
  })();

  var SetAddr = MiniwareMdpM01.SetAddr = (function() {
    function SetAddr(_io, _parent, _root) {
      this._io = _io;
      this._parent = _parent;
      this._root = _root || this;

      this._read();
    }
    SetAddr.prototype._read = function() {
      this.channel = this._io.readU1();
      this.dummy = this._io.readU1();
      this.addrByte0 = this._io.readU1();
      this.addrByte1 = this._io.readU1();
      this.addrByte2 = this._io.readU1();
      this.addrByte3 = this._io.readU1();
      this.addrByte4 = this._io.readU1();
      this.frequencyOffset = this._io.readU1();
    }
    Object.defineProperty(SetAddr.prototype, 'frequency', {
      get: function() {
        if (this._m_frequency !== undefined)
          return this._m_frequency;
        this._m_frequency = (2400 + this.frequencyOffset);
        return this._m_frequency;
      }
    });
    Object.defineProperty(SetAddr.prototype, 'isEmpty', {
      get: function() {
        if (this._m_isEmpty !== undefined)
          return this._m_isEmpty;
        this._m_isEmpty =  ((this.addrByte0 == 0) && (this.addrByte1 == 0) && (this.addrByte2 == 0) && (this.addrByte3 == 0) && (this.addrByte4 == 0)) ;
        return this._m_isEmpty;
      }
    });

    return SetAddr;
  })();

  var Packet = MiniwareMdpM01.Packet = (function() {
    function Packet(_io, _parent, _root) {
      this._io = _io;
      this._parent = _parent;
      this._root = _root || this;

      this._read();
    }
    Packet.prototype._read = function() {
      this.magic = this._io.readBytes(2);
      if (!((KaitaiStream.byteArrayCompare(this.magic, [90, 90]) == 0))) {
        throw new KaitaiStream.ValidationNotEqualError([90, 90], this.magic, this._io, "/types/packet/seq/0");
      }
      this.packType = this._io.readU1();
      this.size = this._io.readU1();
      switch (this.packType) {
      case MiniwareMdpM01.PackType.SET_CH:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new EmptyPacket(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.RESET_TO_DFU:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new EmptyPacket(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.ADDR:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new Addr(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.RGB:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new Rgb(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.START_AUTO_MATCH:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new EmptyPacket(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.UPDAT_CH:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new UpdatCh(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.MACHINE:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new Machine(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.GET_MACHINE:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new EmptyPacket(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.SET_V:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new SetVoltageCurrent(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.SYNTHESIZE:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new Synthesize(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.SET_ALL_ADDR:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new SetAllAddr(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.HEARTBEAT:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new EmptyPacket(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.SET_ISOUTPUT:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new SetIsoutput(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.WAVE:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new Wave(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.SET_I:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new SetVoltageCurrent(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.STOP_AUTO_MATCH:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new EmptyPacket(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.ERR_240:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new EmptyPacket(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.SET_ADDR:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new SetAddr(_io__raw_data, this, this._root);
        break;
      case MiniwareMdpM01.PackType.GET_ADDR:
        this._raw_data = this._io.readBytes((this.size - 4));
        var _io__raw_data = new KaitaiStream(this._raw_data);
        this.data = new EmptyPacket(_io__raw_data, this, this._root);
        break;
      default:
        this.data = this._io.readBytes((this.size - 4));
        break;
      }
    }

    return Packet;
  })();

  return MiniwareMdpM01;
})();
return MiniwareMdpM01;
}));
