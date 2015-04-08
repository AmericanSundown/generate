'use strict';

var resolveUp = require('resolve-up');
var path = require('path');
var _ = require('lodash');

/**
 * Load generators onto the `generators` object
 */

module.exports = function generators_() {
  this.generators = this.generators || {};
  var pattern = this.option('generator pattern') || 'generate-*';

  _.reduce(resolveUp(pattern), function (acc, dir) {
    var json = require(path.resolve(dir, 'package.json'));
    if (!json.main) return acc;

    var fp = path.resolve(dir, json.main);
    var res = {};
    res.module = require.resolve(path.resolve(fp));
    res.pkg = json;
    res.name = json.name.split('generate-').join('');
    acc[res.name] = res;
    return acc;
  }, this.generators);
};
