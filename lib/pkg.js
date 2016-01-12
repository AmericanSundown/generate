'use strict';

var utils = require('./utils');

/**
 * Adds get/set methods to verb env
 */

module.exports = function() {
  return function(verb) {
    this.define('pkg', new Pkg(this, '_pkg'));
  };
};

function Pkg(config, prop) {
  this.config = config || {};
  this.prop = prop;
}

Pkg.prototype.set = function(key, value) {
  utils.set(this.config, [this.prop, key], value);
  return this;
};

Pkg.prototype.get = function(key) {
  return utils.get(this.config, [this.prop, key]);
};
