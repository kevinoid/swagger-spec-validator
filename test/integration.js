/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var stream = require('stream');
var swaggerSpecValidatorCmd = require('../bin/swagger-spec-validator');

// Simulate arguments passed by the node runtime
var RUNTIME_ARGS = ['node', 'swagger-spec-validator'];

var swaggerJsonPath =
  path.join(__dirname, '..', 'test-data', 'petstore-minimal.json');
var swaggerYamlPath =
  path.join(__dirname, '..', 'test-data', 'petstore-minimal.yaml');
var invalidYamlPath =
  path.join(__dirname, '..', 'test-data', 'petstore-invalid.yaml');

describe('swagger-spec-validator', function() {
  it('validates JSON and YAML files', function() {
    var options = {
      in: new stream.PassThrough(),
      out: new stream.PassThrough(),
      err: new stream.PassThrough()
    };
    var allArgs = RUNTIME_ARGS.concat([swaggerJsonPath, swaggerYamlPath]);
    swaggerSpecValidatorCmd(allArgs, options, function(err, code) {
      assert.ifError(err);
      assert.strictEqual(code, 0);
      assert.strictEqual(options.out.read(), null);
      assert.ok(/\bvalid/i.test(options.err.read()));
    });
  });

  it('validates from stdin', function() {
    var options = {
      in: fs.createReadStream(swaggerYamlPath),
      out: new stream.PassThrough(),
      err: new stream.PassThrough()
    };
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, function(err, code) {
      assert.ifError(err);
      assert.strictEqual(code, 0);
      assert.strictEqual(options.out.read(), null);
      assert.ok(/\bvalid/i.test(options.err.read()));
    });
  });

  it('handles validation failures', function() {
    var options = {
      in: new stream.PassThrough(),
      out: new stream.PassThrough(),
      err: new stream.PassThrough()
    };
    var allArgs = RUNTIME_ARGS.concat([invalidYamlPath]);
    swaggerSpecValidatorCmd(allArgs, options, function(err, code) {
      assert.ifError(err);
      assert.strictEqual(code, 1);
      var outStr = String(options.out.read());
      assert.strictEqual(outStr.indexOf(invalidYamlPath + ':'), 0);
      assert.strictEqual(options.err.read(), null);
    });
  });
});
