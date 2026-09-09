const assert = require('assert')
const binding = require('#binding')

module.exports = exports = class PESection {
  constructor(name, opts = {}) {
    if (typeof name === 'object' && name !== null) {
      opts = name
      name = null
    }

    const { handle = binding.peSectionCreate(name) } = opts

    this._handle = handle
  }

  get characteristics() {
    assert(this._handle)

    return binding.peSectionGetCharacteristics(this._handle)
  }

  set characteristics(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.peSectionSetCharacteristics(this._handle, value)
  }

  get content() {
    assert(this._handle)

    return Buffer.from(binding.peSectionGetContent(this._handle))
  }

  set content(value) {
    assert(this._handle)
    assert(ArrayBuffer.isView(value))

    binding.peSectionSetContent(this._handle, value)
  }

  get size() {
    assert(this._handle)
    return binding.peSectionGetSize(this._handle)
  }

  set size(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.peSectionSetSize(this._handle, value)
  }

  get virtualSize() {
    assert(this._handle)
    return binding.peSectionGetVirtualSize(this._handle)
  }

  set virtualSize(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.peSectionSetVirtualSize(this._handle, value)
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: PESection },

      characteristics: this.characteristics,
      content: this.content,
      size: this.size,
      virtualSize: this.virtualSize
    }
  }
}

exports.CHARACTERISTICS = {
  CNT_CODE: binding.PE_SECTION_CHARACTERISTICS_CNT_CODE,
  CNT_INITIALIZED_DATA: binding.PE_SECTION_CHARACTERISTICS_CNT_INITIALIZED_DATA,
  CNT_UNINITIALIZED_DATA: binding.PE_SECTION_CHARACTERISTICS_CNT_UNINITIALIZED_DATA,
  MEM_SHARED: binding.PE_SECTION_CHARACTERISTICS_MEM_SHARED,
  MEM_EXECUTE: binding.PE_SECTION_CHARACTERISTICS_MEM_EXECUTE,
  MEM_READ: binding.PE_SECTION_CHARACTERISTICS_MEM_READ,
  MEM_WRITE: binding.PE_SECTION_CHARACTERISTICS_MEM_WRITE
}
