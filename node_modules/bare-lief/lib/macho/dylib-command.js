const assert = require('assert')
const binding = require('#binding')
const MachOLoadCommand = require('./load-command')

module.exports = class MachODylibCommand extends MachOLoadCommand {
  get name() {
    assert(this._handle)

    return binding.machODylibCommandGetName(this._handle)
  }

  set name(value) {
    assert(this._handle)
    assert.equal(typeof value, 'string')

    binding.machODylibCommandSetName(this._handle, value)
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: MachODylibCommand },

      data: this.data,
      name: this.name
    }
  }

  static id(name, opts = {}) {
    assert.equal(typeof name, 'string')

    const { timestamp = 0, currentVersion = 0, compatibilityVersion = 0 } = opts

    assert.equal(typeof timestamp, 'number')
    assert.equal(typeof currentVersion, 'number')
    assert.equal(typeof compatibilityVersion, 'number')

    return new MachODylibCommand({
      handle: binding.machODylibCommandCreateID(
        name,
        timestamp,
        currentVersion,
        compatibilityVersion
      )
    })
  }
}
