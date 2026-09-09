const assert = require('assert')
const binding = require('#binding')
const ELFDynamicEntry = require('./dynamic-entry')
const ELFSection = require('./section')
const ELFSymbol = require('./symbol')
const ELFSegment = require('./segment')

const { TAG } = ELFDynamicEntry

module.exports = exports = class ELFBinary {
  constructor(opts = {}) {
    const { handle = null } = opts

    this._handle = handle
  }

  addSegment(segment, base = 0) {
    assert(this._handle)
    assert(segment._handle)
    assert.equal(typeof base, 'number')

    const handle = binding.elfBinaryAddSegment(this, this._handle, segment._handle, base)

    if (handle === undefined) return null

    return new ELFSegment({ handle })
  }

  addSection(section, loaded = true, position = 0) {
    assert(this._handle)
    assert(section._handle)
    assert.equal(typeof loaded, 'boolean')
    assert.equal(typeof position, 'number')

    const handle = binding.elfBinaryAddSection(
      this,
      this._handle,
      section._handle,
      loaded,
      position
    )

    if (handle === undefined) return null

    return new ELFSection({ handle })
  }

  getSection(name) {
    assert(this._handle)
    assert.equal(typeof name, 'string')

    const handle = binding.elfBinaryGetSection(this, this._handle, name)

    if (handle === undefined) return null

    return new ELFSection({ handle })
  }

  getSectionIndex(name) {
    assert(this._handle)
    assert.equal(typeof name, 'string')

    return binding.elfBinaryGetSectionIndex(this._handle, name)
  }

  virtualAddressToOffset(address) {
    assert(this._handle)
    assert.equal(typeof address, 'number')

    return binding.elfBinaryVirtualAddressToOffset(this._handle, address)
  }

  addSymtabSymbol(symbol) {
    assert(this._handle)
    assert(symbol._handle)

    binding.elfBinaryAddSymtabSymbol(this._handle, symbol._handle)
  }

  getSymtabSymbol(name) {
    assert(this._handle)
    assert.equal(typeof name, 'string')

    const handle = binding.elfBinaryGetSymtabSymbol(this, this._handle, name)

    if (handle === undefined) return null

    return new ELFSymbol({ handle })
  }

  addDynamicSymbol(symbol) {
    assert(this._handle)
    assert(symbol._handle)

    binding.elfBinaryAddDynamicSymbol(this._handle, symbol._handle)
  }

  getDynamicSymbol(name) {
    assert(this._handle)
    assert.equal(typeof name, 'string')

    const handle = binding.elfBinaryGetDynamicSymbol(this, this._handle, name)

    if (handle === undefined) return null

    return new ELFSymbol({ handle })
  }

  addDynamicEntry(entry) {
    assert(this._handle)
    assert(entry._handle)

    binding.elfBinaryAddDynamicEntry(this._handle, entry._handle)
  }

  getDynamicEntry(tag) {
    assert(this._handle)
    assert.equal(typeof tag, 'number')

    const handle = binding.elfBinaryGetDynamicEntry(this, this._handle, tag)

    if (handle === undefined) return null

    switch (tag) {
      case TAG.SONAME:
        return new ELFDynamicEntry.SharedObject({ handle })
      case TAG.NEEDED:
        return new ELFDynamicEntry.Library({ handle })
      case TAG.RUNPATH:
        return new ELFDynamicEntry.RunPath({ handle })
      default:
        return new ELFDynamicEntry({ handle })
    }
  }

  hasDynamicEntry(tag) {
    assert(this._handle)
    assert.equal(typeof tag, 'number')

    return binding.elfBinaryHasDynamicEntry(this._handle, tag)
  }

  removeDynamicEntry(entry) {
    assert(this._handle)
    assert(entry._handle)

    binding.elfBinaryRemoveDynamicEntry(this._handle, entry._handle)
  }

  removeAllDynamicEntries(tag) {
    assert(this._handle)
    assert.equal(typeof tag, 'number')

    binding.elfBinaryRemoveAllDynamicEntries(this._handle, tag)
  }

  addLibrary(name) {
    assert(this._handle)
    assert.equal(typeof name, 'string')

    binding.elfBinaryAddLibrary(this._handle, name)
  }

  getLibrary(name) {
    assert(this._handle)
    assert.equal(typeof name, 'string')

    const handle = binding.elfBinaryGetLibrary(this, this._handle, name)

    if (handle === undefined) return null

    return new ELFDynamicEntry.Library({ handle })
  }

  hasLibrary(name) {
    assert(this._handle)
    assert.equal(typeof name, 'string')

    return binding.elfBinaryHasLibrary(this._handle, name)
  }

  removeLibrary(name) {
    assert(this._handle)
    assert.equal(typeof name, 'string')

    binding.elfBinaryRemoveLibrary(this._handle, name)
  }

  toDisk(path) {
    assert(this._handle)
    assert.equal(typeof path, 'string')

    binding.elfBinaryWrite(this._handle, path)
  }

  toBuffer() {
    assert(this._handle)

    return Buffer.from(binding.elfBinaryGetRaw(this._handle))
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: ELFBinary }
    }
  }

  static parse(input) {
    assert(Buffer.isBuffer(input))

    return new ELFBinary({
      handle: binding.elfBinaryParse(input)
    })
  }
}

exports.SEC_INSERT_POS = {
  AUTO: binding.ELF_BINARY_SEC_INSERT_POS_AUTO,
  POST_SEGMENT: binding.ELF_BINARY_SEC_INSERT_POS_POST_SEGMENT,
  POST_SECTION: binding.ELF_BINARY_SEC_INSERT_POS_POST_SECTION
}
