'use strict';

require('mocha');
require('should');
var assert = require('assert');
var cli = require('base-cli');
var support = require('./support');
var App = support.resolve();
var app;

describe('app.cli', function() {
  beforeEach(function() {
    app = new App();
    app.use(cli());
  });

  describe('app.cli.map', function() {
    it('should add a property to app.cli', function() {
      app.cli.map('abc', function() {});
      assert.equal(app.cli.keys.pop(), 'abc');
    });
  });
});

