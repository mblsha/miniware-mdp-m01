cmake_minimum_required(VERSION 3.16)
project(mdp_parser VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find required Qt components
find_package(Qt6 REQUIRED COMPONENTS Core Charts Test)

# Enable Qt MOC
set(CMAKE_AUTOMOC ON)

# Find Kaitai Struct Compiler
find_program(KAITAI_STRUCT_COMPILER kaitai-struct-compiler 
    PATHS /usr/local/bin /usr/bin /opt/homebrew/bin
    DOC "Path to kaitai-struct-compiler executable"
)

if(NOT KAITAI_STRUCT_COMPILER)
    message(WARNING "kaitai-struct-compiler not found. Please install it to generate parsers from .ksy files.")
else()
    message(STATUS "Found kaitai-struct-compiler: ${KAITAI_STRUCT_COMPILER}")
endif()

# Set up Kaitai Struct generated files directory
set(KAITAI_GENERATED_DIR ${CMAKE_CURRENT_BINARY_DIR}/kaitai_generated)
file(MAKE_DIRECTORY ${KAITAI_GENERATED_DIR})

# Function to generate C++ parser from .ksy file
function(kaitai_generate_cpp KSY_FILE)
    if(KAITAI_STRUCT_COMPILER)
        # The generated file name is based on the 'id' field in the .ksy file
        set(OUTPUT_CPP ${KAITAI_GENERATED_DIR}/miniware_mdp_m01.cpp)
        set(OUTPUT_H ${KAITAI_GENERATED_DIR}/miniware_mdp_m01.h)
        
        add_custom_command(
            OUTPUT ${OUTPUT_CPP} ${OUTPUT_H}
            COMMAND ${KAITAI_STRUCT_COMPILER}
                --target cpp_stl
                --outdir ${KAITAI_GENERATED_DIR}
                ${CMAKE_CURRENT_SOURCE_DIR}/${KSY_FILE}
            DEPENDS ${CMAKE_CURRENT_SOURCE_DIR}/${KSY_FILE}
            COMMENT "Generating C++ parser from ${KSY_FILE}"
            VERBATIM
        )
        
        # Return the generated files
        set(KAITAI_GENERATED_SOURCES ${OUTPUT_CPP} ${OUTPUT_H} PARENT_SCOPE)
    endif()
endfunction()

# Generate parser from mdp.ksy
kaitai_generate_cpp(mdp.ksy)

# Find or download Kaitai Struct C++ runtime
include(FetchContent)
FetchContent_Declare(
    kaitai_struct_cpp_stl_runtime
    GIT_REPOSITORY https://github.com/kaitai-io/kaitai_struct_cpp_stl_runtime.git
    GIT_TAG        master
)
FetchContent_MakeAvailable(kaitai_struct_cpp_stl_runtime)

# Create a custom target for the generated files
if(KAITAI_STRUCT_COMPILER)
    add_custom_target(generate_kaitai_parser
        DEPENDS ${KAITAI_GENERATED_SOURCES}
    )
endif()

# Create main executable
qt_add_executable(mdp_parser
    main.cpp
    processingdata.cpp
    processingdata.h
    machine.h
)

# Add generated sources if available
if(KAITAI_STRUCT_COMPILER)
    target_sources(mdp_parser PRIVATE ${KAITAI_GENERATED_SOURCES})
    add_dependencies(mdp_parser generate_kaitai_parser)
endif()

# Link Qt libraries and Kaitai runtime
target_link_libraries(mdp_parser PRIVATE 
    Qt6::Core
    Qt6::Charts
    kaitai_struct_cpp_stl_runtime
)

# Set up include directories
target_include_directories(mdp_parser PRIVATE 
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${KAITAI_GENERATED_DIR}
)

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
    tests/test_reset_to_dfu_generator.cpp
    tests/test_kaitai_parser.cpp
    processingdata.cpp
    processingdata.h
    machine.h
)

# Add generated sources to test executable if available
if(KAITAI_STRUCT_COMPILER)
    target_sources(mdp_parser_test PRIVATE ${KAITAI_GENERATED_SOURCES})
    add_dependencies(mdp_parser_test generate_kaitai_parser)
endif()

# Link test libraries
target_link_libraries(mdp_parser_test PRIVATE 
    Qt6::Core
    Qt6::Charts
    Qt6::Test
    GTest::gtest_main
    GTest::gtest
    kaitai_struct_cpp_stl_runtime
)

# Set up include directories for tests
target_include_directories(mdp_parser_test PRIVATE 
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${KAITAI_GENERATED_DIR}
)

# Add tests
include(GoogleTest)
gtest_discover_tests(mdp_parser_test)