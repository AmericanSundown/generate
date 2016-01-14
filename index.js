'use strict';

var path = require('path');
var del = require('delete');
var async = require('async');
var through = require('through2');
var Download = require('download');
var Base = require('assemble-core');
var Logger = require('./lib/logger');
var ignore = require('./lib/ignore');
var build = require('./lib/build');
var utils = require('./lib/utils');
var cli = require('./lib/cli');
var Env = require('./lib/env');

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

  Base.apply(this, arguments);
  this.isGenerate = true;
  this.generators = {};
  this.tree = {};

  this.generatorDefaults();
  this.generatorIgnores();
  this.generatorPlugins();
  this.generatorCreate();
  this.generatorInit();
}

/**
 * Inherit assemble-core
 */

Base.extend(Generate);

/**
 * Init generator defaults.
 */

Generate.prototype.generatorDefaults = function() {
  this.set('fn',  require('./generator.js'));
  this.set('cache.deleteQueue', []);

  if (typeof this.env === 'undefined') {
    this.set('env.config', {});
    this.set('env.module', {});
    this.set('env.user', {});
  }

  this._appname = 'generate';
  if (this.options.name) {
    this.name = this.options.name;
  }
  if (this.name === 'Templates') {
    this.name = 'base';
  }
};

/**
 * Initialize `Generate` plugins.
 *  | base-store
 *  | base-pipeline
 *  | base-questions
 *  | common middleware
 *  | composer-runtimes
 *  | base-cli
 *  | base-tree
 *  | config.store
 */

Generate.prototype.generatorPlugins = function() {
  this.use(utils.logger(Logger))
    .use(build())
    .use(utils.store())
    .use(utils.middleware())
    .use(utils.config())
    .use(utils.loader())
    .use(utils.pipeline())
    .use(utils.ask({storeName: 'generate'}))
    .use(utils.runtimes())
    .use(utils.argv())
    .use(utils.pkg())
    .use(cli())
    .use(utils.list('generators', {
      method: 'generator'
    }))

  this.store.create(this.name);
};

/**
 * Lazily initialize default collections
 */

Generate.prototype.generatorCreate = function() {
  if (!this.templates) {
    var self = this;

    this.create('templates')
      .option('renameKey', function(key, file) {
        return file ? file.relative : key;
      });

    this.create('files')
      .option('renameKey', function(key, file) {
        return file ? file.relative : key;
      })
      .use(function(files)  {
        files.define('del', function() {
          self.deleteFile.apply(self, arguments);
        });
      });
  }
};

/**
 * Lazily add gitignore patterns to `generate.cache.ignores`
 */

Generate.prototype.generatorIgnores = function() {
  if (!this.cache.ignores) {
    this.union('ignores', ignore.gitignore(this.cwd));
  }
};

/**
 * Initialize `generate` defaults
 */

Generate.prototype.generatorInit = function(app) {
  var loaded = {};

  this.on('register', function(name, app, env) {
    if (env.config && env.config.cwd) {
      if (loaded[env.config.cwd]) {
        app.views.template = loaded[env.config.cwd];
      } else {
        app.templates(path.resolve(env.config.cwd, 'templates/*'));
        loaded[env.config.cwd] = app.views.templates;
      }
    }
  });
};

Generate.prototype.cleanup = function(options) {
  var self = this;

  return through.obj(function(file, enc, next) {
    next(null, file);
  }, function(cb) {
    var files = utils.arrayify(self.get('cache.delete'));
    if (files && files.length) {
      var len = files.length;
      while (len--) {
        delete self.views.files[files[len]];
      }

      self.emit('delete', files);
      del(files, function(err) {
        if (err) return cb(err);
        cb();
      });
    } else {
      cb();
    }
  });
};

/**
 * Add ignore patterns to the `generate.cache.ignores` array. This
 * array is initially populated with patterns from `gitignore`
 *
 * ```js
 * generate.ignore(['foo', 'bar']);
 * ```
 * @param {String|Array} `patterns`
 * @return {Object} returns the instance for chaining
 * @api public
 */

