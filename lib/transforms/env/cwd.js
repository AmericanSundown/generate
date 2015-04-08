'use strict';

var path = require('path');

/**
 * Get/set the current working directory
 *
 * ```js
 * console.log(generate.cwd);
 * //=> /dev/foo/bar/
 * ```
 * Or set:
 *
 * ```js
 * generate.cwd = 'foo';
 * ```
 */

module.exports = function cwd_() {
  var cwd = this.get('cwd') || process.cwd();

  Object.defineProperty(this, 'cwd', {
    get: function () {
      return path.resolve(cwd);
    },
    set: function (val) {
      cwd = val;
    }
  });
};