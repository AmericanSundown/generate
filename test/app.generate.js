'use strict';

require('mocha');
var assert = require('assert');
var Generate = require('..');
var generate;

describe('.generate', function() {
  beforeEach(function() {
    generate = new Generate();
  });

  describe('generators', function(cb) {
    it('should throw an error when a generator is not found', function(cb) {
      generate.generate('fdsslsllsfjssl', function(err) {
        assert(err);
        assert.equal('Cannot find generator: "fdsslsllsfjssl"', err.message);
        cb();
      });
    });

    // special case
    it('should throw an error when a generator is not found in argv.cwd', function(cb) {
      generate.option('cwd', 'foo/bar/baz');
      generate.generate('sflsjljskksl', function(err) {
        assert(err);
        assert.equal('Cannot find generator: "sflsjljskksl" in "foo/bar/baz/generator.js"', err.message);
        cb();
      });
    });

    it('should not reformat error messages that are not about invalid tasks', function(cb) {
      generate.task('default', function(cb) {
        cb(new Error('whatever'));
      });

      generate.generate('default', function(err) {
        assert(err);
        assert.equal(err.message, 'whatever');
        cb();
      });
    });

    it('should throw an error when a task is not found', function(cb) {
      generate.register('fdsslsllsfjssl', function() {});
      generate.generate('fdsslsllsfjssl', ['foo'], function(err) {
        assert(err);
        assert.equal('Cannot find task: "foo" in generator: "fdsslsllsfjssl"', err.message);
        cb();
      });
    });

    it('should not throw an error when the default task is not defined', function(cb) {
      generate.register('foo', function() {});
      generate.register('bar', function() {});
      generate.generate('foo', ['default'], function(err) {
        if (err) return cb(err);

        generate.generate('bar', function(err) {
          if (err) return cb(err);

          cb();
        });
      });
    });

    it('should run a task on the instance', function(cb) {
      generate.task('abc123', function(next) {
        next();
      });

      generate.generate('abc123', function(err) {
        assert(!err);
        cb();
      });
    });

    it('should run same-named task instead of a generator', function(cb) {
      generate.register('123xyz', function(app) {
        cb(new Error('expected the task to run first'));
      });

      generate.task('123xyz', function() {
        cb();
      });

      generate.generate('123xyz', function(err) {
        assert(!err);
      });
    });

    it('should run a task instead of a generator with a default task', function(cb) {
      generate.register('123xyz', function(app) {
        app.task('default', function() {
          cb(new Error('expected the task to run first'));
        });
      });
      generate.task('123xyz', function() {
        cb();
      });
      generate.generate('123xyz', function(err) {
        assert(!err);
      });
    });

    it('should run a task on a same-named generator when the task is specified', function(cb) {
      var count = 0;
      generate.register('foo', function(app) {
        app.task('default', function(next) {
          count++;
          next();
        });
      });

      generate.task('foo', function() {
        cb(new Error('expected the generator to run'));
      });

      generate.generate('foo:default', function(err) {
        assert(!err);
        assert.equal(count, 1);
        cb();
      });
    });

    it('should run an array of tasks that includes a same-named generator', function(cb) {
      var count = 0;
      generate.register('foo', function(app) {
        app.task('default', function(next) {
          count++;
          next();
        });
      });

      generate.register('bar', function(app) {
        app.task('baz', function(next) {
          count++;
          next();
        });
      });

      generate.task('foo', function() {
        cb(new Error('expected the generator to run'));
      });

      generate.generate(['foo:default', 'bar:baz'], function(err) {
        assert(!err);
        assert.equal(count, 2);
        cb();
      });
    });

    it('should run a generator from a task with the same name', function(cb) {
      generate.register('foo', function(app) {
        app.task('default', function() {
          cb();
        });
      });

      generate.task('foo', function(cb) {
        generate.generate('foo', cb);
      });

      generate.build('foo', function(err) {
        if (err) cb(err);
      })
    });

    it('should run the default task on a generator', function(cb) {
      generate.register('foo', function(app) {
        app.task('default', function(next) {
          next();
        });
      });

      generate.generate('foo', function(err) {
        assert(!err);
        cb();
      });
    });

    it('should run a stringified array of tasks on the instance', function(cb) {
      var count = 0;
      generate.task('a', function(next) {
        count++;
        next();
      });
      generate.task('b', function(next) {
        count++;
        next();
      });
      generate.task('c', function(next) {
        count++;
        next();
      });

      generate.generate('a,b,c', function(err) {
        assert.equal(count, 3);
        assert(!err);
        cb();
      });
    });

    it('should run an array of tasks on the instance', function(cb) {
      var count = 0;
      generate.task('a', function(next) {
        count++;
        next();
      });
      generate.task('b', function(next) {
        count++;
        next();
      });
      generate.task('c', function(next) {
        count++;
        next();
      });

      generate.generate(['a', 'b', 'c'], function(err) {
        if (err) return cb(err);
        assert.equal(count, 3);
        assert(!err);
        cb();
      });
    });

    it('should run the default tasks on an array of generators', function(cb) {
      var count = 0;
      generate.register('a', function(app) {
        this.task('default', function(cb) {
          count++;
          cb();
        });
      });

      generate.register('b', function(app) {
        this.task('default', function(cb) {
          count++;
          cb();
        });
      });

      generate.register('c', function(app) {
        this.task('default', function(cb) {
          count++;
          cb();
        });
      });

      generate.generate(['a', 'b', 'c'], function(err) {
        if (err) return cb(err);
        assert.equal(count, 3);
        assert(!err);
        cb();
      });
    });

    it('should run the default task on the default generator', function(cb) {
      var count = 0;
      generate.register('default', function(app) {
        app.task('default', function(next) {
          count++;
          next();
        });
      });

      generate.generate(function(err) {
        if (err) return cb(err);
        assert.equal(count, 1);
        cb();
      });
    });

    it('should run the default task on a registered generator', function(cb) {
      var count = 0;
      generate.register('foo', function(app) {
        app.task('default', function(next) {
          count++;
          next();
        });
      });

      generate.generate('foo', function(err) {
        if (err) return cb(err);
        assert.equal(count, 1);
        cb();
      });
    });

    it('should run the specified task on a registered generator', function(cb) {
      var count = 0;
      generate.register('foo', function(app) {
        app.task('default', function(next) {
          count++;
          next();
        });

        app.task('abc', function(next) {
          count++;
          next();
        });
      });

      generate.generate('foo', ['abc'], function(err) {
        if (err) return cb(err);
        assert.equal(count, 1);
        cb();
      });
    });

    it('should run an array of tasks on a registered generator', function(cb) {
      var count = 0;
      generate.register('foo', function(app) {
        app.task('default', function(next) {
          count++;
          next();
        });

        app.task('a', function(next) {
          count++;
          next();
        });

        app.task('b', function(next) {
          count++;
          next();
        });

        app.task('c', function(next) {
          count++;
          next();
        });
      });

      generate.generate('foo', 'a,b,c', function(err) {
        if (err) return cb(err);
        assert.equal(count, 3);
        cb();
      });
    });
  });

  describe('generate sub-generators', function(cb) {
    it('should run the default task on a registered sub-generator', function(cb) {
      var count = 0;
      generate.register('foo', function(app) {
        app.register('sub', function(sub) {
          sub.task('default', function(next) {
            count++;
            next();
          });

          sub.task('abc', function(next) {
            count++;
            next();
          });
        });
      });

      generate.generate('foo.sub', function(err) {
        if (err) return cb(err);
        assert.equal(count, 1);
        cb();
      });
    });

    it('should run the specified task on a registered sub-generator', function(cb) {
      var count = 0;
      generate.register('foo', function(app) {
        app.register('sub', function(sub) {
          sub.task('default', function(next) {
            count++;
            next();
          });

          sub.task('abc', function(next) {
            count++;
            next();
          });
        });
      });

      generate.generate('foo.sub', ['abc'], function(err) {
        if (err) return cb(err);
        assert.equal(count, 1);
        cb();
      });
    });

    it('should run an array of tasks on a registered sub-generator', function(cb) {
      var count = 0;
      generate.register('foo', function(app) {
        app.register('bar', function(bar) {
          bar.task('default', function(next) {
            count++;
            next();
          });

          bar.task('a', function(next) {
            count++;
            next();
          });

          bar.task('b', function(next) {
            count++;
            next();
          });

          bar.task('c', function(next) {
            count++;
            next();
          });
        });
      });

      generate.generate('foo.bar', ['a', 'b', 'c'], function(err) {
        if (err) return cb(err);
        assert.equal(count, 3);
        cb();
      });
    });

    it('should run an multiple tasks on a registered sub-generator', function(cb) {
      var count = 0;
      generate.register('foo', function(app) {
        app.register('bar', function(bar) {
          bar.task('default', function(next) {
            count++;
            next();
          });

          bar.task('a', function(next) {
            count++;
            next();
          });

          bar.task('b', function(next) {
            count++;
            next();
          });

          bar.task('c', function(next) {
            count++;
            next();
          });
        });
      });

      generate.generate('foo.bar', 'a,b,c', function(err) {
        if (err) return cb(err);
        assert.equal(count, 3);
        cb();
      });
    });
  });

  describe('cross-generator', function(cb) {
    it('should run a generator from another generator', function(cb) {
      var res = '';

      generate.register('foo', function(app, two) {
        app.register('sub', function(sub) {
          sub.task('default', function(next) {
            res += 'foo > sub > default ';
            generate.generate('bar.sub', next);
          });
        });
      });

      generate.register('bar', function(app) {
        app.register('sub', function(sub) {
          sub.task('default', function(next) {
            res += 'bar > sub > default ';
            next();
          });
        });
      });

      generate.generate('foo.sub', function(err) {
        if (err) return cb(err);
        assert.equal(res, 'foo > sub > default bar > sub > default ');
        cb();
      });
    });

    it('should run the specified task on a registered sub-generator', function(cb) {
      var count = 0;
      generate.register('foo', function(app) {
        app.register('sub', function(sub) {
          sub.task('default', function(next) {
            count++;
            next();
          });

          sub.task('abc', function(next) {
            count++;
            next();
          });
        });
      });

      generate.generate('foo.sub', ['abc'], function(err) {
        if (err) return cb(err);
        assert.equal(count, 1);
        cb();
      });
    });
  });

  describe('events', function(cb) {
    it('should emit generate', function(cb) {
      generate.on('generate', function() {
        cb();
      });

      generate.register('foo', function(app) {
        app.register('sub', function(sub) {
          sub.task('default', function(next) {
            next();
          });

          sub.task('abc', function(next) {
            next();
          });
        });
      });

      generate.generate('foo.sub', ['abc'], function(err) {
        if (err) return cb(err);
      });
    });

    it('should expose the generator alias as the first parameter', function(cb) {
      generate.on('generate', function(name) {
        assert.equal(name, 'sub');
        cb();
      });

      generate.register('foo', function(app) {
        app.register('sub', function(sub) {
          sub.task('default', function(next) {
            next();
          });

          sub.task('abc', function(next) {
            next();
          });
        });
      });

      generate.generate('foo.sub', ['abc'], function(err) {
        if (err) return cb(err);
      });
    });

    it('should expose the tasks array as the second parameter', function(cb) {
      generate.on('generate', function(name, tasks) {
        assert.deepEqual(tasks, ['abc']);
        cb();
      });

      generate.register('foo', function(app) {
        app.register('sub', function(sub) {
          sub.task('default', function(next) {
            next();
          });

          sub.task('abc', function(next) {
            next();
          });
        });
      });

      generate.generate('foo.sub', ['abc'], function(err) {
        if (err) return cb(err);
      });
    });
  });
});
