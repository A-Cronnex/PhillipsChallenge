const assert = require('assert')
const binding = require('#binding')

module.exports = exports = class ELFSymbol {
  constructor(name, opts = {}) {
    if (typeof name === 'object' && name !== null) {
      opts = name
      name = null
    }

    const { handle = binding.elfSymbolCreate(name) } = opts

    this._handle = handle
  }

  get type() {
    assert(this._handle)

    return binding.elfSymbolGetType(this._handle)
  }

  set type(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSymbolSetType(this._handle, value)
  }

  get name() {
    assert(this._handle)

    return binding.elfSymbolGetName(this._handle)
  }

  set name(value) {
    assert(this._handle)
    assert.equal(typeof value, 'string')

    binding.elfSymbolSetName(this._handle, value)
  }

  get value() {
    assert(this._handle)

    return binding.elfSymbolGetValue(this._handle)
  }

  set value(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSymbolSetValue(this._handle, value)
  }

  get binding() {
    assert(this._handle)

    return binding.elfSymbolGetBinding(this._handle)
  }

  set binding(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSymbolSetBinding(this._handle, value)
  }

  get sectionIndex() {
    assert(this._handle)

    return binding.elfSymbolGetSectionIndex(this._handle)
  }

  set sectionIndex(value) {
    assert(this._handle)
    assert.equal(typeof value, 'number')

    binding.elfSymbolSetSectionIndex(this._handle, value)
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: ELFSymbol },

      name: this.name,
      value: this.value,
      binding: this.binding,
      sectionIndex: this.sectionIndex
    }
  }
}

exports.TYPE = {
  OBJECT: binding.ELF_SYMBOL_TYPE_OBJECT,
  FUNC: binding.ELF_SYMBOL_TYPE_FUNC,
  SECTION: binding.ELF_SYMBOL_TYPE_SECTION,
  FILE: binding.ELF_SYMBOL_TYPE_FILE,
  COMMON: binding.ELF_SYMBOL_TYPE_COMMON,
  TLS: binding.ELF_SYMBOL_TYPE_TLS
}

exports.BINDING = {
  LOCAL: binding.ELF_SYMBOL_BINDING_LOCAL,
  GLOBAL: binding.ELF_SYMBOL_BINDING_GLOBAL,
  WEAK: binding.ELF_SYMBOL_BINDING_WEAK
}
