cmake_minimum_required(VERSION 4.0)

find_package(cmake-bare REQUIRED PATHS node_modules/cmake-bare)
find_package(cmake-fetch REQUIRED PATHS node_modules/cmake-fetch)
find_package(cmake-napi REQUIRED PATHS node_modules/cmake-napi)
find_package(cmake-npm REQUIRED PATHS node_modules/cmake-npm)

project(bare_lief C CXX)

fetch_package("github:holepunchto/libjstl#ecd945a")

set(LIEF_USE_CCACHE OFF)

fetch_package("github:lief-project/LIEF#b1ac356")

add_bare_module(bare_lief)

target_sources(
  ${bare_lief}
  PRIVATE
    binding.cc
    lib/handle.h
    lib/macho.h
    lib/elf.h
)

target_link_libraries(
  ${bare_lief}
  PRIVATE
    jstl
  PRIVATE
    $<TARGET_OBJECTS:LIEF::LIEF>
  PUBLIC
    LIEF::LIEF
)

add_napi_module(bare_lief_napi)

target_sources(
  ${bare_lief_napi}
  PRIVATE
    binding.cc
    lib/handle.h
    lib/macho.h
    lib/elf.h
)

target_compile_definitions(
  ${bare_lief_napi}
  PRIVATE
    NAPI_VERSION=9
)

target_link_libraries(
  ${bare_lief_napi}
  PRIVATE
    jstl
  PRIVATE
    $<TARGET_OBJECTS:LIEF::LIEF>
  PUBLIC
    LIEF::LIEF
)

resolve_node_module(bare-compat-napi compat)

target_include_directories(
  ${bare_lief_napi}
  PRIVATE
    "${compat}/include"
)

if(PROJECT_IS_TOP_LEVEL)
  add_subdirectory(test)
endif()