Generate.prototype.ignore = function(patterns) {
  this.generatorIgnores();
  this.union('ignores', ignore.toGlobs(patterns));
  return this;
};

/**
 * Delete a
 *
 * ```js
 * generate.deleteFile(['foo', 'bar']);
 * ```
 * @param {String|Array} `patterns`
 * @return {Object} returns the instance for chaining
 * @api public
 */

Generate.prototype.deleteFile = function(file) {
  this.union('delete', file);
  return this;
};

/**
 * Download `url` to the specified destination directory.
 *
 * ```js
 * var url = 'https://github.com/foo/bar/a.txt';
 * generate.download(url, 'foo', function(err, files) {
 *   if (err) throw err;
 *   // `files` is the array of downloaded files,
 *   // exposed as vinyl files
 * });
 * ```
 * @param {String} `url` The path to download
 * @param {String} `dest` Destination directory
 * @param {Function} `cb`
 * @api public
 */

Generate.prototype.download = function(url, dest, cb) {
  if (typeof opts === 'function') {
    cb = opts;
    opts = {};
  }

  this.log.info('Downloading %s ...', url);
  var download = new Download(opts)
    .get(url)
    .dest(dest)
    .use(function(res) {
      res.on('data', function() {
        process.stdout.write('.');
      });
    });

  download.run(cb);
};

/**
 * Fetch an archive and extract it to a given destination.
 *
 * @param {String} archive
 * @param {String} destination
 * @param {Object} opts
 * @param {Function} cb
 */

Generate.prototype.extract = function(url, dest, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  var opts = utils.extend({ extract: true }, options);
  this.log('Downloading %s ...', url);

  var download = new Download(opts)
    .get(url)
    .dest(dest)
    .use(function(res) {
      res.on('readable', function() {
        process.stdout.write('.');
      });
    });

  download.run(function(err, files) {
    if (err) {
      cb(err);
      return;
    }

    this.log('Extracted to: ' + dest);
    cb(null, files);
  }.bind(this));
};

Generate.prototype.devDependencies = function(deps, cb) {
  return this.npmInstall('-D', deps, cb);
};

Generate.prototype.dependencies = function(deps, cb) {
  return this.npmInstall('-S', deps, cb);
};

Generate.prototype.npmInstall = function(type, deps, cb) {
  var install = this.npm('install');
  var args = utils.arrayify(deps).concat('--silent');
  return install(utils.arrayify(type).concat(args), cb);
};

Generate.prototype.npm = function(prefix) {
  prefix = utils.arrayify(prefix);

  return function(args, cb) {
    return utils.commands({
      args: prefix.concat(utils.arrayify(args)),
      cmd: 'npm'
    }, cb);
  };
};

Generate.prototype.cmd = function(cmd, args, cb) {
  return utils.commands({
    args: prefix.concat(utils.arrayify(args)),
    cmd: cmd
  }, cb);
};

/**
 * Set `prop` with the given `value`, but only if `prop` is
 * not already defined.
 *
 * ```js
 * app.set('cwd', 'foo');
 * app.fillin('cwd', process.cwd());
 * console.log(app.get('cwd'));
 * //=> 'foo'
 * ```
 * @param {String} `prop` The name of the property to define
 * @param {any} `val` The value to use if a value is _not already defined_
 * @return {Object} Returns the instance for chaining
 * @api public
 */

Generate.prototype.fillin = function(prop, val) {
  var current = this.get(prop);
  if (typeof current === 'undefined') {
    this.set(prop, val);
  }
  return this;
};

/**
 * Get a file from the `generate.files` collection.
 *
 * ```js
 * generate.getFile('LICENSE');
 * ```
 * @param {String} `pattern` Pattern to use for matching. Checks against
 * @return {Object} If successful, a `file` object is returned, otherwise `null`
 * @api public
 */

Generate.prototype.getFile = function(pattern) {
  return utils.getFile(this, 'files', pattern);
};

/**
 * Get a template from the `generate.templates` collection.
 *
 * ```js
 * generate.getTemplate('foo.tmpl');
 * ```
 * @param {String} `pattern` Pattern to use for matching. Checks against
 * @return {Object} If successful, a `file` object is returned, otherwise `null`
 * @api public
 */

