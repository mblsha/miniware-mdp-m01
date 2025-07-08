meta:
  id: miniware_mdp_m01
  file-extension: bin
  endian: le

seq:
  - id: packets
    type: packet
    repeat: eos

types:
  packet:
    seq:
      - id: magic
        contents: [0x5a, 0x5a]
      - id: pack_type
        enum: pack_type
        type: u1
      - id: size
        type: u1
      - id: data
        size: size - 4
        type:
          switch-on: pack_type
          cases:
            'pack_type::wave': wave
            'pack_type::synthesize': synthesize
    -webide-representation: '{pack_type}'

  synthesize:
    types:
      chan:
        instances:
          temperature:
            value: temp_raw / 10.0
          out_voltage:
            value: out_voltage_raw / 1000.0
          out_current:
            value: out_current_raw / 1000.0

          in_voltage:
            value: in_voltage_raw / 1000.0
          in_current:
            value: in_current_raw / 1000.0

          set_voltage:
            value: set_voltage_raw / 1000.0
          set_current:
            value: set_current_raw / 1000.0
        seq:
          - id: num
            type: u1
          - id: out_voltage_raw
            type: u2
          - id: out_current_raw
            type: u2

          - id: in_voltage_raw
            type: u2
          - id: in_current_raw
            type: u2

          - id: set_voltage_raw
            type: u2
          - id: set_current_raw
            type: u2

          - id: temp_raw
            type: u2

          - id: online
            type: u1
          - id: type
            enum: machine_type
            type: u1
          - id: lock
            type: u1

          - id: status_load
            type: u1
            enum: l1060_type
            if: type == machine_type::l1060
          - id: status_psu
            type: u1
            enum: p906_type
            if: type != machine_type::l1060

          - id: output_on
            type: u1

          - id: color
            size: 3

          - id: error
            type: u1
          - id: end
            size: 1
        -webide-representation: 'chan:{num:dec} {type}'
    seq:
      - id: channel
        type: u1
      - id: dummy
        type: u1

      - id: channels
        type: chan
        repeat: expr
        repeat-expr: 6

  wave:
    types:
      item:
        instances:
          voltage:
            value: voltage_raw / 1000.0
          current:
            value: current_raw / 1000.0
        seq:
          - id: voltage_raw
            type: u2
          - id: current_raw
            type: u2
        -webide-representation: '(V:{voltage} C:{current})'

      group:
        seq:
          - id: timestamp
            type: u4
            # type: f4

          # group_size items in a group
          - id: items
            type: item
            repeat: expr
            repeat-expr: _parent.group_size
        -webide-representation: 'ts:{timestamp} {items}'

    instances:
      group_size:
        value: "_parent.size == 126 ? 2 : (_parent.size == 206 ? 4 : 0)"
    seq:
      - id: channel
        type: u1
      - id: dummy
        type: u1

      - id: groups
        type: group
        repeat: expr
        repeat-expr: 10

enums:
  l1060_type:
    0x00: cc
    0x01: cv
    0x02: cr
    0x03: cp

  p906_type:
    0x00: off
    0x01: cc
    0x02: cv
    0x03: on

  pack_type:
    0x11: synthesize
    0x12: wave
    0x13: addr
    0x14: updat_ch
    0x15: machine
    0x16: set_isoutput
    0x17: get_addr
    0x18: set_addr
    0x19: set_ch
    0x1a: set_v
    0x1b: set_i
    0x1c: set_all_addr
    0x1d: start_auto_match
    0x1e: stop_auto_match
    0x1f: reset_to_dfu
    0x20: rgb
    0x21: get_machine
    0x22: heartbeat
    0x23: err_240

  machine_type:
    0x00: node
    0x01: p905
    0x02: p906
    0x03: l1060
