/**
 * @copyright Copyright 2017-2019 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire');
const regexpEscape = require('regexp.escape');
const sinon = require('sinon');
const stream = require('stream');

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
    '../cli.js',
    { './index.js': swaggerSpecValidator },
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
      stdin: new stream.PassThrough(),
      stdout: new stream.PassThrough(),
      stderr: new stream.PassThrough(),
    };
  });

  it('verifies stdin when no arguments given', () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.stdin,
        match.object,
        match.func,
      );
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options);
    swaggerSpecValidatorMock.verify();
  });

  it('verifies stdin with "-" argument', () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.stdin,
        match.object,
        match.func,
      );
    const allArgs = [...RUNTIME_ARGS, '-'];
    swaggerSpecValidatorCmd(allArgs, options);
    swaggerSpecValidatorMock.verify();
  });

  it('verifies file named "-" with "./-" argument', () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').once()
      .withArgs(
        './-',
        match.object,
        match.func,
      );
    const allArgs = [...RUNTIME_ARGS, './-'];
    swaggerSpecValidatorCmd(allArgs, options);
    swaggerSpecValidatorMock.verify();
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
    const allArgs = [...RUNTIME_ARGS, 'file1', 'file2'];
    swaggerSpecValidatorCmd(allArgs, options);
    swaggerSpecValidatorMock.verify();
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
    const allArgs = [...RUNTIME_ARGS, 'file1', 'file1'];
    swaggerSpecValidatorCmd(allArgs, options);
    swaggerSpecValidatorMock.verify();
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
    const allArgs = [...RUNTIME_ARGS, 'file1', './file1'];
    swaggerSpecValidatorCmd(allArgs, options);
    swaggerSpecValidatorMock.verify();
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
        options.stdin,
        match.object,
        match.func,
      );
    const allArgs = [...RUNTIME_ARGS, 'file1', '-', 'file2'];
    swaggerSpecValidatorCmd(allArgs, options);
    swaggerSpecValidatorMock.verify();
  });

  function expectArgsAs(args, expectObj) {
    it(`interprets ${args.join(' ')} as ${expectObj}`, () => {
      swaggerSpecValidatorMock.expects('validateFile').never();
      swaggerSpecValidatorMock.expects('validate').once()
        .withArgs(
          options.stdin,
          expectObj,
          match.func,
        );
      const allArgs = [...RUNTIME_ARGS, ...args];
      swaggerSpecValidatorCmd(allArgs, options);
      swaggerSpecValidatorMock.verify();
    });
  }

  function expectArgsResult(args, expectCode, expectOutMsg, expectErrMsg) {
    it(`prints error and exits for ${args.join(' ')}`, async () => {
      swaggerSpecValidatorMock.expects('validate').never();
      swaggerSpecValidatorMock.expects('validateFile').never();
      const allArgs = [...RUNTIME_ARGS, ...args];
      const code = await swaggerSpecValidatorCmd(allArgs, options);
      assert.strictEqual(code, expectCode);

      if (expectOutMsg instanceof RegExp) {
        assertMatch(options.stdout.read(), expectOutMsg);
      } else {
        assert.strictEqual(options.stdout.read(), expectOutMsg);
      }

      if (expectErrMsg instanceof RegExp) {
        assertMatch(options.stderr.read(), expectErrMsg);
      } else {
        assert.strictEqual(options.stderr.read(), expectErrMsg);
      }

      swaggerSpecValidatorMock.verify();
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
    match({ url: 'http://example.com' }),
  );
  expectArgsAs(['--verbose'], match({ verbosity: 1 }));
  expectArgsAs(
    ['-H', 'Content-Type:text/plain'],
    match({ request: match({ headers: { 'Content-Type': 'text/plain' } }) }),
  );
  expectArgsAs(
    ['-u', 'https://example.com/path?query'],
    match({ url: 'https://example.com/path?query' }),
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
      [...RUNTIME_ARGS, '-H', 'Content-Type: text/plain', 'file'];
    swaggerSpecValidatorCmd(allArgs, options);
    swaggerSpecValidatorMock.verify();
  });

  expectArgsAs(['-qqq'], match({ verbosity: -3 }));
  expectArgsAs(['-vvv'], match({ verbosity: 3 }));
  expectArgsAs(['-qvv'], match({ verbosity: 1 }));

  // URL validation is not done in the argument parser
  expectArgsAs(
    ['-u', 'notaurl'],
    match({ url: 'notaurl' }),
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

  // Satisfy GNU Coding Standards --version convention:
  // https://www.gnu.org/prep/standards/html_node/_002d_002dversion.html
  const versionRE = new RegExp(
    `^${regexpEscape(`${packageJson.name} ${packageJson.version}`)}\n`,
  );
  expectArgsResult(['--version'], 0, versionRE, null);
  expectArgsResult(['-V'], 0, versionRE, null);

  it('normally prints valid message to stderr', async () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    const validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.stdin,
        match.object,
        match.func,
      );
    const codeP = swaggerSpecValidatorCmd(RUNTIME_ARGS, options);
    validate.yield(null, {});
    const code = await codeP;
    assert.strictEqual(code, 0);
    assert.strictEqual(options.stdout.read(), null);
    assertMatch(options.stderr.read(), /valid/i);
  });

  for (const arg of ['-q', '--quiet']) {
    it(`${arg} exits without printing valid`, async () => {
      swaggerSpecValidatorMock.expects('validateFile').never();
      const validate = swaggerSpecValidatorMock.expects('validate').once()
        .withArgs(
          options.stdin,
          match.object,
          match.func,
        );
      const allArgs = [...RUNTIME_ARGS, arg];
      const codeP = swaggerSpecValidatorCmd(allArgs, options);
      validate.yield(null, {});
      const code = await codeP;
      assert.strictEqual(code, 0);
      assert.strictEqual(options.stdout.read(), null);
      assert.strictEqual(options.stderr.read(), null);
    });
  }

  it('normally prints error messages to stderr', async () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    const validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.stdin,
        match.object,
        match.func,
      );
    const codeP = swaggerSpecValidatorCmd(RUNTIME_ARGS, options);
    validate.yield(new Error('testerr'), {});
    const code = await codeP;
    assert.strictEqual(code, 2);
    assert.strictEqual(options.stdout.read(), null);
    assertMatch(options.stderr.read(), /testerr/i);
  });

  it('-v prints error messages with stack to stderr', async () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    const validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.stdin,
        match.object,
        match.func,
      );
    const allArgs = [...RUNTIME_ARGS, '-v'];
    const codeP = swaggerSpecValidatorCmd(allArgs, options);
    validate.yield(new Error('testerr'), {});
    const code = await codeP;
    assert.strictEqual(code, 2);
    assert.strictEqual(options.stdout.read(), null);
    const errStr = String(options.stderr.read());
    assertMatch(errStr, /testerr/i);
    assertMatch(errStr, new RegExp(regexpEscape(__filename)));
  });

  it('normally prints validation messages to stdout', async () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    const validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.stdin,
        match.object,
        match.func,
      );
    const codeP = swaggerSpecValidatorCmd(RUNTIME_ARGS, options);
    validate.yield(null, {
      messages: ['testmsg'],
    });
    const code = await codeP;
    assert.strictEqual(code, 1);
    assertMatch(options.stdout.read(), /testmsg/i);
    assert.strictEqual(options.stderr.read(), null);
  });

  it('normally prints validation schema messages to stdout', async () => {
    swaggerSpecValidatorMock.expects('validateFile').never();
    const validate = swaggerSpecValidatorMock.expects('validate').once()
      .withArgs(
        options.stdin,
        match.object,
        match.func,
      );
    const codeP = swaggerSpecValidatorCmd(RUNTIME_ARGS, options);
    validate.yield(null, {
      schemaValidationMessages: [
        { level: 'level', message: 'testmsg' },
      ],
    });
    const code = await codeP;
    assert.strictEqual(code, 1);
    assertMatch(options.stdout.read(), /level.*testmsg/i);
    assert.strictEqual(options.stderr.read(), null);
  });

  for (const arg of [['-qq'], ['--quiet', '--quiet']]) {
    it(`${arg} exits without printing error`, async () => {
      swaggerSpecValidatorMock.expects('validateFile').never();
      const validate = swaggerSpecValidatorMock.expects('validate').once()
        .withArgs(
          options.stdin,
          match.object,
          match.func,
        );
      const allArgs = [...RUNTIME_ARGS, ...arg];
      const codeP = swaggerSpecValidatorCmd(allArgs, options);
      validate.yield(new Error('testerr'), {});
      const code = await codeP;
      assert.strictEqual(code, 2);
      assert.strictEqual(options.stdout.read(), null);
      assert.strictEqual(options.stderr.read(), null);
    });

    it(`${arg} exits without printing validation message`, async () => {
      swaggerSpecValidatorMock.expects('validateFile').never();
      const validate = swaggerSpecValidatorMock.expects('validate').once()
        .withArgs(
          options.stdin,
          match.object,
          match.func,
        );
      const allArgs = [...RUNTIME_ARGS, ...arg];
      const codeP = swaggerSpecValidatorCmd(allArgs, options);
      validate.yield(null, {
        messages: ['testmsg'],
        schemaValidationMessages: [
          { level: 'level', message: 'testmsg' },
        ],
      });
      const code = await codeP;
      assert.strictEqual(code, 1);
      assert.strictEqual(options.stdout.read(), null);
      assert.strictEqual(options.stderr.read(), null);
    });
  }

  it('rejects null args with TypeError', async () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    await assert.rejects(
      swaggerSpecValidatorCmd(null, options),
      TypeError,
    );
    swaggerSpecValidatorMock.verify();
  });

  it('rejects empty args with TypeError', async () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    await assert.rejects(
      swaggerSpecValidatorCmd([], options),
      TypeError,
    );
    swaggerSpecValidatorMock.verify();
  });

  it('rejects non-Array args with TypeError', async () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    await assert.rejects(
      swaggerSpecValidatorCmd(true, options),
      TypeError,
    );
    swaggerSpecValidatorMock.verify();
  });

  it('rejects with TypeError for args.length < 2', async () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    await assert.rejects(
      swaggerSpecValidatorCmd(['ha'], options),
      TypeError,
    );
    swaggerSpecValidatorMock.verify();
  });

  it('rejects with TypeError without options', async () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    await assert.rejects(
      swaggerSpecValidatorCmd(RUNTIME_ARGS),
      TypeError,
    );
    swaggerSpecValidatorMock.verify();
  });

  it('rejects with TypeError for non-object options', async () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    await assert.rejects(
      swaggerSpecValidatorCmd(RUNTIME_ARGS, true),
      TypeError,
    );
    swaggerSpecValidatorMock.verify();
  });

  it('returns Error for non-Readable stdin', async () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    await assert.rejects(
      swaggerSpecValidatorCmd(RUNTIME_ARGS, { ...options, stdin: {} }),
      TypeError,
    );
    swaggerSpecValidatorMock.verify();
  });

  it('returns Error for non-Writable stdout', async () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    await assert.rejects(
      swaggerSpecValidatorCmd(RUNTIME_ARGS, { ...options, stdout: {} }),
      TypeError,
    );
    swaggerSpecValidatorMock.verify();
  });

  it('returns Error for non-Writable stderr', async () => {
    swaggerSpecValidatorMock.expects('validate').never();
    swaggerSpecValidatorMock.expects('validateFile').never();
    await assert.rejects(
      swaggerSpecValidatorCmd(RUNTIME_ARGS, { ...options, stderr: {} }),
      TypeError,
    );
    swaggerSpecValidatorMock.verify();
  });
});