Generate.prototype.getTemplate = function(pattern, $process) {
  var template = utils.getFile(this, 'templates', pattern);
  if (template) {
    template.process = $process;
    return template;
  }
  return null;
};

/**
 * Process
 *
 */

Generate.prototype.processTemplate = function(from, to, fn) {
  var base = this.base;
  var self = this;
  var args = arguments;

  if (typeof to === 'function') {
    fn = to;
    to = null;
  }

  base.on('loaded', function() {
    to = to || from;

    var file = self.getTemplate(from);
    if (!file) {
      var err = new Error('cannot find template: ' + from);
      err.method = 'processTemplate';
      err.args = args;
      base.emit('error', err);
      return;
    }

    file.process = true;
    if (typeof fn === 'function') {
      var res = fn(file);
      if (res) file = res;
    }
    base.templates(to, file);
  });
};

/**
 * Register a generator by `name` with either an instance of generate,
 * or a generator function, and an optional `environment` object.
 *
 * ```js
 * // instance of generate
 * var app = new Generate();
 * generate.register('webapp', app);
 *
 * // generator function
 * generate.register('webapp', function(app, base, env) {
 *   // do stuff
 * });
 * ```
 * @param {String} `name`
 * @param {Object|Function} `app` An instance of generate or a generator function.
 *   _Globally installed generators must be exposed as functions_. Each has pros and
 *   cons, see the [generators docs](./docs/generators.md) for more details.
 * @param {Object} `env`
 * @return {Object} returns the generator instance.
 * @api publich
 */

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
    var Generator = this.constructor;
    var fn = app;
    app = new Generator({name: name});
    createInstance(app, this, fn);

  } else {
    createInstance(app, this);
  }

  this.emit('register', name, app, app.env);
  this.addLeaf(name, app);
  this.generators[name] = app;
  return app;
};

/**
 * Get or register a generator.
 *
 * @param {String} `name` The generator name
 * @param {Object|Function} `app` Generator instance or function.
 * @param {Object} `env` Instance of `Env`
 * @return {Object}
 */

Generate.prototype.generator = function(name, app, env) {
  if (typeof name === 'string' && arguments.length === 1) {
    return this.getGenerator(name);
  }
  return this.register.apply(this, arguments);
};

/**
 * Get generator `name`.
 *
 * ```js
 * generate.getGenerator('node')
 *   .build('default', function(err) {
 *     if (err) throw err;
 *     console.log('done!');
 *   });
 * ```
 * @param {String} `name`
 * @return {Object} Returns a generator object, which is an instance of generate.
 * @api public
 */

Generate.prototype.getGenerator = function(name) {
  var app = this.get(utils.toKey('generators', name));
  if (app) return app;

  if (name.indexOf('base.') !== 0) {
    name = 'base.' + name;
    return this.get(utils.toKey('generators', name));
  }
};

/**
 * Register generator `name` by the given filepath. This method wraps
 * the `register` method to simplify adding generators by path.
 *
 * See the [register](#register) method for more details.
 *
 * @param {String} `name` The generator name
 * @param {Object} `filepath` The filepath of the generator.
 * @param {Object} `env`
 * @return {Object}
 * @api public
 */

Generate.prototype.registerPath = function(name, filepath, env) {
  if (typeof filepath === 'object' && filepath.config) {
    env = filepath;
    filepath = name;
  }

  var fp = utils.tryResolve(filepath);
  if (!utils.exists(fp)) {
    var err = new Error('cannot resolve generator: ' + filepath);
    err.args = arguments;
    throw err;
  }

  if (name === filepath) {
    name = utils.createAlias(filepath);
  }
  return this.register(name, require(fp), env);
};

/**
 * Extend generator `app` with any tasks, sub-generators or other
 * settings on the `base` instance.
 *
 * ```js
 * generate.register('my-extended-generator', function(app, base) {
 *   base.extendGenerator(app);
 * });
 * ```
 * @param {Object} `app` Specified instance of generate.
 * @param {Object} `base` The base instance of generate
 * @return {Object}
 * @api public
 */

