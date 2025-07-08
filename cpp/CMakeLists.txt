cmake_minimum_required(VERSION 3.16)
project(mdp_parser VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required Qt components
find_package(Qt6 REQUIRED COMPONENTS Core Charts Test)

# Enable Qt MOC
set(CMAKE_AUTOMOC ON)

# Create main executable
qt_add_executable(mdp_parser
    main.cpp
    processingdata.cpp
    processingdata.h
    machine.h
)

# Link Qt libraries
target_link_libraries(mdp_parser PRIVATE 
    Qt6::Core
    Qt6::Charts
)

# Set up include directories
target_include_directories(mdp_parser PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

# Enable testing
enable_testing()

# Find Google Test
find_package(GTest REQUIRED)

# Create test executable
qt_add_executable(mdp_parser_test
    tests/test_wave_parser.cpp
    tests/test_synthesize_parser.cpp
    tests/test_addr_parser.cpp
    tests/test_updat_ch_parser.cpp
    tests/test_machine_parser.cpp
    tests/test_err240_parser.cpp
    tests/test_heartbeat_generator.cpp
    tests/test_set_ch_generator.cpp
    tests/test_set_v_generator.cpp
    tests/test_set_i_generator.cpp
    tests/test_set_addr_generator.cpp
    tests/test_set_all_addr_generator.cpp
    tests/test_set_isoutput_generator.cpp
    tests/test_get_addr_generator.cpp
    tests/test_get_machine_generator.cpp
    tests/test_start_auto_match_generator.cpp
    tests/test_stop_auto_match_generator.cpp
    tests/test_rgb_generator.cpp
    processingdata.cpp
    processingdata.h
    machine.h
)

# Link test libraries
target_link_libraries(mdp_parser_test PRIVATE 
    Qt6::Core
    Qt6::Charts
    Qt6::Test
    GTest::gtest_main
    GTest::gtest
)

# Add tests
include(GoogleTest)
gtest_discover_tests(mdp_parser_test)