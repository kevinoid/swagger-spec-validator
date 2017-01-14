/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var assert = require('assert');
var assign = require('object-assign');
var packageJson = require('../package.json');
var proxyquire = require('proxyquire');
var regexpEscape = require('regexp.escape');
var sinon = require('sinon');
var stream = require('stream');
var swaggerSpecValidator = require('..');
var url = require('url');

// Avoid modifying the shared module during mocking
swaggerSpecValidator = assign({}, swaggerSpecValidator);

var match = sinon.match;

// Simulate arguments passed by the node runtime
var RUNTIME_ARGS = ['node', 'swagger-spec-validator'];

function assertMatch(actual, expected) {
  actual = String(actual);
  assert.ok(expected.test(actual), actual + ' did not match ' + expected);
}

describe('swagger-spec-validator command', function() {
  // In order to test the module in isolation, we need to mock the
  // swagger-spec-validator module.
  var swaggerSpecValidatorCmd = proxyquire(
    '../bin/swagger-spec-validator',
    {'..': swaggerSpecValidator}
  );

  // Ensure that expectations are not carried over between tests
  var swaggerSpecValidatorMock;
  beforeEach(function() {
    swaggerSpecValidatorMock = sinon.mock(swaggerSpecValidator);
  });
  afterEach(function() {
    swaggerSpecValidatorMock.restore();
    swaggerSpecValidatorMock = null;
  });

  // Test options object with standard streams for convenience
  var options;
  beforeEach(function() {
    options = {
      in: new stream.PassThrough(),
      out: new stream.PassThrough(),
      err: new stream.PassThrough()
    };
  });

  it('verifies stdin when no arguments given', function() {
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func
      );
    var result =
      swaggerSpecValidatorCmd(RUNTIME_ARGS, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  it('verifies stdin with "-" argument', function() {
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func
      );
    var allArgs = RUNTIME_ARGS.concat('-');
    var result =
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  it('verifies file named "-" with "./-" argument', function() {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        './-',
        match.object,
        match.func
      );
    var allArgs = RUNTIME_ARGS.concat('./-');
    var result =
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  it('verifies multiple named files', function() {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        'file1',
        match.object,
        match.func
      );
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        'file2',
        match.object,
        match.func
      );
    var allArgs = RUNTIME_ARGS.concat('file1', 'file2');
    var result =
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  // This is especially useful for '-', which can't be read twice
  it('verifies multiply named files once', function() {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        'file1',
        match.object,
        match.func
      );
    var allArgs = RUNTIME_ARGS.concat('file1', 'file1');
    var result =
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  // This could be handy, but can be unsafe with symlinks in path
  it('does not normalize paths when merging duplicates', function() {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        'file1',
        match.object,
        match.func
      );
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        './file1',
        match.object,
        match.func
      );
    var allArgs = RUNTIME_ARGS.concat('file1', './file1');
    var result =
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  it('verifies mix of files and stdin', function() {
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        'file1',
        match.object,
        match.func
      );
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        'file2',
        match.object,
        match.func
      );
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func
      );
    var allArgs = RUNTIME_ARGS.concat('file1', '-', 'file2');
    var result =
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  function expectArgsAs(args, expectObj) {
    it('interprets ' + args.join(' ') + ' as ' + expectObj, function() {
      swaggerSpecValidatorMock.expects('validateFile').never();
      swaggerSpecValidatorMock.expects('validate').once()
        .withArgs(
          options.in,
          expectObj,
          match.func
        );
      var allArgs = RUNTIME_ARGS.concat(args);
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
      swaggerSpecValidatorMock.verify();
    });
  }

  function expectArgsResult(args, expectCode, expectOutMsg, expectErrMsg) {
    it('prints error and exits for ' + args.join(' '), function(done) {
      swaggerSpecValidatorMock.expects('validate').never();
      swaggerSpecValidatorMock.expects('validateFile').never();
      var allArgs = RUNTIME_ARGS.concat(args);
      swaggerSpecValidatorCmd(allArgs, options, function(err, code) {
        assert.ifError(err);
        assert.strictEqual(code, expectCode);

        if (expectOutMsg instanceof RegExp) {
          assertMatch(options.out.read(), expectOutMsg);
        } else {
          assert.strictEqual(options.out.read(), expectOutMsg);
        }

        if (expectErrMsg instanceof RegExp) {
          assertMatch(options.err.read(), expectErrMsg);
        } else {
          assert.strictEqual(options.err.read(), expectErrMsg);
        }

        swaggerSpecValidatorMock.verify();
        done();
      });
    });
  }

  // Check individual arguments are handled correctly
  expectArgsAs(
    ['--header', 'Content-Type:text/plain'],
    match({request: match({headers: {'Content-Type': 'text/plain'}})})
  );
  expectArgsAs(
    ['--header', 'content-type: text/plain'],
    match({request: match({headers: {'content-type': 'text/plain'}})})
  );
  expectArgsAs(['--quiet'], match({verbosity: -1}));
  expectArgsAs(
    ['--url', 'http://example.com'],
    match({request: match(url.parse('http://example.com'))})
  );
  expectArgsAs(['--verbose'], match({verbosity: 1}));
  expectArgsAs(
    ['-H', 'Content-Type:text/plain'],
    match({request: match({headers: {'Content-Type': 'text/plain'}})})
  );
  expectArgsAs(
    ['-u', 'https://example.com/path?query'],
    match({request: match(url.parse('https://example.com/path?query'))})
  );
  expectArgsAs(['-q'], match({verbosity: -1}));
  expectArgsAs(['-v'], match({verbosity: 1}));

  // Can send empty header like curl (although it's value is dubious)
  expectArgsAs(
    ['-H', 'Content-Type: '],
    match({request: match({headers: {'Content-Type': ''}})})
  );
  // Excess whitespace in value is preserved
  expectArgsAs(
    ['-H', 'Content-Type:  text/plain '],
    match({request: match({headers: {'Content-Type': ' text/plain '}})})
  );
  // Excess whitespace in header is not preserved (would cause Node error)
  expectArgsAs(
    ['-H', '  Content-Type  : text/plain'],
    match({request: match({headers: {'Content-Type': 'text/plain'}})})
  );

  // Headers are combined
  expectArgsAs(
    ['-H', 'Content-Type:text/plain', '-H', 'X-Foo : bar'],
    match({
      request: match({
        headers: {'Content-Type': 'text/plain', 'X-Foo': 'bar'}
      })
    })
  );

  // Default yargs handling of array type consumes all non-option args
  it('-H only consumes one argument', function() {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        'file',
        match({request: match({headers: {'Content-Type': 'text/plain'}})}),
        match.func
      );
    var allArgs = RUNTIME_ARGS.concat('-H', 'Content-Type: text/plain', 'file');
    var result =
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  expectArgsAs(['-qqq'], match({verbosity: -3}));
  expectArgsAs(['-vvv'], match({verbosity: 3}));
  expectArgsAs(['-qvv'], match({verbosity: 1}));

  // URL validation is not done in the argument parser
  expectArgsAs(
    ['-u', 'notaurl'],
    match({request: match(url.parse('notaurl'))})
  );

  // Check argument errors are handled correctly
  expectArgsResult(['-H'], 3, null, /missing|not enough/i);
  expectArgsResult(['--header'], 3, null, /missing|not enough/i);
  expectArgsResult(['-H', ':badarg'], 3, null, /header.*\bbadarg\b/i);
  expectArgsResult(['-H', 'badarg'], 3, null, /header.*\bbadarg\b/i);
  expectArgsResult(['-u'], 3, null, /missing|not enough/i);
  expectArgsResult(['--url'], 3, null, /missing|not enough/i);
  expectArgsResult(
    ['--unknown'],
    3,
    null,
    /\b(unknown|recognized|unsupported)\b.+--unknown\b/i
  );

  expectArgsResult(['--help'], 0, /usage/i, null);
  expectArgsResult(['-h'], 0, /usage/i, null);
  expectArgsResult(['-?'], 0, /usage/i, null);

  // Satisfy GNU Coding Standards --version convention:
  // https://www.gnu.org/prep/standards/html_node/_002d_002dversion.html
  var versionRE = new RegExp(
    '^' + regexpEscape(packageJson.name + ' ' + packageJson.version) + '\n'
  );
  expectArgsResult(['--version'], 0, versionRE, null);
  expectArgsResult(['-V'], 0, versionRE, null);

  it('normally prints valid message to stderr', function(done) {
    swaggerSpecValidatorMock.expects('validateFile').never();
    var validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func
      );
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, function(err, code) {
      assert.ifError(err);
      assert.strictEqual(code, 0);
      assert.strictEqual(options.out.read(), null);
      assertMatch(options.err.read(), /valid/i);
      done();
    });
    validate.yield(null, {});
  });

  ['-q', '--quiet'].forEach(function(arg) {
    it(arg + ' exits without printing valid', function(done) {
      swaggerSpecValidatorMock.expects('validateFile').never();
      var validate = swaggerSpecValidatorMock.expects('validate').once()
        .withArgs(
          options.in,
          match.object,
          match.func
        );
      var allArgs = RUNTIME_ARGS.concat(arg);
      swaggerSpecValidatorCmd(allArgs, options, function(err, code) {
        assert.ifError(err);
        assert.strictEqual(code, 0);
        assert.strictEqual(options.out.read(), null);
        assert.strictEqual(options.err.read(), null);
        done();
      });
      validate.yield(null, {});
    });
  });

  it('normally prints error messages to stderr', function(done) {
    swaggerSpecValidatorMock.expects('validateFile').never();
    var validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func
      );
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, function(err, code) {
      assert.ifError(err);
      assert.strictEqual(code, 2);
      assert.strictEqual(options.out.read(), null);
      assertMatch(options.err.read(), /testerr/i);
      done();
    });
    validate.yield(new Error('testerr'), {});
  });

  it('-v prints error messages with stack to stderr', function(done) {
    swaggerSpecValidatorMock.expects('validateFile').never();
    var validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func
      );
    var allArgs = RUNTIME_ARGS.concat('-v');
    swaggerSpecValidatorCmd(allArgs, options, function(err, code) {
      assert.ifError(err);
      assert.strictEqual(code, 2);
      assert.strictEqual(options.out.read(), null);
      var errStr = String(options.err.read());
      assertMatch(errStr, /testerr/i);
      assertMatch(errStr, new RegExp(regexpEscape(__filename)));
      done();
    });
    validate.yield(new Error('testerr'), {});
  });

  it('normally prints validation messages to stdout', function(done) {
    swaggerSpecValidatorMock.expects('validateFile').never();
    var validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func
      );
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, function(err, code) {
      assert.ifError(err);
      assert.strictEqual(code, 1);
      assertMatch(options.out.read(), /testmsg/i);
      assert.strictEqual(options.err.read(), null);
      done();
    });
    validate.yield(null, {
      messages: ['testmsg']
    });
  });

  it('normally prints validation schema messages to stdout', function(done) {
    swaggerSpecValidatorMock.expects('validateFile').never();
    var validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func
      );
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, function(err, code) {
      assert.ifError(err);
      assert.strictEqual(code, 1);
      assertMatch(options.out.read(), /level.*testmsg/i);
      assert.strictEqual(options.err.read(), null);
      done();
    });
    validate.yield(null, {
      schemaValidationMessages: [
        {level: 'level', message: 'testmsg'}
      ]
    });
  });

  ['-qq', ['--quiet', '--quiet']].forEach(function(arg) {
    it(arg + ' exits without printing error', function(done) {
      swaggerSpecValidatorMock.expects('validateFile').never();
      var validate = swaggerSpecValidatorMock.expects('validate').once()
        .withArgs(
          options.in,
          match.object,
          match.func
        );
      var allArgs = RUNTIME_ARGS.concat(arg);
      swaggerSpecValidatorCmd(allArgs, options, function(err, code) {
        assert.ifError(err);
        assert.strictEqual(code, 2);
        assert.strictEqual(options.out.read(), null);
        assert.strictEqual(options.err.read(), null);
        done();
      });
      validate.yield(new Error('testerr'), {});
    });

    it(arg + ' exits without printing validation message', function(done) {
      swaggerSpecValidatorMock.expects('validateFile').never();
      var validate = swaggerSpecValidatorMock.expects('validate').once()
        .withArgs(
          options.in,
          match.object,
          match.func
        );
      var allArgs = RUNTIME_ARGS.concat(arg);
      swaggerSpecValidatorCmd(allArgs, options, function(err, code) {
        assert.ifError(err);
        assert.strictEqual(code, 1);
        assert.strictEqual(options.out.read(), null);
        assert.strictEqual(options.err.read(), null);
        done();
      });
      validate.yield(null, {
        messages: ['testmsg'],
        schemaValidationMessages: [
          {level: 'level', message: 'testmsg'}
        ]
      });
    });
  });

  it('accepts null args', function() {
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func
      );
    var result = swaggerSpecValidatorCmd(null, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  it('accepts empty args', function() {
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func
      );
    var result = swaggerSpecValidatorCmd([], options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  it('throws for non-function callback', function() {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    assert.throws(
      function() { swaggerSpecValidatorCmd(RUNTIME_ARGS, {}, true); },
      TypeError,
      /\bcallback\b/
    );
    swaggerSpecValidatorMock.verify();
  });

  it('returns Error for non-Array args', function(done) {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorCmd(true, {}, function(err) {
      assert.ok(err instanceof TypeError);
      assertMatch(err.message, /\bargs\b/);
      swaggerSpecValidatorMock.verify();
      done();
    });
  });

  it('returns Error for args.length < 2', function(done) {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorCmd(['ha'], {}, function(err) {
      assert.ok(err instanceof TypeError);
      assertMatch(err.message, /\bargs\b/);
      swaggerSpecValidatorMock.verify();
      done();
    });
  });

  it('can be called without options', function() {
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        process.stdin,
        match.object,
        match.func
      );
    var result = swaggerSpecValidatorCmd(RUNTIME_ARGS, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  it('returns Error for non-object options', function(done) {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorCmd(RUNTIME_ARGS, true, function(err) {
      assert.ok(err instanceof TypeError);
      assertMatch(err.message, /\boptions\b/);
      swaggerSpecValidatorMock.verify();
      done();
    });
  });

  it('returns Error for non-Readable in', function(done) {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorCmd(RUNTIME_ARGS, {in: {}}, function(err) {
      assert.ok(err instanceof TypeError);
      assertMatch(err.message, /\boptions.in\b/);
      swaggerSpecValidatorMock.verify();
      done();
    });
  });

  it('returns Error for non-Writable out', function(done) {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    options.out = new stream.Readable();
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, function(err) {
      assert.ok(err instanceof TypeError);
      assertMatch(err.message, /\boptions.out\b/);
      swaggerSpecValidatorMock.verify();
      done();
    });
  });

  it('returns Error for non-Writable err', function(done) {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    options.err = new stream.Readable();
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, function(err) {
      assert.ok(err instanceof TypeError);
      assertMatch(err.message, /\boptions.err\b/);
      swaggerSpecValidatorMock.verify();
      done();
    });
  });

  it('returns a Promise when called without a function', function() {
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func
      );
    var result = swaggerSpecValidatorCmd(RUNTIME_ARGS, options);
    assert(result instanceof Promise);
    swaggerSpecValidatorMock.verify();
  });

  it('returned Promise is resolved with success exit code', function() {
    swaggerSpecValidatorMock.expects('validateFile').never();
    var validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func
      );
    var result = swaggerSpecValidatorCmd(RUNTIME_ARGS, options);
    validate.yield(null, {});
    return result.then(function(code) {
      assert.strictEqual(code, 0);
      swaggerSpecValidatorMock.verify();
    });
  });

  it('returned Promise is resolved with failure exit code', function() {
    swaggerSpecValidatorMock.expects('validateFile').never();
    var validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func
      );
    var result = swaggerSpecValidatorCmd(RUNTIME_ARGS, options);
    var testErr = new Error('test');
    validate.yield(testErr);
    return result.then(function(code) {
      assert.strictEqual(code, 2);
      swaggerSpecValidatorMock.verify();
    });
  });

  it('returned Promise is rejected with caller Error', function() {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    return swaggerSpecValidatorCmd(true, options)
      .then(
        sinon.mock().never(),
        function(err) {
          assert.ok(err instanceof Error);
          swaggerSpecValidatorMock.verify();
        }
      );
  });
});
