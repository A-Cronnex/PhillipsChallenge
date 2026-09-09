const assert = require('assert')
const binding = require('#binding')

module.exports = exports = class ELFSection {
  constructor(name, opts = {}) {
    if (typeof name === 'object' && name !== null) {
      opts = name
      name = null
    }

    const { handle = binding.elfSectionCreate(name) } = opts

    this._handle = handle
  }

  get type() {
    assert(this._handle)

    return binding.elfSectionGetType(this._handle)
  }

  set type(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSectionSetType(this._handle, value)
  }

  get flags() {
    assert(this._handle)

    return binding.elfSectionGetFlags(this._handle)
  }

  set flags(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSectionSetFlags(this._handle, value)
  }

  get alignment() {
    assert(this._handle)

    return binding.elfSectionGetAlignment(this._handle)
  }

  set alignment(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSectionSetAlignment(this._handle, value)
  }

  get content() {
    assert(this._handle)

    return Buffer.from(binding.elfSectionGetContent(this._handle))
  }

  set content(value) {
    assert(this._handle)
    assert(ArrayBuffer.isView(value))

    binding.elfSectionSetContent(this._handle, value)
  }

  get size() {
    assert(this._handle)

    return binding.elfSectionGetSize(this._handle)
  }

  set size(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSectionSetSize(this._handle, value)
  }

  get virtualAddress() {
    assert(this._handle)

    return binding.elfSectionGetVirtualAddress(this._handle)
  }

  set virtualAddress(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSectionSetVirtualAddress(this._handle, value)
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: ELFSection },

      type: this.type,
      flags: this.flags,
      alignment: this.alignment,
      content: this.content,
      size: this.size,
      virtualAddress: this.virtualAddress
    }
  }
}

exports.FLAGS = {
  WRITE: binding.ELF_SECTION_FLAGS_WRITE,
  ALLOC: binding.ELF_SECTION_FLAGS_ALLOC,
  EXECINSTR: binding.ELF_SECTION_FLAGS_EXECINSTR
}
