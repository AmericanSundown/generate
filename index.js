/*!
 * generate <https://github.com/jonschlinkert/generate>
 *
 * Copyright (c) 2015-2016, Jon Schlinkert.
 * Licensed under the MIT License.
 */

'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var Assemble = require('assemble-core');
var plugins = require('./lib/plugins');
var utils = require('./lib/utils');

/**
 * Create an instance of `Generate` with the given `options`
 *
 * ```js
 * var Generate = require('generate');
 * var generate = new Generate();
 * ```
 * @param {Object} `options` Settings to initialize with.
 * @api public
 */

function Generate(options) {
  if (!(this instanceof Generate)) {
    return new Generate(options);
  }
  Assemble.call(this, options);
  this.is('generate');
  this.initGenerate(this.options);
}

/**
 * Extend `Generate`
 */

Assemble.extend(Generate);

/**
 * Initialize generate defaults
 */

Generate.prototype.initGenerate = function(opts) {
  Generate.emit('generate.preInit', this);
  var self = this;

  // add `runner` to `app.cache.data`
  this.data({runner: require('./package')});

  // custom lookup function for resolving generators
  this.option('lookup', Generate.lookup);

  // custom `toAlias` function for resolving generators by alias
  this.option('toAlias', function(key) {
    return key.replace(/^generate-/, '');
  });

  // format help menu
  this.option('help', {
    command: 'gen',
    configname: 'generator',
    appname: 'generate'
  });

  this.define('home', path.resolve.bind(path, os.homedir()));
  this.define('destBase', {
    configurable: true,
    set: function(val) {
      this._destBase = val;
    },
    get: function() {
      return this._destBase || this.options.dest || this.cwd;
    }
  });

  // create `macros` store
  Object.defineProperty(this, 'macros', {
    configurable: true,
    get: function() {
      return new utils.MacroStore({name: 'generate-macros'});
    }
  });

  // create `app.common` store
  Object.defineProperty(this, 'common', {
    configurable: true,
    get: function() {
      return new utils.Store('common-config');
    }
  });

  // create `app.globals` store
  Object.defineProperty(this, 'globals', {
    configurable: true,
    get: function() {
      return new utils.Store('generate-globals', {
        cwd: utils.resolveDir('~/')
      });
    }
  });

  // register async `ask` helper
  this.asyncHelper('ask', utils.ask(this));

  // load plugins
  this.use(plugins.store('generate'));
  this.use(plugins.generators());
  this.use(plugins.pipeline());

  /**
   * Middleware
   */

  this.preWrite(/./, function(view, next) {
    var askName = view.data.ask;
    var hint = view.basename;
    if (utils.isObject(askName)) {
      var obj = askName;
      hint = obj.default || hint;
      askName = obj.rename;
    }

    function setValue(obj) {
      var key = askName;
      var val = obj[key];
      if (val) view[key] = val;
    }

    if (typeof askName === 'string') {
      var argv = self.get('cache.argv');
      if (argv[askName]) {
        setValue(argv);
        next();
        return;
      }

      self.question(askName, `What is the file.${askName}?`, {default: hint});
      self.ask(askName, {save: false}, function(err, answers) {
        if (err) return next(err);
        if (answers[askName]) {
          setValue(answers);
        }
        next();
      });
    } else {
      next();
    }
  });

  this.preWrite(/./, utils.renameFile(self));
  this.onLoad(/(^|[\\\/])templates[\\\/]/, function(view, next) {
    var userDefined = self.home('templates', view.basename);
    if (utils.exists(userDefined)) {
      view.contents = fs.readFileSync(userDefined);
    }

    if (/^templates[\\\/]/.test(view.relative)) {
      view.path = path.join(self.cwd, view.basename);
    }

    utils.stripPrefixes(view);
    utils.parser.parse(view, next);
  });

  /**
   * Listeners
   */

  this.on('option', function(key, val) {
    if (key === 'dest') self.cwd = val;
  });

  this.on('unresolved', function(search, app) {
    var resolved = utils.resolve.file(search.name) || utils.resolve.file(search.name, {cwd: utils.gm});
    if (resolved) {
      search.app = app.generator(search.name, require(resolved.path));
    }
  });

  this.on('ask', function(answerVal, answerKey, question) {
    if (typeof answerVal === 'undefined') {
      var segs = answerKey.split('author.');
      if (segs.length > 1) {
        self.questions.answers[answerKey] = self.common.get(segs.pop());
      }
    }
  });

  /**
   * CLI plugins
   */

  if (utils.runnerEnabled(this)) {
    this.initGenerateCLI(opts);
  }

  Generate.emit('generate.postInit', this);
};

/**
 * Initialize CLI-specific plugins and view collections.
 */

Generate.prototype.initGenerateCLI = function(options) {
  Generate.initGenerateCLI(this, options);
};

/**
 * Temporary error handler method. until we implement better errors.
 *
 * @param {Object} `err` Object or instance of `Error`.
 * @return {Object} Returns an error object, or emits `error` if a listener exists.
 */

Generate.prototype.handleErr = function(err) {
  return Generate.handleErr(this, err);
};

Generate.initGenerateCLI = function(app, options) {
  plugins.runner.loadPlugins(app);
  app.use(plugins.rename({replace: true}));
  app.use(plugins.conflicts(options));
  app.use(plugins.runtimes(options));
  app.use(plugins.questions());
  app.use(plugins.loader());
  app.use(plugins.npm());

  // built-in view collections
  app.create('templates');
};

/**
 * Temporary error handler method. until we implement better errors.
 *
 * @param {Object} `err` Object or instance of `Error`.
 * @return {Object} Returns an error object, or emits `error` if a listener exists.
 */

Generate.handleErr = function(app, err) {
  if (!(err instanceof Error)) {
    err = new Error(err.toString());
  }

  if (utils.isObject(app) && app.isApp) {
    if (app.options.verbose) {
      err = err.stack;
    }

    if (app.hasListeners('error')) {
      app.emit('error', err);
    } else {
      throw err;
    }
  } else {
    throw err;
  }
};

/**
 * Custom lookup function for resolving generators
 */

Generate.lookup = function(key) {
  var patterns = [`generate-${key}`];
  if (/^generate-/.test(key) && !/^(verb|assemble|update)-/.test(key)) {
    patterns.unshift(key);
  }
  return patterns;
};

/**
 * Expose logging methods
 */

Object.defineProperty(Generate.prototype, 'log', {
  configurable: true,
  get: function() {
    function log() {
      return console.log.bind(console, utils.log.timestamp).apply(console, arguments);
    }

    log.warn = function(msg) {
      return utils.logger('warning').apply(null, arguments);
    };

    log.warning = function(msg) {
      return utils.logger('warning', 'yellow').apply(null, arguments);
    };

    log.success = function() {
      return utils.logger('success', 'green').apply(null, arguments);
    };

    log.ok = function() {
      return utils.logger('success').apply(null, arguments);
    };

    log.info = function() {
      return utils.logger('info', 'cyan').apply(null, arguments);
    };

    log.error = function() {
      return utils.logger('error', 'red').apply(null, arguments);
    };
    log.__proto__ = utils.log;
    return log;
  }
});

/**
 * Expose the `Generate` constructor
 */

module.exports = Generate;
