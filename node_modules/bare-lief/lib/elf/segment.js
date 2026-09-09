const assert = require('assert')
const binding = require('#binding')

module.exports = exports = class ELFSegment {
  constructor(opts = {}) {
    const { handle = binding.elfSegmentCreate() } = opts

    this._handle = handle
  }

  get type() {
    assert(this._handle)

    return binding.elfSegmentGetType(this._handle)
  }

  set type(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSegmentSetType(this._handle, value)
  }

  get flags() {
    assert(this._handle)

    return binding.elfSegmentGetFlags(this._handle)
  }

  set flags(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSegmentSetFlags(this._handle, value)
  }

  get alignment() {
    assert(this._handle)

    return binding.elfSegmentGetAlignment(this._handle)
  }

  set alignment(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSegmentSetAlignment(this._handle, value)
  }

  get content() {
    assert(this._handle)

    return Buffer.from(binding.elfSegmentGetContent(this._handle))
  }

  set content(value) {
    assert(this._handle)
    assert(ArrayBuffer.isView(value))

    binding.elfSegmentSetContent(this._handle, value)
  }

  get virtualSize() {
    assert(this._handle)

    return binding.elfSegmentGetVirtualSize(this._handle)
  }

  set virtualSize(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSegmentSetVirtualSize(this._handle, value)
  }

  get physicalSize() {
    assert(this._handle)

    return binding.elfSegmentGetPhysicalSize(this._handle)
  }

  set physicalSize(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSegmentSetPhysicalSize(this._handle, value)
  }

  get virtualAddress() {
    assert(this._handle)

    return binding.elfSegmentGetVirtualAddress(this._handle)
  }

  set virtualAddress(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSegmentSetVirtualAddress(this._handle, value)
  }

  get physicalAddress() {
    assert(this._handle)

    return binding.elfSegmentGetPhysicalAddress(this._handle)
  }

  set physicalAddress(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSegmentSetPhysicalAddress(this._handle, value)
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: ELFSegment },

      type: this.type,
      flags: this.flags
    }
  }
}

exports.TYPE = {
  LOAD: binding.ELF_SEGMENT_TYPE_LOAD
}

exports.FLAGS = {
  X: binding.ELF_SEGMENT_FLAGS_X,
  W: binding.ELF_SEGMENT_FLAGS_W,
  R: binding.ELF_SEGMENT_FLAGS_R
}
