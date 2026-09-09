#pragma once

#include <optional>

#include <assert.h>
#include <bare.h>
#include <js.h>
#include <jstl.h>
#include <stddef.h>
#include <stdint.h>

#include <LIEF/BinaryStream/SpanStream.hpp>
#include <LIEF/PE.hpp>

#include "handle.h"

using namespace LIEF;

static bare_lief_handle_t<PE::Binary>
bare_lief_pe_binary_parse(
  js_env_t *,
  js_receiver_t,
  std::span<uint8_t> buffer
) {
  auto stream = std::make_unique<LIEF::SpanStream>(buffer.data(), buffer.size());

  auto handle = PE::Parser::parse(std::move(stream));

  return bare_lief_handle_t<PE::Binary>(handle.release());
}

static void
bare_lief_pe_binary_write(
  js_env_t *,
  js_receiver_t,
  bare_lief_handle_t<PE::Binary> binary,
  std::string path
) {
  binary->write(path);
}

static js_arraybuffer_t
bare_lief_pe_binary_get_raw(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<PE::Binary> binary
) {
  int err;

  auto builder = PE::Builder(*binary, {});

  builder.build();

  js_arraybuffer_t result;
  err = js_create_arraybuffer(env, builder.get_build(), result);
  assert(err == 0);

  return result;
}

static bare_lief_handle_t<PE::Section>
bare_lief_pe_binary_add_section(
  js_env_t *env,
  js_receiver_t,
  js_object_t self,
  bare_lief_handle_t<PE::Binary> binary,
  bare_lief_handle_t<PE::Section> section
) {
  int err;

  auto handle = binary->add_section(*section);

  js_persistent_t<js_object_t> owner;
  err = js_create_reference(env, self, owner);
  assert(err == 0);

  return bare_lief_handle_t<PE::Section>(handle, std::move(owner));
}

static std::optional<bare_lief_handle_t<PE::Section>>
bare_lief_pe_binary_get_section(
  js_env_t *env,
  js_receiver_t,
  js_object_t self,
  bare_lief_handle_t<PE::Binary> binary,
  std::string name
) {
  int err;

  auto handle = binary->get_section(name);

  if (handle == nullptr) return std::nullopt;

  js_persistent_t<js_object_t> owner;
  err = js_create_reference(env, self, owner);
  assert(err == 0);

  return bare_lief_handle_t<PE::Section>(handle, std::move(owner));
}

static int64_t
bare_lief_pe_optional_header_get_subsystem(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<PE::Binary> binary
) {
  return int64_t(binary->optional_header().subsystem());
}

static void
bare_lief_pe_optional_header_set_subsystem(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<PE::Binary> binary,
  int64_t subsystem
) {
  binary->optional_header().subsystem(PE::OptionalHeader::SUBSYSTEM(subsystem));
}

static bare_lief_handle_t<PE::Section>
bare_lief_pe_section_create(
  js_env_t *env,
  js_receiver_t,
  std::string name
) {
  auto handle = new PE::Section(name);

  return bare_lief_handle_t<PE::Section>(handle);
}

static int64_t
bare_lief_pe_section_get_characteristics(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<PE::Section> section
) {
  return section->characteristics();
}

static void
bare_lief_pe_section_set_characteristics(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<PE::Section> section,
  int64_t characteristics
) {
  section->characteristics(characteristics);
}

static std::span<const uint8_t>
bare_lief_pe_section_get_content(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<PE::Section> section
) {
  return section->content();
}

static void
bare_lief_pe_section_set_content(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<PE::Section> section,
  std::span<uint8_t> content
) {
  section->content(std::vector(content.begin(), content.end()));
}

static int64_t
bare_lief_pe_section_get_size(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<PE::Section> section
) {
  return section->size();
}

static void
bare_lief_pe_section_set_size(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<PE::Section> section,
  int64_t size
) {
  section->size(size);
}

static int64_t
bare_lief_pe_section_get_virtual_size(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<PE::Section> section
) {
  return section->virtual_size();
}

static void
bare_lief_pe_section_set_virtual_size(
  js_env_t *env,
  js_receiver_t,
  bare_lief_handle_t<PE::Section> section,
  int64_t size
) {
  section->virtual_size(size);
}