Generate.prototype.extendGenerator = function(app, base) {
  if (typeof app.fn !== 'function') {
    throw new Error('generators must export a function to extend other generators');
  }
  base = base || this;
  base.fn.call(app, app, this.base, app.env);
  return app;
};

/**
 * Extend generator `app` with the tasks, sub-generators, and other settings
 * of one or more additional generators.
 *
 * ```js
 * var foo = generate.getGenerator('foo');
 * generate.compose(foo, ['bar', 'baz', 'qux']);
 * ```
 * @param {Object} `app` Instance of generate.
 * @param {String|Array} `names` Names of generators to compose with `app`.
 * @return {Object}
 * @api public
 */

Generate.prototype.compose = function(app, names) {
  if (utils.typeOf(app) !== 'object') {
    throw new TypeError('expected an object');
  }

  var args = [].concat.apply([], [].slice.call(arguments, 1));
  var len = args.length;
  var idx = -1;

  while (++idx < len) {
    var name = args[idx];
    var inst = this.generator(name);
    app = this.extendGenerator(app, inst);
  }

  return app;
};

/**
 * Similar to [copy](#copy) but calls a plugin `pipeline` if passed
 * on the `options`. This allows plugin pipelines to be programmatically
 * built-up and dynamically changed on-the-fly.
 *
 * ```js
 * generate.process({src: ['a.txt', 'b.txt']}, options);
 * ```
 * @param {Object} `files`
 * @param {Object} `options`
 * @param {Function} `cb`
 * @return {Stream} Returns a [vinyl][] stream
 * @api public
 */

Generate.prototype.process = function(files, options) {
  var opts = createOptions(this, files, options, files.options);
  var cwd = opts.cwd ? path.resolve(opts.cwd) : process.cwd();
  files.dest = path.resolve(cwd, files.dest);

  return this.src(files.src, opts)
    .pipe(this.pipeline(opts.pipeline, opts))
    .on('error', this.emit.bind(this, 'error'))
    .pipe(utils.exhaust(this.dest(files.dest, opts)));
};

/**
 * Generate `files` configurations in parallel.
 *
 * ```js
 * generate.each(files, function(err) {
 *   if (err) throw err;
 *   console.log('done!');
 * });
 * ```
 * @param {Object} `config`
 * @param {Function} `cb` Optional callback function. Calls `.eachStream` and returns a stream when callback is not passed.
 * @api public
 */

Generate.prototype.each = function(config, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  if (typeof cb !== 'function') {
    return this.eachStream(config);
  }

  this.data(config.data || config.options.data || {});
  async.each(config.files, function(files, next) {
    this.process(files, options)
      .on('error', next)
      .on('finish', next);
  }.bind(this), cb);
  return this;
};

/**
 * Generate `files` configurations in series.
 *
 * ```js
 * var expand = require('expand-files');
 * var config = expand.config({src: '*', dest: 'foo/'});
 * generate.eachSeries(config, function(err) {
 *   if (err) throw err;
 *   console.log('done!');
 * });
 * ```
 * @param {Object} `config`
 * @param {Function} `cb`
 * @api public
 */

Generate.prototype.eachSeries = function(config, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  async.eachSeries(config.files, function(files, next) {
    this.process(files, options)
      .on('error', next)
      .on('finish', next);
  }.bind(this), cb);
};

/**
 * Generate `files` configurations in parallel.
 *
 * ```js
 * generate.each(files)
 *   .on('error', console.error)
 *   .on('end', function() {
 *     console.log('done!');
 *   });
 * ```
 * @param {Object} `config`
 * @return {Stream} returns stream with all process files
 * @api public
 */

