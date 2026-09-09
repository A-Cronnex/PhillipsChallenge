const assert = require('assert')
const binding = require('#binding')
const MachOLoadCommand = require('./load-command')

module.exports = class MachORPathCommand extends MachOLoadCommand {
  constructor(path, opts = {}) {
    if (typeof path === 'object' && path !== null) {
      opts = path
      path = null
    }

    const { handle = binding.machORPathCommandCreate(path) } = opts

    super({ handle })
  }

  get path() {
    assert(this._handle)

    return binding.machORPathCommandGetPath(this._handle)
  }

  set path(value) {
    assert(this._handle)
    assert.equal(typeof value, 'string')

    binding.machORPathCommandSetPath(this._handle, value)
  }

  [Symbol.for('bare.inspect')]() {
    return {
      __proto__: { constructor: MachORPathCommand },

      data: this.data,
      path: this.path
    }
  }
}
