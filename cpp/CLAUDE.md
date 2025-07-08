# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a mixed C++/Python project for handling Miniware MDP (Multi-channel Digital Power) M01/M02 device data. The project provides data logging, parsing, and visualization capabilities for power supply monitoring.

## Repository Structure

- `cpp/` - Qt-based C++ application for real-time data processing
  - `processingdata.h/cpp` - Core data processing class handling serial communication, packet parsing, and real-time charting
- `py/` - Python tools for data parsing and visualization
  - `mdp_m01/` - Main Python package with binary protocol parser
  - `clickhouse-visualize.py` - Data visualization with ClickHouse integration
  - `miniware-marimo.py` - Interactive Marimo notebook

## Key Technical Details

### Protocol Format
- Binary protocol defined in `py/mdp_m01/mdp.ksy` (Kaitai Struct format)
- Packet types: Synthesize (channel status), Wave (measurements), Address, Frequency
- Support for 6 channels with voltage/current/temperature monitoring
- Checksum validation on all packets

### C++ Component
- Requires Qt Framework (QtCore, QtCharts)
- Missing dependency: `machine.h` header file
- Missing build configuration (*.pro or CMakeLists.txt)

### Python Component Dependencies
- kaitaistruct - Binary parsing
- clickhouse_connect - Database connectivity
- marimo - Interactive notebooks
- altair, pandas - Data visualization
- pyserial - Serial communication

## Development Commands

### Python Development
```bash
# Navigate to Python directory
cd py

# Run tests (pytest-style)
python -m pytest mdp_m01/test_parser.py

# Run visualization tools
python clickhouse-visualize.py  # Requires ClickHouse at 'clickhouse' host
python miniware-marimo.py       # Starts Marimo notebook server
```

### C++ Development
Build configuration files are missing. The project requires:
1. Qt development environment setup
2. Creation of appropriate build files (qmake .pro or CMakeLists.txt)
3. Resolution of missing `machine.h` dependency

## Architecture Notes

The project implements a reverse-engineered protocol for Miniware MDP devices based on original source code. Key components:

1. **Serial Communication**: Both C++ and Python components can communicate directly with MDP devices
2. **Data Flow**: Device → Serial → Parser → Storage (ClickHouse) → Visualization
3. **Real-time vs Historical**: C++ for real-time monitoring, Python for historical analysis

## Important Considerations

- The C++ code references Qt's deprecated features and may need updates for newer Qt versions
- Python code assumes ClickHouse is available at hostname 'clickhouse'
- Protocol changes require regenerating parser from `mdp.ksy` using Kaitai Struct compiler