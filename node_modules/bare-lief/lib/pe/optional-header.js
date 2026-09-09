const assert = require('assert')
const binding = require('#binding')

module.exports = exports = class PEOptionalHeader {
  constructor(binary) {
    assert(binary._handle)

    this._binary = binary
  }

  get subsystem() {
    assert(this._binary._handle)

    return binding.peOptionalHeaderGetSubsystem(this._binary._handle)
  }

  set subsystem(value) {
    assert(this._binary._handle)
    assert.equal(typeof value, 'number')

    binding.peOptionalHeaderSetSubsystem(this._binary._handle, value)
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: PEOptionalHeader },

      subsystem: this.subsystem
    }
  }
}

exports.SUBSYSTEM = {
  WINDOWS_GUI: binding.PE_OPTIONAL_HEADER_SUBSYSTEM_WINDOWS_GUI,
  WINDOWS_CUI: binding.PE_OPTIONAL_HEADER_SUBSYSTEM_WINDOWS_CUI
}
