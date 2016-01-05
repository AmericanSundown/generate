'use strict';

var path = require('path');
var async = require('async');
var exhaust = require('stream-exhaust');
var Base = require('assemble-core');
var Logger = require('./lib/logger');
var build = require('./lib/build');
var utils = require('./lib/utils');
var cli = require('./lib/cli');

/**
 * Create an instance of `Generate` with the given `options`
 *
 * ```js
 * var Generate = require('generate');
 * var generate = new Generate(options);
 * ```
 * @param {Object} `options` Configuration options to initialize with.
 * @api public
 */

function Generate(options) {
  if (!(this instanceof Generate)) {
    return new Generate(options);
  }

  this.env = {};
  this.fn = null;

  Base.apply(this, arguments);
  this.name = 'generate';
  this.isGenerate = true;
  this.generators = {};
  this.tree = {};

  this.initPlugins();
  build.runTasks(this);
}

/**
 * Inherit assemble-core
 */

Base.extend(Generate);

/**
 * Initialize `Generate` plugins.
 *  | store
 *  | pipeline
 *  | ask
 *  | common middleware
 *  | runtimes
 *  | cli
 *  | list / tree
 *  | config.store
 */

Generate.prototype.initPlugins = function() {
  this.use(utils.logger())
    .use(utils.store())
    .use(utils.pipeline())
    .use(utils.ask({storeName: 'generate'}))
    .use(utils.middleware())
    .use(utils.runtimes())
    .use(cli())
    .use(utils.list('generators', {
      method: 'generator'
    }));

  this.store.create('config');
};

/**
 * Add a generator and its tasks to the tree object.
 * Mostly used for debugging, but also useful for
 * creating custom-formatted visual trees.
 *
 * @param {String} `name`
 * @param {Object} `app`
 */

Generate.prototype.addLeaf = function(name, app) {
  this.tree[name] = {};
  this.tree[name].tasks = Object.keys(app.tasks);
  this.tree[name].generators = app.tree;
  return this;
};

/**
 * Get or register a generator.
 *
 * @param {[type]} name
 * @param {[type]} app
 * @param {[type]} env
 * @return {[type]}
 */

Generate.prototype.generator = function(name, app, env) {
  if (typeof name === 'string' && arguments.length === 1) {
    return this.getGenerator(name);
  }
  return this.register.apply(this, arguments);
};

Generate.prototype.getGenerator = function(name) {
  return this.get(utils.toKey('generators', name));
};

Generate.prototype.registerPath = function(name, app, env) {
  this.register(name, require(path.resolve(app)), env);
  return this;
};

Generate.prototype.register = function(name, app, env) {
  if (typeof app === 'string') {
    return this.registerPath(name, app, env);
  }

  function createInstance(app, parent, fn) {
    var base = parent.base;
    app.name = name;
    app.env = env || base.env;
    app.define('parent', parent);
    if (typeof fn === 'function') {
      app.fn = fn;
      fn.call(app, app, base, app.env);
    }
  }

  if (utils.isObject(app) && app.isGenerate) {
    createInstance(app, this, app.fn);

  } else if (typeof app === 'function') {
    var fn = app;
    app = new Generate({name: name});
    createInstance(app, this, fn);

  } else {
    createInstance(app, this);
  }

  this.addLeaf(name, app);
  this.generators[name] = app;
  return app;
};

Generate.prototype.extendGenerator = function(generator) {
  if (typeof this.fn !== 'function') {
    throw new Error('generators must export a function to extend other generators');
  }
  this.fn.call(generator, generator, this.base, generator.env);
  return this;
};

Generate.prototype.compose = function(name, app) {
  if (utils.typeOf(name) === 'object') {
    this.extendGenerator(name);
    return this;
  }
  var generator = this.generator(name);
  generator.extendGenerator(app);
  return this;
};

Generate.prototype.mkdir = function(dir) {

};

Generate.prototype.mkdirSync = function(dir) {

};

/**
 * Similar to [copy](#copy) but calls a plugin `pipeline` if passed
 * on the `options`. This allows plugin pipelines to be programmatically
 * built-up and dynamically changed on-the-fly.
 *
 * ```js
 * generate.process({src: ['a.txt', 'b.txt']}, options);
 * ```
 *
 * @param {Object} `files`
 * @param {Object} `options`
 * @param {Function} `cb`
 * @return {Stream} Returns a [vinyl][] src stream
 * @api public
 */

Generate.prototype.process = function(files, options) {
  var opts = createOptions(this, files, options);
  return this.src(files.src, opts)
    .pipe(this.pipeline(opts.pipeline, opts))
    .on('error', this.emit.bind(this, 'error'))
    .pipe(exhaust(this.dest(files.dest, opts)));
};

/**
 * Generate `files` configurations in parallel.
 *
 * ```js
 * generate.each(files, function(err) {
 *   if (err) console.log(err);
 * });
 * ```
 * @param {Object} `config`
 * @param {Function} `cb`
 * @api public
 */

Generate.prototype.each = function(config, cb) {
  this.data(config.data || config.options.data || {});
  async.each(config.files, function(files, next) {
    this.process(files, files.options)
      .on('error', next)
      .on('finish', next);
  }.bind(this), cb);
  return this;
};

/**
 * Generate `files` configurations in series.
 *
 * ```js
 * generate.eachSeries(files, function(err) {
 *   if (err) console.log(err);
 * });
 * ```
 * @param {Object} `config`
 * @param {Function} `cb`
 * @api public
 */

Generate.prototype.eachSeries = function(config, cb) {
  async.eachSeries(config.files, function(files, next) {
    this.process(files, files.options)
      .on('error', next)
      .on('finish', next);
  }.bind(this), cb);
};

/**
 * Generate files from a declarative [scaffold][] configuration.
 *
 * ```js
 * var Scaffold = require('scaffold');
 * var scaffold = new Scaffold({
 *   options: {cwd: 'source'},
 *   posts: {
 *     src: ['content/*.md']
 *   },
 *   pages: {
 *     src: ['templates/*.hbs']
 *   }
 * });
 *
 * generate.scaffold(scaffold, function(err) {
 *   if (err) console.log(err);
 * });
 * ```
 * @param {Object} `scaffold` Scaffold configuration
 * @param {Function} `cb` Callback function
 * @api public
 */

Generate.prototype.scaffold = function(scaffold, cb) {
  utils.timestamp('starting scaffold');

  async.eachOf(scaffold, function(target, name, next) {
    if (!target.files) {
      next();
      return;
    }

    utils.timestamp('building target ' + name);
    this.each(target, next);
  }.bind(this), cb);
};

/**
 * Set the name on the instance
 */

Object.defineProperty(Generate.prototype, 'name', {
  configurable: true,
  set: function(val) {
    this.define('_name', val);
  },
  get: function() {
    if (this._name) {
      return this._name;
    }
    var name = this._appname || this._name || this.options.name || 'base';
    return (this._name = name);
  }
});

/**
 * Get the `base` instance
 */

Object.defineProperty(Generate.prototype, 'base', {
  configurable: true,
  get: function() {
    return this.generators.base || (this.parent ? this.parent.base : this);
  }
});

/**
 * Create the options object to used by the `process` method
 */

function createOptions(app, files, options) {
  options = options || {};
  files.options = files.options || {};
  var opts = utils.merge({}, app.options, files.options, options);
  opts.cwd = path.resolve(opts.cwd || process.cwd());
  app.data(opts.data || {});
  return opts;
}

/**
 * Expose `Generate`
 */

module.exports = Generate;
