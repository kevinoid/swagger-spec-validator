/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const swaggerSpecValidatorCmd = require('../bin/swagger-spec-validator');

// Simulate arguments passed by the node runtime
const RUNTIME_ARGS = ['node', 'swagger-spec-validator'];

const swaggerJsonPath =
  path.join(__dirname, '..', 'test-data', 'petstore-minimal.json');
const swaggerYamlPath =
  path.join(__dirname, '..', 'test-data', 'petstore-minimal.yaml');
const invalidYamlPath =
  path.join(__dirname, '..', 'test-data', 'petstore-invalid.yaml');

describe('swagger-spec-validator', () => {
  it('validates JSON and YAML files', (done) => {
    const options = {
      in: new stream.PassThrough(),
      out: new stream.PassThrough(),
      err: new stream.PassThrough()
    };
    const allArgs = RUNTIME_ARGS.concat([swaggerJsonPath, swaggerYamlPath]);
    swaggerSpecValidatorCmd(allArgs, options, (err, code) => {
      assert.ifError(err);
      assert.strictEqual(code, 0);
      assert.strictEqual(options.out.read(), null);
      assert.ok(/\bvalid/i.test(options.err.read()));
      done();
    });
  });

  it('validates from stdin', (done) => {
    const options = {
      in: fs.createReadStream(swaggerYamlPath),
      out: new stream.PassThrough(),
      err: new stream.PassThrough()
    };
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, (err, code) => {
      assert.ifError(err);
      assert.strictEqual(code, 0);
      assert.strictEqual(options.out.read(), null);
      assert.ok(/\bvalid/i.test(options.err.read()));
      done();
    });
  });

  it('handles validation failures', (done) => {
    const options = {
      in: new stream.PassThrough(),
      out: new stream.PassThrough(),
      err: new stream.PassThrough()
    };
    const allArgs = RUNTIME_ARGS.concat([invalidYamlPath]);
    swaggerSpecValidatorCmd(allArgs, options, (err, code) => {
      assert.ifError(err);
      assert.strictEqual(code, 1);
      const outStr = String(options.out.read());
      assert.strictEqual(outStr.indexOf(`${invalidYamlPath}:`), 0);
      assert.strictEqual(options.err.read(), null);
      done();
    });
  });

  it('handles unreadable file errors', (done) => {
    const options = {
      in: new stream.PassThrough(),
      out: new stream.PassThrough(),
      err: new stream.PassThrough()
    };
    const nonexistentPath = 'nonexistent.yaml';
    const allArgs = RUNTIME_ARGS.concat([nonexistentPath]);
    swaggerSpecValidatorCmd(allArgs, options, (err, code) => {
      assert.ifError(err);
      assert.strictEqual(code, 2);
      assert.strictEqual(options.out.read(), null);
      const errStr = String(options.err.read());
      assert.strictEqual(errStr.indexOf(`${nonexistentPath}:`), 0);
      assert.ok(errStr.indexOf('ENOENT') >= 0);
      done();
    });
  });
});
