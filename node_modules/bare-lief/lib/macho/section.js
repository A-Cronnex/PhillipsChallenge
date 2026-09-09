const assert = require('assert')
const binding = require('#binding')

module.exports = class MachOSection {
  constructor(name, content = null, opts = {}) {
    const { handle } = opts

    assert.equal(typeof name, 'string')

    this._name = name

    if (handle) {
      this._handle = handle
    } else {
      assert(ArrayBuffer.isView(content))

      this._handle = binding.machOSectionCreate(name, content)
    }
  }

  get content() {
    assert(this._handle)

    return Buffer.from(binding.machOSectionGetContent(this._handle))
  }

  get offset() {
    assert(this._handle)

    return binding.machOSectionGetOffset(this._handle)
  }

  get size() {
    assert(this._handle)

    return binding.machOSectionGetSize(this._handle)
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: MachOSection },

      name: this._name
    }
  }
}
