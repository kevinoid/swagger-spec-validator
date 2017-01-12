#!/usr/bin/env node
/**
 * swagger-spec-validator executable command.
 *
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var Command = require('commander').Command;
var arrayUniq = require('array-uniq');
var assign = require('object-assign');
var packageJson = require('../package.json');
var swaggerSpecValidator = require('..');
var url = require('url');

function addHeader(line, headers) {
  // Note: curl uses the header line literally.  We can't due to Node API.
  //       Node enforces name is a valid RFC 7230 token, so remove whitespace
  //       as a convenience for users.
  var match = /^\s*(\S+)\s*: ?(.*)$/.exec(line);
  if (!match) {
    throw new Error('Unable to parse header line "' + line + '"');
  }

  var name = match[1];
  var value = match[2];
  headers[name] = value;
  return headers;
}

/** Gets validation messages from a validation response object. */
function getMessages(result) {
  var messages = [];
  if (result.messages) {
    messages = messages.concat(result.messages);
  }
  if (result.schemaValidationMessages) {
    messages = messages.concat(result.schemaValidationMessages.map(function(m) {
      return m.level + ': ' + m.message;
    }));
  }
  return messages;
}

/** Options for command entry points.
 *
 * @typedef {{
 *   in: (stream.Readable|undefined),
 *   out: (stream.Writable|undefined),
 *   err: (stream.Writable|undefined)
 * }} CommandOptions
 * @property {stream.Readable=} in Stream from which input is read. (default:
 * <code>process.stdin</code>)
 * @property {stream.Writable=} out Stream to which output is written.
 * (default: <code>process.stdout</code>)
 * @property {stream.Writable=} err Stream to which errors (and non-output
 * status messages) are written. (default: <code>process.stderr</code>)
 */
// var CommandOptions;

/** Entry point for this command.
 *
 * @param {!Array<string>} args Command-line arguments.
 * @param {CommandOptions=} options Options.
 * @param {?function(Error, number=)=}
 * callback Callback for the exit code or an <code>Error</code>.
 * @return {Promise<number>|undefined} If <code>callback</code> is not given, a
 * <code>Promise</code> with the exit code or <code>Error</code>.
 */
function swaggerSpecValidatorCmd(args, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = null;
  }

  if (!callback) {
    return new Promise(function(resolve, reject) {
      swaggerSpecValidatorCmd(args, function(err, result) {
        if (err) { reject(err); } else { resolve(result); }
      });
    });
  }

  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  try {
    if (options && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }

    options = assign(
      {
        in: process.stdin,
        out: process.stdout,
        err: process.stderr
      },
      options
    );

    if (!options.in || typeof options.in.on !== 'function') {
      throw new TypeError('options.in must be a stream.Readable');
    }
    if (!options.out || typeof options.out.write !== 'function') {
      throw new TypeError('options.out must be a stream.Writable');
    }
    if (!options.err || typeof options.err.write !== 'function') {
      throw new TypeError('options.err must be a stream.Writable');
    }
  } catch (err) {
    process.nextTick(function() {
      callback(err);
    });
    return undefined;
  }

  var command = new Command()
    .description('Validate OpenAPI/Swagger API specifications.')
    .arguments('[swagger.yaml...]')
    .option(
      '-H, --header <header-line>',
      'additional HTTP header to send',
      addHeader,
      {}
    )
    .option('-q, --quiet', 'print less output')
    .on('quiet', function() { this.verbosity -= 1; })
    .option(
      '-u, --url <url>',
      'validator URL (default: ' + swaggerSpecValidator.DEFAULT_URL + ')'
    )
    .option('-v, --verbose', 'print more output')
    .on('verbose', function() { this.verbosity += 1; })
    .version(packageJson.version);
  command.verbosity = 0;

  // Patch stdout, stderr, and exit for Commander
  // See: https://github.com/tj/commander.js/pull/444
  var exitDesc = Object.getOwnPropertyDescriptor(process, 'exit');
  var stdoutDesc = Object.getOwnPropertyDescriptor(process, 'stdout');
  var stderrDesc = Object.getOwnPropertyDescriptor(process, 'stderr');
  var errExit = new Error('process.exit() called');
  process.exit = function throwOnExit(exitCode) {
    errExit.exitCode = Number(exitCode) || 0;
    throw errExit;
  };
  if (options.out) {
    Object.defineProperty(
        process,
        'stdout',
        {configurable: true, enumerable: true, value: options.out}
    );
  }
  if (options.err) {
    Object.defineProperty(
        process,
        'stderr',
        {configurable: true, enumerable: true, value: options.err}
    );
  }
  try {
    command.parse(args);
  } catch (errParse) {
    process.nextTick(function() {
      if (errParse !== errExit) {
        // Match commander formatting for consistency
        options.err.write('\n  error: ' + errParse.message + '\n\n');
      }
      callback(
        null,
        typeof errParse.exitCode === 'number' ? errParse.exitCode : 1
      );
    });
    return undefined;
  } finally {
    Object.defineProperty(process, 'exit', exitDesc);
    Object.defineProperty(process, 'stdout', stdoutDesc);
    Object.defineProperty(process, 'stderr', stderrDesc);
  }

  var reqOpts = command.url ? url.parse(command.url) : {};
  reqOpts.headers = command.headers;

  var specPaths = command.args;
  if (specPaths.length === 0) {
    // Default to validating stdin
    specPaths.push('-');
    if (command.verbosity > 1) {
      options.out.write('Reading spec from stdin...\n');
    }
  } else if (specPaths.length > 1) {
    specPaths = arrayUniq(specPaths);
  }

  var hadError = false;
  var hadInvalid = false;
  var numValidated = 0;
  specPaths.forEach(function(specPath) {
    function onResult(err, result) {
      if (err) {
        hadError = true;
        if (command.verbosity >= -1) {
          options.err.write(specPath + ': ' + err + '\n');
          // DEBUG
          options.err.write(err.stack);
        }
      } else {
        var messages = getMessages(result);
        if (messages.length > 0) {
          hadInvalid = true;
          if (command.verbosity >= 0) {
            options.out.write(messages.join('\n') + '\n');
          }
        }
      }

      numValidated += 1;
      if (numValidated === specPaths.length) {
        if (!hadError && !hadInvalid && command.verbosity >= 0) {
          options.err.write('All OpenAPI/Swagger specs are valid.\n');
        }

        callback(null, hadError ? 2 : hadInvalid ? 1 : 0);
      }
    }

    if (specPath === '-') {
      swaggerSpecValidator.validate(options.in, reqOpts, onResult);
    } else {
      swaggerSpecValidator.validateFile(specPath, reqOpts, onResult);
    }
  });

  return undefined;
}

swaggerSpecValidatorCmd.default = swaggerSpecValidatorCmd;
module.exports = swaggerSpecValidatorCmd;

if (require.main === module) {
  // This file was invoked directly.
  /* eslint-disable no-process-exit */
  var mainOptions = {
    in: process.stdin,
    out: process.stdout,
    err: process.stderr
  };
  swaggerSpecValidatorCmd(process.argv, mainOptions, function(err, exitCode) {
    if (err) {
      if (err.stdout) { process.stdout.write(err.stdout); }
      if (err.stderr) { process.stderr.write(err.stderr); }
      process.stderr.write(err.name + ': ' + err.message + '\n');

      exitCode = typeof err.exitCode === 'number' ? err.exitCode : 1;
    }

    process.exit(exitCode);
  });
}
