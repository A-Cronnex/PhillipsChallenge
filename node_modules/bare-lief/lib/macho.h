#pragma once

#include <optional>

#include <assert.h>
#include <bare.h>
#include <js.h>
#include <jstl.h>
#include <stddef.h>
#include <stdint.h>

#include <LIEF/BinaryStream/SpanStream.hpp>
#include <LIEF/MachO.hpp>

#include "handle.h"

using namespace LIEF;

static bare_lief_handle_t<MachO::FatBinary>
bare_lief_macho_fat_binary_create(
  js_env_t *,
  js_receiver_t,
  std::vector<bare_lief_handle_t<MachO::Binary>> binaries
) {
  auto copy = std::vector<std::unique_ptr<MachO::Binary>>();

  copy.reserve(binaries.size());

  for (auto &binary : binaries) {
    copy.push_back(std::unique_ptr<MachO::Binary>(binary.take()));
  }

  auto handle = MachO::FatBinary::create(std::move(copy));

  return bare_lief_handle_t<MachO::FatBinary>(handle.release());
}

static bare_lief_handle_t<MachO::FatBinary>
bare_lief_macho_fat_binary_parse(
  js_env_t *,
  js_receiver_t,
  std::span<uint8_t> buffer
) {
  auto stream = std::make_unique<LIEF::SpanStream>(buffer.data(), buffer.size());

  auto handle = MachO::Parser::parse(std::move(stream));

  return bare_lief_handle_t<MachO::FatBinary>(handle.release());
}

static bare_lief_handle_t<MachO::FatBinary>
bare_lief_macho_fat_binary_merge(
  js_env_t *,
  js_receiver_t,
  std::vector<bare_lief_handle_t<MachO::FatBinary>> binaries
) {
  auto copy = std::vector<std::unique_ptr<MachO::Binary>>();

  copy.reserve(binaries.size());

  for (const auto &binary : binaries) {
    while (auto next = binary->pop_back()) {
      copy.push_back(std::move(next));
    }
  }

  auto handle = MachO::FatBinary::create(std::move(copy));

  return bare_lief_handle_t<MachO::FatBinary>(handle.release());
}

static void
bare_lief_macho_fat_binary_write(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<MachO::FatBinary> binary,
  std::string path
) {
  binary->write(path);
}

static js_arraybuffer_t
bare_lief_macho_fat_binary_get_raw(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<MachO::FatBinary> binary
) {
  int err;

  auto buffer = binary->raw();

  js_arraybuffer_t result;
  err = js_create_arraybuffer(env, buffer, result);
  assert(err == 0);

  return result;
}

static int64_t
bare_lief_marcho_fat_binary_get_size(
  js_env_t *,
  js_receiver_t,
  bare_lief_handle_t<MachO::FatBinary> binary
) {
  return binary->size();
}

static std::optional<bare_lief_handle_t<MachO::Binary>>
bare_lief_macho_fat_binary_get_at(
  js_env_t *env,
  js_receiver_t,
  js_object_t self,
  bare_lief_handle_t<MachO::FatBinary> binary,
  int64_t i
) {
  int err;

  auto handle = binary->at(i);

  if (handle == nullptr) return std::nullopt;

  js_persistent_t<js_object_t> owner;
  err = js_create_reference(env, self, owner);
  assert(err == 0);

  return bare_lief_handle_t<MachO::Binary>(handle, std::move(owner));
}

static std::optional<bare_lief_handle_t<MachO::LoadCommand>>
bare_lief_macho_binary_add_segment_command(
  js_env_t *env,
  js_receiver_t,
  js_object_t self,
  bare_lief_handle_t<MachO::Binary> binary,
  bare_lief_handle_t<MachO::SegmentCommand> command
) {
  int err;

  auto handle = binary->add(*command);

  if (handle == nullptr) return std::nullopt;

  js_persistent_t<js_object_t> owner;
  err = js_create_reference(env, self, owner);
  assert(err == 0);

  return bare_lief_handle_t<MachO::LoadCommand>(handle, std::move(owner));
}

