'use strict';

var Emitter = require('component-emitter');

function Logger(options) {
  this.options = options || {};
}

Emitter(Logger.prototype);

Logger.prototype.log = function(msg) {
  this.emit('log', msg);
  return this;
};

Logger.prototype.info = function(msg) {
  this.emit('info', msg);
  return this;
};

Logger.prototype.error = function(msg) {
  this.emit('info', msg);
  return this;
};

Logger.prototype.warn = function(msg) {
  this.emit('info', msg);
  return this;
};
