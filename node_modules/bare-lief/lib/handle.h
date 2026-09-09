#pragma once

#include <jstl.h>

template <typename T>
struct bare_lief_handle_t {
  bare_lief_handle_t() : state_(new bare_lief_handle_state_t()) {}

  explicit bare_lief_handle_t(T *handle) : state_(new bare_lief_handle_state_t(handle)) {}

  bare_lief_handle_t(T *handle, js_persistent_t<js_object_t> &&owner) : state_(new bare_lief_handle_state_t(handle, std::move(owner))) {}

  bare_lief_handle_t(const bare_lief_handle_t &that) : state_(that.state_) {
    state_->refs_++;
  }

  ~bare_lief_handle_t() {
    state_->refs_--;

    if (state_->refs_ == 0) delete state_;
  }

  void
  operator=(const bare_lief_handle_t &that) {
    state_ = that.state_;

    state_->refs_++;
  }

  T *
  operator->() const {
    return state_->handle_;
  }

  T &
  operator*() {
    return *state_->handle_;
  }

  const T &
  operator*() const {
    return *state_->handle_;
  }

  T *
  take() {
    auto ptr = state_->handle_;

    state_->handle_ = nullptr;

    return ptr;
  }

private:
  struct bare_lief_handle_state_t {
    bare_lief_handle_state_t() : handle_(nullptr), owner_(), refs_(1) {}

    explicit bare_lief_handle_state_t(T *handle) : handle_(handle), owner_(), refs_(1) {}

    bare_lief_handle_state_t(T *handle, js_persistent_t<js_object_t> &&owner) : handle_(handle), owner_(std::move(owner)), refs_(1) {}

    ~bare_lief_handle_state_t() {
      if (handle_ && owner_.empty()) delete handle_;
    }

    T *handle_;
    js_persistent_t<js_object_t> owner_;
    int32_t refs_;
  };

private:
  bare_lief_handle_state_t *state_;
};

template <typename T>
struct js_type_info_t<bare_lief_handle_t<T>> {
  using type = js_value_t *;

  static constexpr auto signature = js_external;

  template <js_type_options_t options>
  static auto
  marshall(js_env_t *env, bare_lief_handle_t<T> &value, js_value_t *&result) {
    int err;

    auto handle = new bare_lief_handle_t<T>(value);

    auto finalize = +[](js_env_t *, void *data, void *) {
      delete reinterpret_cast<bare_lief_handle_t<T> *>(data);
    };

    err = js_create_external(env, reinterpret_cast<void *>(handle), finalize, nullptr, &result);
    if (err < 0) delete handle;

    return err;
  }

  template <js_type_options_t options>
  static auto
  unmarshall(js_env_t *env, js_value_t *value, bare_lief_handle_t<T> &result) {
    int err;

    if constexpr (options.checked) {
      err = js_check_value<js_is_external>(env, value, "external");
      if (err < 0) return err;
    }

    bare_lief_handle_t<T> *handle;
    err = js_get_value_external(env, value, reinterpret_cast<void **>(&handle));
    if (err < 0) return err;

    result = *handle;

    return 0;
  }
};
