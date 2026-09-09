const assert = require('assert')
const binding = require('#binding')

module.exports = exports = class MachOSegmentCommand {
  constructor(name) {
    assert.equal(typeof name, 'string')

    this._name = name

    this._handle = binding.machOSegmentCommandCreate(this._name)
  }

  get maxProtection() {
    assert(this._handle)

    return binding.machOSegmentCommandGetMaxProtection(this._handle)
  }

  set maxProtection(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.machOSegmentCommandSetMaxProtection(this._handle, value)
  }

  get initialProtection() {
    assert(this._handle)

    return binding.machOSegmentCommandGetInitialProtection(this._handle)
  }

  set initialProtection(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.machOSegmentCommandSetInitialProtection(this._handle, value)
  }

  addSection(section) {
    assert(this._handle)
    assert(section._handle)

    binding.machOSegmentCommandAddSection(this._handle, section._handle)
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: MachOSegmentCommand },

      name: this._name
    }
  }
}

exports.VM_PROTECTIONS = {
  READ: binding.MACHO_SEGMENT_COMMAND_VM_PROTECTIONS_READ,
  WRITE: binding.MACHO_SEGMENT_COMMAND_VM_PROTECTIONS_WRITE,
  EXECUTE: binding.MACHO_SEGMENT_COMMAND_VM_PROTECTIONS_EXECUTE
}
