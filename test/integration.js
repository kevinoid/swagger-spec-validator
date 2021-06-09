/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const fs = require('fs');
const path = require('path');
const regexpEscape = require('regexp.escape');
const sinon = require('sinon');
const stream = require('stream');

const swaggerSpecValidatorCmd = require('../cli.js');

// Note: Match result to ease debugging (all properties are printed on mismatch)
const assertMatch = sinon.assert.match;
const { match } = sinon;

// Simulate arguments passed by the node runtime
const RUNTIME_ARGS = ['node', 'swagger-spec-validator'];

const swaggerJsonPath =
  path.join(__dirname, '..', 'test-data', 'petstore-minimal.json');
const swaggerYamlPath =
  path.join(__dirname, '..', 'test-data', 'petstore-minimal.yaml');
const invalidYamlPath =
  path.join(__dirname, '..', 'test-data', 'petstore-invalid.yaml');

describe('swagger-spec-validator', function() {
  // Since these tests rely on external API responses, latency can vary a lot.
  // Increase timeout to something more reasonable for external APIs.
  this.timeout(10000);

  it('validates JSON and YAML files', async () => {
    const options = {
      stdin: new stream.PassThrough(),
      stdout: new stream.PassThrough({ encoding: 'utf-8' }),
      stderr: new stream.PassThrough({ encoding: 'utf-8' }),
    };
    const allArgs = [...RUNTIME_ARGS, swaggerJsonPath, swaggerYamlPath];
    const code = await swaggerSpecValidatorCmd(allArgs, options);
    assertMatch(
      {
        code,
        stdout: options.stdout.read(),
        stderr: options.stderr.read(),
      },
      match({
        code: 0,
        stdout: null,
        stderr: match(/\bvalid/i),
      }),
    );
  });

  it('validates from stdin', async () => {
    const options = {
      stdin: fs.createReadStream(swaggerYamlPath),
      stdout: new stream.PassThrough({ encoding: 'utf-8' }),
      stderr: new stream.PassThrough({ encoding: 'utf-8' }),
    };
    const code = await swaggerSpecValidatorCmd(RUNTIME_ARGS, options);
    assertMatch(
      {
        code,
        stdout: options.stdout.read(),
        stderr: options.stderr.read(),
      },
      match({
        code: 0,
        stdout: null,
        stderr: match(/\bvalid/i),
      }),
    );
  });

  it('handles validation failures', async () => {
    const options = {
      stdin: new stream.PassThrough(),
      stdout: new stream.PassThrough({ encoding: 'utf-8' }),
      stderr: new stream.PassThrough({ encoding: 'utf-8' }),
    };
    const allArgs = [...RUNTIME_ARGS, invalidYamlPath];
    const code = await swaggerSpecValidatorCmd(allArgs, options);
    assertMatch(
      {
        code,
        stdout: options.stdout.read(),
        stderr: options.stderr.read(),
      },
      match({
        code: 1,
        stdout: match(new RegExp(`^${regexpEscape(invalidYamlPath)}:`)),
        stderr: null,
      }),
    );
  });

  it('handles unreadable file errors', async () => {
    const options = {
      stdin: new stream.PassThrough(),
      stdout: new stream.PassThrough({ encoding: 'utf-8' }),
      stderr: new stream.PassThrough({ encoding: 'utf-8' }),
    };
    const nonexistentPath = 'nonexistent.yaml';
    const allArgs = [...RUNTIME_ARGS, nonexistentPath];
    const code = await swaggerSpecValidatorCmd(allArgs, options);
    assertMatch(
      {
        code,
        stdout: options.stdout.read(),
        stderr: options.stderr.read(),
      },
      match({
        code: 2,
        stdout: null,
        stderr: match(new RegExp(
          `^${regexpEscape(nonexistentPath)}:.*\\bENOENT\\b`,
        )),
      }),
    );
  });
});