static std::optional<bare_lief_handle_t<MachO::LoadCommand>>
bare_lief_macho_binary_get_load_command(
  js_env_t *env,
  js_receiver_t,
  js_object_t self,
  bare_lief_handle_t<MachO::Binary> binary,
  int64_t type
) {
  int err;

  auto handle = binary->get(MachO::LoadCommand::TYPE(type));

  if (handle == nullptr) return std::nullopt;

  js_persistent_t<js_object_t> owner;
  err = js_create_reference(env, self, owner);
  assert(err == 0);

  return bare_lief_handle_t<MachO::LoadCommand>(handle, std::move(owner));
}

static std::optional<bare_lief_handle_t<MachO::LoadCommand>>
bare_lief_macho_binary_add_load_command(
  js_env_t *env,
  js_receiver_t,
  js_object_t self,
  bare_lief_handle_t<MachO::Binary> binary,
  bare_lief_handle_t<MachO::LoadCommand> command
) {
  int err;

  auto handle = binary->add(*command);

  if (handle == nullptr) return std::nullopt;

  js_persistent_t<js_object_t> owner;
  err = js_create_reference(env, self, owner);
  assert(err == 0);

  return bare_lief_handle_t<MachO::LoadCommand>(handle, std::move(owner));
}

static bool
bare_lief_macho_binary_has_load_command(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<MachO::Binary> binary,
  int64_t type
) {
  return binary->has(MachO::LoadCommand::TYPE(type));
}

static bool
bare_lief_macho_binary_remove_load_command(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<MachO::Binary> binary,
  bare_lief_handle_t<MachO::LoadCommand> command
) {
  return binary->remove(*command);
}

static bool
bare_lief_macho_binary_remove_all_load_commands(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<MachO::Binary> binary,
  int64_t type
) {
  return binary->remove(MachO::LoadCommand::TYPE(type));
}

static std::optional<bare_lief_handle_t<MachO::LoadCommand>>
bare_lief_macho_binary_add_dylib_command(
  js_env_t *env,
  js_receiver_t,
  js_object_t self,
  bare_lief_handle_t<MachO::Binary> binary,
  bare_lief_handle_t<MachO::DylibCommand> command
) {
  int err;

  auto handle = binary->add(*command);

  if (handle == nullptr) return std::nullopt;

  js_persistent_t<js_object_t> owner;
  err = js_create_reference(env, self, owner);
  assert(err == 0);

  return bare_lief_handle_t<MachO::LoadCommand>(handle, std::move(owner));
}

static std::optional<bare_lief_handle_t<MachO::DylibCommand>>
bare_lief_macho_binary_find_library(
  js_env_t *env,
  js_receiver_t,
  js_object_t self,
  bare_lief_handle_t<MachO::Binary> binary,
  std::string name
) {
  int err;

  auto handle = binary->find_library(name);

  if (handle == nullptr) return std::nullopt;

  js_persistent_t<js_object_t> owner;
  err = js_create_reference(env, self, owner);
  assert(err == 0);

  return bare_lief_handle_t<MachO::DylibCommand>(handle, std::move(owner));
}

static std::vector<bare_lief_handle_t<MachO::DylibCommand>>
bare_lief_macho_binary_get_libraries(
  js_env_t *env,
  js_receiver_t,
  js_object_t self,
  bare_lief_handle_t<MachO::Binary> binary
) {
  int err;

  auto result = std::vector<bare_lief_handle_t<MachO::DylibCommand>>();

  for (auto &lib : binary->libraries()) {
    js_persistent_t<js_object_t> owner;
    err = js_create_reference(env, self, owner);
    assert(err == 0);

    result.push_back(bare_lief_handle_t<MachO::DylibCommand>(&lib, std::move(owner)));
  }

  return result;
}

static void
bare_lief_macho_binary_add_library(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<MachO::Binary> binary,
  std::string name
) {
  binary->add_library(name);
}

static std::optional<bare_lief_handle_t<MachO::Section>>
bare_lief_macho_binary_get_section(
  js_env_t *env,
  js_receiver_t,
  js_object_t self,
  bare_lief_handle_t<MachO::Binary> binary,
  std::string name
) {
  int err;

  auto handle = binary->get_section(name);

  if (handle == nullptr) return std::nullopt;

  js_persistent_t<js_object_t> owner;
  err = js_create_reference(env, self, owner);
  assert(err == 0);

  return bare_lief_handle_t<MachO::Section>(handle, std::move(owner));
}

