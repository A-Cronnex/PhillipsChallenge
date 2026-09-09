const assert = require('assert')
const binding = require('#binding')
const MachOBinary = require('./binary')

module.exports = class MachOFatBinary {
  constructor(binaries, opts = {}) {
    if (typeof binaries === 'object' && binaries !== null && !Array.isArray(binaries)) {
      opts = binaries
      binaries = null
    }

    const { handle = binding.machOFatBinaryCreate(binaries.map(takeBinaries)) } = opts

    this._binaries = []
    this._handle = handle

    for (let i = 0, n = binding.machOFatBinaryGetSize(this._handle); i < n; i++) {
      this._binaries.push(
        new MachOBinary({ handle: binding.machOFatBinaryGetAt(this, this._handle, i) })
      )
    }
  }

  get size() {
    return this._binaries.length
  }

  at(i) {
    assert.equal(typeof i, 'number')

    return this._binaries.at(i)
  }

  toDisk(path) {
    assert(this._handle)
    assert.equal(typeof path, 'string')

    binding.machOFatBinaryWrite(this._handle, path)
  }

  toBuffer() {
    assert(this._handle)

    return Buffer.from(binding.machOFatBinaryGetRaw(this._handle))
  }

  [Symbol.iterator]() {
    return this._binaries[Symbol.iterator]()
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: MachOFatBinary },

      binaries: this._binaries
    }
  }

  static parse(input) {
    assert(ArrayBuffer.isView(input))

    return new MachOFatBinary({
      handle: binding.machOFatBinaryParse(input)
    })
  }

  static merge(binaries) {
    assert(Array.isArray(binaries))

    return new MachOFatBinary({
      handle: binding.machOFatBinaryMerge(binaries.map(takeFatBinaries))
    })
  }
}

function takeBinaries(binary) {
  assert(binary._handle)

  const handle = binary._handle
  binary._handle = null
  return handle
}

function takeFatBinaries(binary) {
  assert(binary._handle)

  const handle = binary._handle
  binary._handle = null
  binary._binaries = []
  return handle
}