Generate.prototype.eachStream = function(config, options) {
  this.data(config.data || config.options.data || {});
  var streams = [];

  config.files.forEach(function(files) {
    streams.push(utils.src(this.process(files, options)));
  }.bind(this));

  var stream = utils.ms.apply(utils.ms, streams);
  stream.on('finish', stream.emit.bind(stream, 'end'));
  return stream;
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
 * @param {Object} `scaffold` Scaffold configuration object.
 * @param {Function} `cb` Optional callback function. If not passed, `.scaffoldStream` will be called and a stream will be returned.
 * @api public
 */

Generate.prototype.scaffold = function(scaffold, options, cb) {
  if (typeof options === 'function') {
    cb = options;
    options = {};
  }

  options = options || {};
  if (typeof cb !== 'function') {
    return this.scaffoldStream(scaffold, options);
  }

  this.verbose.timestamp('starting scaffold');

  async.eachOf(scaffold, function(target, name, next) {
    if (!target.files) {
      next();
      return;
    }
    this.verbose.timestamp('building target ' + name);
    this.each(target, options, next);
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
 * generate.scaffoldStream(scaffold)
 *   .on('error', console.error)
 *   .on('end', function() {
 *     console.log('done!');
 *   });
 * ```
 * @param {Object} `scaffold` [scaffold][] configuration object.
 * @return {Stream} returns a stream with all processed files.
 * @api public
 */

Generate.prototype.scaffoldStream = function(scaffold, options) {
  this.verbose.timestamp('starting scaffold');
  var streams = [];
  for (var name in scaffold) {
    var target = scaffold[name];
    if (!target.files) continue;

    this.verbose.timestamp('building target ' + name);
    streams.push(utils.src(this.eachStream(target, options)));
  }
  var stream = utils.ms.apply(utils.ms, streams);
  stream.on('finish', stream.emit.bind(stream, 'end'));
  return stream;
};

/**
 * Create or append array `name` on `generate.cache` with the
 * given (uniqueified) `items`. Supports setting deeply nested
 * properties using using object-paths/dot notation.
 *
 * ```js
 * generate.union('foo', 'bar');
 * generate.union('foo', 'baz');
 * generate.union('foo', 'qux');
 * generate.union('foo', 'qux');
 * console.log(generate.cache.foo);
 * //=> ['bar', 'baz', 'qux'];
 * ```
 * @param {String} `name`
 * @param {any} `items`
 * @return {Object} returns the instance for chaining
 * @api public
 */

Generate.prototype.union = function(name, items) {
  utils.union(this.cache, name, utils.arrayify(items));
  return this;
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
  this.tree[name].tasks = Object.keys(app.tasks || {});
  this.tree[name].generators = app.tree;
  return this;
};

/**
 * Set the `name` on the instance, or get the `name` from the instance.
 * Used for lookups and logging messages.
 *
 * ```js
 * var name = generate.name;
 * ```
 *
 * @api public
 */

// Object.defineProperty(Generate.prototype, 'name', {
//   configurable: true,
//   set: function(val) {
//     this.define('_name', val);
//   },
//   get: function() {
//     if (this._name) {
//       return this._name;
//     }
//     var name = this._appname || this._name || this.options.name || 'base';
//     return (this._name = name);
//   }
// });

/**
 * Ensure `name` is set on the instance for lookups.
 */

Object.defineProperty(Generate.prototype, 'name', {
  configurable: true,
  set: function(name) {
    this.cache.name = name;
  },
  get: function() {
    return this.cache.name || (this.cache.name = this.options.name || 'base');
  }
});

/**
 * Ensure `name` is set on the instance for lookups.
 */

Object.defineProperty(Generate.prototype, 'cwd', {
  configurable: true,
  set: function(cwd) {
    this.options.cwd = path.resolve(cwd);
  },
  get: function() {
    var cwd = this.get('env.user.cwd') || this.options.cwd || process.cwd();
    return path.resolve(cwd);
  }
});

/**
 * Get the package.json from the current working directory.
 */

Object.defineProperty(Generate.prototype, '_pkg', {
  configurable: true,
  set: function(pkg) {
    this.cache.pkg = pkg;
  },
  get: function() {
    if (this.cache.pkg) {
      return this.cache.pkg;
    }
    return (this.cache.pkg = (this.get('env.user.pkg') || {}));
  }
});

/**
 * Get the `base` instance from the current instance of `generate`.
 *
 * ```js
 * var base = generate.base;
 * ```
 * @api public
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

/**
 * Expose `Env`
 */

module.exports.Env = Env;
