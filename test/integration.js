/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const regexpEscape = require('regexp.escape');
const sinon = require('sinon');
const stream = require('stream');

const swaggerSpecValidatorCmd = require('../bin/swagger-spec-validator');

// Note: Match result to ease debugging (all properties are printed on mismatch)
const assertMatch = sinon.assert.match;
const {match} = sinon;

// Simulate arguments passed by the node runtime
const RUNTIME_ARGS = ['node', 'swagger-spec-validator'];

const swaggerJsonPath
  = path.join(__dirname, '..', 'test-data', 'petstore-minimal.json');
const swaggerYamlPath
  = path.join(__dirname, '..', 'test-data', 'petstore-minimal.yaml');
const invalidYamlPath
  = path.join(__dirname, '..', 'test-data', 'petstore-invalid.yaml');

describe('swagger-spec-validator', function() {
  // Since these tests rely on external API responses, latency can vary a lot.
  // Increase timeout to something more reasonable for external APIs.
  this.timeout(6000);

  it('validates JSON and YAML files', (done) => {
    const options = {
      in: new stream.PassThrough(),
      out: new stream.PassThrough({encoding: 'utf-8'}),
      err: new stream.PassThrough({encoding: 'utf-8'})
    };
    const allArgs = RUNTIME_ARGS.concat([swaggerJsonPath, swaggerYamlPath]);
    swaggerSpecValidatorCmd(allArgs, options, (err, code) => {
      assert.ifError(err);
      assertMatch(
        {
          code,
          out: options.out.read(),
          err: options.err.read()
        },
        match({
          code: 0,
          out: null,
          err: match(/\bvalid/i)
        })
      );
      done();
    });
  });

  // Ensure online.swagger.io works over HTTP when requested
  // (Since it has had multiple HTTPS certificate issues and HTTP wasn't
  // supported previously due to bad https.Agent handling.)
  it('can validate using http://online.swagger.io', (done) => {
    const options = {
      in: new stream.PassThrough(),
      out: new stream.PassThrough({encoding: 'utf-8'}),
      err: new stream.PassThrough({encoding: 'utf-8'})
    };
    const allArgs = RUNTIME_ARGS.concat([
      '-u',
      'http://online.swagger.io/validator/debug',
      swaggerJsonPath
    ]);
    swaggerSpecValidatorCmd(allArgs, options, (err, code) => {
      assert.ifError(err);
      assertMatch(
        {
          code,
          out: options.out.read(),
          err: options.err.read()
        },
        match({
          code: 0,
          out: null,
          err: match(/\bvalid/i)
        })
      );
      done();
    });
  });

  it('validates from stdin', (done) => {
    const options = {
      in: fs.createReadStream(swaggerYamlPath),
      out: new stream.PassThrough({encoding: 'utf-8'}),
      err: new stream.PassThrough({encoding: 'utf-8'})
    };
    swaggerSpecValidatorCmd(RUNTIME_ARGS, options, (err, code) => {
      assert.ifError(err);
      assertMatch(
        {
          code,
          out: options.out.read(),
          err: options.err.read()
        },
        match({
          code: 0,
          out: null,
          err: match(/\bvalid/i)
        })
      );
      done();
    });
  });

  it('handles validation failures', (done) => {
    const options = {
      in: new stream.PassThrough(),
      out: new stream.PassThrough({encoding: 'utf-8'}),
      err: new stream.PassThrough({encoding: 'utf-8'})
    };
    const allArgs = RUNTIME_ARGS.concat([invalidYamlPath]);
    swaggerSpecValidatorCmd(allArgs, options, (err, code) => {
      assert.ifError(err);
      assertMatch(
        {
          code,
          out: options.out.read(),
          err: options.err.read()
        },
        match({
          code: 1,
          out: match(new RegExp(`^${regexpEscape(invalidYamlPath)}:`)),
          err: null
        })
      );
      done();
    });
  });

  it('handles unreadable file errors', (done) => {
    const options = {
      in: new stream.PassThrough(),
      out: new stream.PassThrough({encoding: 'utf-8'}),
      err: new stream.PassThrough({encoding: 'utf-8'})
    };
    const nonexistentPath = 'nonexistent.yaml';
    const allArgs = RUNTIME_ARGS.concat([nonexistentPath]);
    swaggerSpecValidatorCmd(allArgs, options, (err, code) => {
      assert.ifError(err);
      assertMatch(
        {
          code,
          out: options.out.read(),
          err: options.err.read()
        },
        match({
          code: 2,
          out: null,
          err: match(new RegExp(
            `^${regexpEscape(nonexistentPath)}:.*\\bENOENT\\b`
          ))
        })
      );
      done();
    });
  });
});
