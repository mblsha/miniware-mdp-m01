# This is a generated file! Please edit source .ksy file and use kaitai-struct-compiler to rebuild

import kaitaistruct
from kaitaistruct import KaitaiStruct, KaitaiStream, BytesIO
from enum import Enum


if getattr(kaitaistruct, 'API_VERSION', (0, 9)) < (0, 9):
    raise Exception("Incompatible Kaitai Struct Python API: 0.9 or later is required, but you have %s" % (kaitaistruct.__version__))

class MiniwareMdpM01(KaitaiStruct):

    class L1060Type(Enum):
        cc = 0
        cv = 1
        cr = 2
        cp = 3

    class P906Type(Enum):
        false = 0
        cc = 1
        cv = 2
        true = 3

    class PackType(Enum):
        synthesize = 17
        wave = 18
        addr = 19
        updat_ch = 20
        machine = 21
        set_isoutput = 22
        get_addr = 23
        set_addr = 24
        set_ch = 25
        set_v = 26
        set_i = 27
        set_all_addr = 28
        start_auto_match = 29
        stop_auto_match = 30
        reset_to_dfu = 31
        rgb = 32
        get_machine = 33
        heartbeat = 34
        err_240 = 240

    class MachineType(Enum):
        node = 0
        p905 = 1
        p906 = 2
        l1060 = 3
    def __init__(self, _io, _parent=None, _root=None):
        self._io = _io
        self._parent = _parent
        self._root = _root if _root else self
        self._read()

    def _read(self):
        self.packets = []
        i = 0
        while not self._io.is_eof():
            self.packets.append(MiniwareMdpM01.Packet(self._io, self, self._root))
            i += 1


    class Packet(KaitaiStruct):
        def __init__(self, _io, _parent=None, _root=None):
            self._io = _io
            self._parent = _parent
            self._root = _root if _root else self
            self._read()

        def _read(self):
            self.magic = self._io.read_bytes(2)
            if not self.magic == b"\x5A\x5A":
                raise kaitaistruct.ValidationNotEqualError(b"\x5A\x5A", self.magic, self._io, u"/types/packet/seq/0")
            self.pack_type = KaitaiStream.resolve_enum(MiniwareMdpM01.PackType, self._io.read_u1())
            self.size = self._io.read_u1()
            _on = self.pack_type
            if _on == MiniwareMdpM01.PackType.wave:
                self._raw_data = self._io.read_bytes((self.size - 4))
                _io__raw_data = KaitaiStream(BytesIO(self._raw_data))
                self.data = MiniwareMdpM01.Wave(_io__raw_data, self, self._root)
            elif _on == MiniwareMdpM01.PackType.synthesize:
                self._raw_data = self._io.read_bytes((self.size - 4))
                _io__raw_data = KaitaiStream(BytesIO(self._raw_data))
                self.data = MiniwareMdpM01.Synthesize(_io__raw_data, self, self._root)
            else:
                self.data = self._io.read_bytes((self.size - 4))


    class Synthesize(KaitaiStruct):
        def __init__(self, _io, _parent=None, _root=None):
            self._io = _io
            self._parent = _parent
            self._root = _root if _root else self
            self._read()

        def _read(self):
            self.channel = self._io.read_u1()
            self.dummy = self._io.read_u1()
            self.channels = []
            for i in range(6):
                self.channels.append(MiniwareMdpM01.Synthesize.Chan(self._io, self, self._root))


        class Chan(KaitaiStruct):
            def __init__(self, _io, _parent=None, _root=None):
                self._io = _io
                self._parent = _parent
                self._root = _root if _root else self
                self._read()

            def _read(self):
                self.num = self._io.read_u1()
                self.out_voltage_raw = self._io.read_u2le()
                self.out_current_raw = self._io.read_u2le()
                self.in_voltage_raw = self._io.read_u2le()
                self.in_current_raw = self._io.read_u2le()
                self.set_voltage_raw = self._io.read_u2le()
                self.set_current_raw = self._io.read_u2le()
                self.temp_raw = self._io.read_u2le()
                self.online = self._io.read_u1()
                self.type = KaitaiStream.resolve_enum(MiniwareMdpM01.MachineType, self._io.read_u1())
                self.lock = self._io.read_u1()
                if self.type == MiniwareMdpM01.MachineType.l1060:
                    self.status_load = KaitaiStream.resolve_enum(MiniwareMdpM01.L1060Type, self._io.read_u1())

                if self.type != MiniwareMdpM01.MachineType.l1060:
                    self.status_psu = KaitaiStream.resolve_enum(MiniwareMdpM01.P906Type, self._io.read_u1())

                self.output_on = self._io.read_u1()
                self.color = self._io.read_bytes(3)
                self.error = self._io.read_u1()
                self.end = self._io.read_bytes(1)

            @property
            def in_voltage(self):
                if hasattr(self, '_m_in_voltage'):
                    return self._m_in_voltage

                self._m_in_voltage = (self.in_voltage_raw / 1000.0)
                return getattr(self, '_m_in_voltage', None)

            @property
            def temperature(self):
                if hasattr(self, '_m_temperature'):
                    return self._m_temperature

                self._m_temperature = (self.temp_raw / 10.0)
                return getattr(self, '_m_temperature', None)

            @property
            def in_current(self):
                if hasattr(self, '_m_in_current'):
                    return self._m_in_current

                self._m_in_current = (self.in_current_raw / 1000.0)
                return getattr(self, '_m_in_current', None)

            @property
            def out_voltage(self):
                if hasattr(self, '_m_out_voltage'):
                    return self._m_out_voltage

                self._m_out_voltage = (self.out_voltage_raw / 1000.0)
                return getattr(self, '_m_out_voltage', None)

            @property
            def out_current(self):
                if hasattr(self, '_m_out_current'):
                    return self._m_out_current

                self._m_out_current = (self.out_current_raw / 1000.0)
                return getattr(self, '_m_out_current', None)

            @property
            def set_current(self):
                if hasattr(self, '_m_set_current'):
                    return self._m_set_current

                self._m_set_current = (self.set_current_raw / 1000.0)
                return getattr(self, '_m_set_current', None)

            @property
            def set_voltage(self):
                if hasattr(self, '_m_set_voltage'):
                    return self._m_set_voltage

                self._m_set_voltage = (self.set_voltage_raw / 1000.0)
                return getattr(self, '_m_set_voltage', None)



    class Wave(KaitaiStruct):
        def __init__(self, _io, _parent=None, _root=None):
            self._io = _io
            self._parent = _parent
            self._root = _root if _root else self
            self._read()

        def _read(self):
            self.channel = self._io.read_u1()
            self.dummy = self._io.read_u1()
            self.groups = []
            for i in range(10):
                self.groups.append(MiniwareMdpM01.Wave.Group(self._io, self, self._root))


        class Item(KaitaiStruct):
            def __init__(self, _io, _parent=None, _root=None):
                self._io = _io
                self._parent = _parent
                self._root = _root if _root else self
                self._read()

            def _read(self):
                self.voltage_raw = self._io.read_u2le()
                self.current_raw = self._io.read_u2le()

            @property
            def voltage(self):
                if hasattr(self, '_m_voltage'):
                    return self._m_voltage

                self._m_voltage = (self.voltage_raw / 1000.0)
                return getattr(self, '_m_voltage', None)

            @property
            def current(self):
                if hasattr(self, '_m_current'):
                    return self._m_current

                self._m_current = (self.current_raw / 1000.0)
                return getattr(self, '_m_current', None)


        class Group(KaitaiStruct):
            def __init__(self, _io, _parent=None, _root=None):
                self._io = _io
                self._parent = _parent
                self._root = _root if _root else self
                self._read()

            def _read(self):
                self.timestamp = self._io.read_u4le()
                self.items = []
                for i in range(self._parent.group_size):
                    self.items.append(MiniwareMdpM01.Wave.Item(self._io, self, self._root))



        @property
        def group_size(self):
            if hasattr(self, '_m_group_size'):
                return self._m_group_size

            self._m_group_size = (2 if self._parent.size == 126 else (4 if self._parent.size == 206 else 0))
            return getattr(self, '_m_group_size', None)