static bare_lief_handle_t<MachO::Section>
bare_lief_macho_section_create(
  js_env_t *,
  js_receiver_t,
  std::string name,
  std::span<uint8_t> buffer
) {
  auto handle = MachO::Section::create(name, std::vector(buffer.begin(), buffer.end()));

  return bare_lief_handle_t<MachO::Section>(handle.release());
}

static std::span<const uint8_t>
bare_lief_macho_section_get_content(
  js_env_t *,
  js_receiver_t,
  bare_lief_handle_t<MachO::Section> section
) {
  return section->content();
}

static int64_t
bare_lief_macho_section_get_offset(
  js_env_t *,
  js_receiver_t,
  bare_lief_handle_t<MachO::Section> section
) {
  return section->offset();
}

static int64_t
bare_lief_macho_section_get_size(
  js_env_t *,
  js_receiver_t,
  bare_lief_handle_t<MachO::Section> section
) {
  return section->size();
}

static bare_lief_handle_t<MachO::SegmentCommand>
bare_lief_macho_segment_command_create(
  js_env_t *,
  js_receiver_t,
  std::string name
) {
  auto handle = new MachO::SegmentCommand(name);

  return bare_lief_handle_t<MachO::SegmentCommand>(handle);
}

static uint32_t
bare_lief_macho_segment_command_get_max_protection(
  js_env_t *,
  js_receiver_t,
  bare_lief_handle_t<MachO::SegmentCommand> command
) {
  return command->max_protection();
}

static void
bare_lief_macho_segment_command_set_max_protection(
  js_env_t *,
  js_receiver_t,
  bare_lief_handle_t<MachO::SegmentCommand> command,
  uint32_t protection
) {
  command->max_protection(protection);
}

static uint32_t
bare_lief_macho_segment_command_get_initial_protection(
  js_env_t *,
  js_receiver_t,
  bare_lief_handle_t<MachO::SegmentCommand> command
) {
  return command->init_protection();
}

static void
bare_lief_macho_segment_command_set_initial_protection(
  js_env_t *,
  js_receiver_t,
  bare_lief_handle_t<MachO::SegmentCommand> command,
  uint32_t protection
) {
  command->init_protection(protection);
}

static void
bare_lief_macho_segment_command_add_section(
  js_env_t *,
  js_receiver_t,
  bare_lief_handle_t<MachO::SegmentCommand> command,
  bare_lief_handle_t<MachO::Section> section
) {
  command->add_section(*section);
}

static std::span<const uint8_t>
bare_lief_macho_load_command_get_data(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<MachO::LoadCommand> command
) {
  return command->data();
}

static void
bare_lief_macho_load_command_set_data(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<MachO::LoadCommand> command,
  std::span<uint8_t> data
) {
  command->data(std::vector(data.begin(), data.end()));
}

static bare_lief_handle_t<MachO::DylibCommand>
bare_lief_macho_dylib_command_create_id(
  js_env_t *,
  js_receiver_t,
  std::string name,
  uint32_t timestamp,
  uint32_t current_version,
  uint32_t compat_version
) {
  auto handle = new MachO::DylibCommand(MachO::DylibCommand::id_dylib(name, timestamp, current_version, compat_version));

  return bare_lief_handle_t<MachO::DylibCommand>(handle);
}

static std::string
bare_lief_macho_dylib_command_get_name(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<MachO::DylibCommand> command
) {
  return command->name();
}

static void
bare_lief_macho_dylib_command_set_name(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<MachO::DylibCommand> command,
  std::string name
) {
  command->name(name);
}

static bare_lief_handle_t<MachO::RPathCommand>
bare_lief_macho_rpath_command_create(
  js_env_t *,
  js_receiver_t,
  std::string path
) {
  auto handle = new MachO::RPathCommand(path);

  return bare_lief_handle_t<MachO::RPathCommand>(handle);
}

static std::string
bare_lief_macho_rpath_command_get_path(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<MachO::RPathCommand> command
) {
  return command->path();
}

static void
bare_lief_macho_rpath_command_set_path(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<MachO::RPathCommand> command,
  std::string name
) {
  command->path(name);
}
