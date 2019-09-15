/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire');
const regexpEscape = require('regexp.escape');
const sinon = require('sinon');
const stream = require('stream');
const url = require('url');

let swaggerSpecValidator = require('..');
const packageJson = require('../package.json');

// Avoid modifying the shared module during mocking
swaggerSpecValidator = { ...swaggerSpecValidator };

const { match } = sinon;

// Simulate arguments passed by the node runtime
const RUNTIME_ARGS = ['node', 'swagger-spec-validator'];

function assertMatch(actual, expected) {
  actual = String(actual);
  assert.ok(expected.test(actual), `${actual} did not match ${expected}`);
}

describe('swagger-spec-validator command', () => {
  // In order to test the module in isolation, we need to mock the
  // swagger-spec-validator module.
  const swaggerSpecValidatorCmd = proxyquire(
    '../bin/swagger-spec-validator',
    { '..': swaggerSpecValidator },
  );

  // Ensure that expectations are not carried over between tests
  let swaggerSpecValidatorMock;
  beforeEach(() => {
    swaggerSpecValidatorMock = sinon.mock(swaggerSpecValidator);
  });
  afterEach(() => {
    swaggerSpecValidatorMock.restore();
    swaggerSpecValidatorMock = null;
  });

  // Test options object with standard streams for convenience
  let options;
  beforeEach(() => {
    options = {
      in: new stream.PassThrough(),
      out: new stream.PassThrough(),
      err: new stream.PassThrough(),
    };
  });

  it('verifies stdin when no arguments given', () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func,
      );
    const result =
      swaggerSpecValidatorCmd(RUNTIME_ARGS, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  it('verifies stdin with "-" argument', () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func,
      );
    const allArgs = RUNTIME_ARGS.concat('-');
    const result =
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  it('verifies file named "-" with "./-" argument', () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        './-',
        match.object,
        match.func,
      );
    const allArgs = RUNTIME_ARGS.concat('./-');
    const result =
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  it('verifies multiple named files', () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        'file1',
        match.object,
        match.func,
      );
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        'file2',
        match.object,
        match.func,
      );
    const allArgs = RUNTIME_ARGS.concat('file1', 'file2');
    const result =
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  // This is especially useful for '-', which can't be read twice
  it('verifies multiply named files once', () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        'file1',
        match.object,
        match.func,
      );
    const allArgs = RUNTIME_ARGS.concat('file1', 'file1');
    const result =
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  // This could be handy, but can be unsafe with symlinks in path
  it('does not normalize paths when merging duplicates', () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        'file1',
        match.object,
        match.func,
      );
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        './file1',
        match.object,
        match.func,
      );
    const allArgs = RUNTIME_ARGS.concat('file1', './file1');
    const result =
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  it('verifies mix of files and stdin', () => {
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        'file1',
        match.object,
        match.func,
      );
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        'file2',
        match.object,
        match.func,
      );
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func,
      );
    const allArgs = RUNTIME_ARGS.concat('file1', '-', 'file2');
    const result =
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  function expectArgsAs(args, expectObj) {
    it(`interprets ${args.join(' ')} as ${expectObj}`, () => {
      swaggerSpecValidatorMock.expects('validateFile').never();
      swaggerSpecValidatorMock.expects('validate').once()
        .withArgs(
          options.in,
          expectObj,
          match.func,
        );
      const allArgs = RUNTIME_ARGS.concat(args);
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
      swaggerSpecValidatorMock.verify();
    });
  }

  function expectArgsResult(args, expectCode, expectOutMsg, expectErrMsg) {
    it(`prints error and exits for ${args.join(' ')}`, (done) => {
      swaggerSpecValidatorMock.expects('validate').never();
      swaggerSpecValidatorMock.expects('validateFile').never();
      const allArgs = RUNTIME_ARGS.concat(args);
      swaggerSpecValidatorCmd(allArgs, options, (err, code) => {
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
    match({ request: match({ headers: { 'Content-Type': 'text/plain' } }) }),
  );
  expectArgsAs(
    ['--header', 'content-type: text/plain'],
    match({ request: match({ headers: { 'content-type': 'text/plain' } }) }),
  );
  expectArgsAs(['--quiet'], match({ verbosity: -1 }));
  expectArgsAs(
    ['--url', 'http://example.com'],
    match({ request: match(url.parse('http://example.com')) }),
  );
  expectArgsAs(['--verbose'], match({ verbosity: 1 }));
  expectArgsAs(
    ['-H', 'Content-Type:text/plain'],
    match({ request: match({ headers: { 'Content-Type': 'text/plain' } }) }),
  );
  expectArgsAs(
    ['-u', 'https://example.com/path?query'],
    match({ request: match(url.parse('https://example.com/path?query')) }),
  );
  expectArgsAs(['-q'], match({ verbosity: -1 }));
  expectArgsAs(['-v'], match({ verbosity: 1 }));

  // Can send empty header like curl (although it's value is dubious)
  expectArgsAs(
    ['-H', 'Content-Type: '],
    match({ request: match({ headers: { 'Content-Type': '' } }) }),
  );
  // Excess whitespace in value is preserved
  expectArgsAs(
    ['-H', 'Content-Type:  text/plain '],
    match({ request: match({ headers: { 'Content-Type': ' text/plain ' } }) }),
  );
  // Excess whitespace in header is not preserved (would cause Node error)
  expectArgsAs(
    ['-H', '  Content-Type  : text/plain'],
    match({ request: match({ headers: { 'Content-Type': 'text/plain' } }) }),
  );

  // Headers are combined
  expectArgsAs(
    ['-H', 'Content-Type:text/plain', '-H', 'X-Foo : bar'],
    match({
      request: match({
        headers: { 'Content-Type': 'text/plain', 'X-Foo': 'bar' },
      }),
    }),
  );

  // Default yargs handling of array type consumes all non-option args
  it('-H only consumes one argument', () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        'file',
        match({
          request: match({ headers: { 'Content-Type': 'text/plain' } }),
        }),
        match.func,
      );
    const allArgs =
      RUNTIME_ARGS.concat('-H', 'Content-Type: text/plain', 'file');
    const result =
      swaggerSpecValidatorCmd(allArgs, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  expectArgsAs(['-qqq'], match({ verbosity: -3 }));
  expectArgsAs(['-vvv'], match({ verbosity: 3 }));
  expectArgsAs(['-qvv'], match({ verbosity: 1 }));

  // URL validation is not done in the argument parser
  expectArgsAs(
    ['-u', 'notaurl'],
    match({ request: match(url.parse('notaurl')) }),
  );

  // Check argument errors are handled correctly
  expectArgsResult(['-H'], 3, null, /missing|not enough/i);
  expectArgsResult(['--header'], 3, null, /missing|not enough/i);
  expectArgsResult(['-H', ':badarg'], 3, null, /header.*\bbadarg\b/i);
  expectArgsResult(['-H', 'badarg'], 3, null, /header.*\bbadarg\b/i);
  expectArgsResult(['-u'], 3, null, /missing|not enough/i);
  expectArgsResult(['--url'], 3, null, /missing|not enough/i);
  expectArgsResult(
    ['--badtestopt'],
    3,
    null,
    /\bbadtestopt\b/i,
  );

  expectArgsResult(['--help'], 0, /usage/i, null);
  expectArgsResult(['-h'], 0, /usage/i, null);
  expectArgsResult(['-?'], 0, /usage/i, null);

  // Satisfy GNU Coding Standards --version convention:
  // https://www.gnu.org/prep/standards/html_node/_002d_002dversion.html
  const versionRE = new RegExp(
    `^${regexpEscape(`${packageJson.name} ${packageJson.version}`)}\n`,
  );
  expectArgsResult(['--version'], 0, versionRE, null);
  expectArgsResult(['-V'], 0, versionRE, null);

  it('normally prints valid message to stderr', (done) => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    const validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func,
      );
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, (err, code) => {
      assert.ifError(err);
      assert.strictEqual(code, 0);
      assert.strictEqual(options.out.read(), null);
      assertMatch(options.err.read(), /valid/i);
      done();
    });
    validate.yield(null, {});
  });

  ['-q', '--quiet'].forEach((arg) => {
    it(`${arg} exits without printing valid`, (done) => {
      swaggerSpecValidatorMock.expects('validateFile').never();
      const validate = swaggerSpecValidatorMock.expects('validate').once()
        .withArgs(
          options.in,
          match.object,
          match.func,
        );
      const allArgs = RUNTIME_ARGS.concat(arg);
      swaggerSpecValidatorCmd(allArgs, options, (err, code) => {
        assert.ifError(err);
        assert.strictEqual(code, 0);
        assert.strictEqual(options.out.read(), null);
        assert.strictEqual(options.err.read(), null);
        done();
      });
      validate.yield(null, {});
    });
  });

  it('normally prints error messages to stderr', (done) => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    const validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func,
      );
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, (err, code) => {
      assert.ifError(err);
      assert.strictEqual(code, 2);
      assert.strictEqual(options.out.read(), null);
      assertMatch(options.err.read(), /testerr/i);
      done();
    });
    validate.yield(new Error('testerr'), {});
  });

  it('-v prints error messages with stack to stderr', (done) => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    const validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func,
      );
    const allArgs = RUNTIME_ARGS.concat('-v');
    swaggerSpecValidatorCmd(allArgs, options, (err, code) => {
      assert.ifError(err);
      assert.strictEqual(code, 2);
      assert.strictEqual(options.out.read(), null);
      const errStr = String(options.err.read());
      assertMatch(errStr, /testerr/i);
      assertMatch(errStr, new RegExp(regexpEscape(__filename)));
      done();
    });
    validate.yield(new Error('testerr'), {});
  });

  it('normally prints validation messages to stdout', (done) => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    const validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func,
      );
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, (err, code) => {
      assert.ifError(err);
      assert.strictEqual(code, 1);
      assertMatch(options.out.read(), /testmsg/i);
      assert.strictEqual(options.err.read(), null);
      done();
    });
    validate.yield(null, {
      messages: ['testmsg'],
    });
  });

  it('normally prints validation schema messages to stdout', (done) => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    const validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func,
      );
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, (err, code) => {
      assert.ifError(err);
      assert.strictEqual(code, 1);
      assertMatch(options.out.read(), /level.*testmsg/i);
      assert.strictEqual(options.err.read(), null);
      done();
    });
    validate.yield(null, {
      schemaValidationMessages: [
        { level: 'level', message: 'testmsg' },
      ],
    });
  });

  ['-qq', ['--quiet', '--quiet']].forEach((arg) => {
    it(`${arg} exits without printing error`, (done) => {
      swaggerSpecValidatorMock.expects('validateFile').never();
      const validate = swaggerSpecValidatorMock.expects('validate').once()
        .withArgs(
          options.in,
          match.object,
          match.func,
        );
      const allArgs = RUNTIME_ARGS.concat(arg);
      swaggerSpecValidatorCmd(allArgs, options, (err, code) => {
        assert.ifError(err);
        assert.strictEqual(code, 2);
        assert.strictEqual(options.out.read(), null);
        assert.strictEqual(options.err.read(), null);
        done();
      });
      validate.yield(new Error('testerr'), {});
    });

    it(`${arg} exits without printing validation message`, (done) => {
      swaggerSpecValidatorMock.expects('validateFile').never();
      const validate = swaggerSpecValidatorMock.expects('validate').once()
        .withArgs(
          options.in,
          match.object,
          match.func,
        );
      const allArgs = RUNTIME_ARGS.concat(arg);
      swaggerSpecValidatorCmd(allArgs, options, (err, code) => {
        assert.ifError(err);
        assert.strictEqual(code, 1);
        assert.strictEqual(options.out.read(), null);
        assert.strictEqual(options.err.read(), null);
        done();
      });
      validate.yield(null, {
        messages: ['testmsg'],
        schemaValidationMessages: [
          { level: 'level', message: 'testmsg' },
        ],
      });
    });
  });

  it('accepts null args', () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func,
      );
    const result = swaggerSpecValidatorCmd(null, options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  it('accepts empty args', () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func,
      );
    const result = swaggerSpecValidatorCmd([], options, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  it('throws for non-function callback', () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    assert.throws(
      () => { swaggerSpecValidatorCmd(RUNTIME_ARGS, {}, true); },
      TypeError,
      /\bcallback\b/,
    );
    swaggerSpecValidatorMock.verify();
  });

  it('returns Error for non-Array args', (done) => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorCmd(true, {}, (err) => {
      assert.ok(err instanceof TypeError);
      assertMatch(err.message, /\bargs\b/);
      swaggerSpecValidatorMock.verify();
      done();
    });
  });

  it('yields RangeError for args.length < 2', (done) => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorCmd(['ha'], {}, (err) => {
      assert.ok(err instanceof RangeError);
      assertMatch(err.message, /\bargs\b/);
      swaggerSpecValidatorMock.verify();
      done();
    });
  });

  it('can be called without options', () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        process.stdin,
        match.object,
        match.func,
      );
    const result = swaggerSpecValidatorCmd(RUNTIME_ARGS, sinon.mock().never());
    swaggerSpecValidatorMock.verify();
    assert.strictEqual(result, undefined);
  });

  it('returns Error for non-object options', (done) => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorCmd(RUNTIME_ARGS, true, (err) => {
      assert.ok(err instanceof TypeError);
      assertMatch(err.message, /\boptions\b/);
      swaggerSpecValidatorMock.verify();
      done();
    });
  });

  it('returns Error for non-Readable in', (done) => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorCmd(RUNTIME_ARGS, { in: {} }, (err) => {
      assert.ok(err instanceof TypeError);
      assertMatch(err.message, /\boptions.in\b/);
      swaggerSpecValidatorMock.verify();
      done();
    });
  });

  it('returns Error for non-Writable out', (done) => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    options.out = new stream.Readable();
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, (err) => {
      assert.ok(err instanceof TypeError);
      assertMatch(err.message, /\boptions.out\b/);
      swaggerSpecValidatorMock.verify();
      done();
    });
  });

  it('returns Error for non-Writable err', (done) => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    options.err = new stream.Readable();
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, (err) => {
      assert.ok(err instanceof TypeError);
      assertMatch(err.message, /\boptions.err\b/);
      swaggerSpecValidatorMock.verify();
      done();
    });
  });

  it('returns a Promise when called without a function', () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func,
      );
    const result = swaggerSpecValidatorCmd(RUNTIME_ARGS, options);
    assert(result instanceof Promise);
    swaggerSpecValidatorMock.verify();
  });

  it('returned Promise is resolved with success exit code', () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    const validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func,
      );
    const result = swaggerSpecValidatorCmd(RUNTIME_ARGS, options);
    validate.yield(null, {});
    return result.then((code) => {
      assert.strictEqual(code, 0);
      swaggerSpecValidatorMock.verify();
    });
  });

  it('returned Promise is resolved with failure exit code', () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    const validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.in,
        match.object,
        match.func,
      );
    const result = swaggerSpecValidatorCmd(RUNTIME_ARGS, options);
    const testErr = new Error('test');
    validate.yield(testErr);
    return result.then((code) => {
      assert.strictEqual(code, 2);
      swaggerSpecValidatorMock.verify();
    });
  });

  it('returned Promise is rejected with caller Error', () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    return swaggerSpecValidatorCmd(true, options)
      .then(
        sinon.mock().never(),
        (err) => {
          assert.ok(err instanceof Error);
          swaggerSpecValidatorMock.verify();
        },
      );
  });
});
