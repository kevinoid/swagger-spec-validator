#!/usr/bin/env node
/**
 * swagger-spec-validator executable command.
 *
 * @copyright Copyright 2017-2019 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const Yargs = require('yargs/yargs');

const packageJson = require('../package.json');
const swaggerSpecValidator = require('..');

function parseHeader(line) {
  // Note: curl uses the header line literally.  We can't due to Node API.
  //       Node enforces name is a valid RFC 7230 token, so remove whitespace
  //       as a convenience for users.
  const match = /^\s*(\S+)\s*: ?(.*)$/.exec(line);
  if (!match) {
    throw new Error(`Unable to parse header line "${line}"`);
  }

  const name = match[1];
  const value = match[2];
  return [name, value];
}

function parseHeaders(lines) {
  return lines
    // yargs passes [undefined] when insufficient arguments are given
    .filter((line) => line !== null && line !== undefined)
    .map(parseHeader)
    .reduce((headerObj, [headerName, headerVal]) => {
      headerObj[headerName] = headerVal;
      return headerObj;
    }, {});
}

/** Gets validation messages from a validation response object.
 * @private
 */
function getMessages(result) {
  let messages = [];
  if (result.messages) {
    messages = messages.concat(result.messages);
  }
  if (result.schemaValidationMessages) {
    messages = messages.concat(
      result.schemaValidationMessages.map((m) => `${m.level}: ${m.message}`),
    );
  }
  return messages;
}

function validateAll(specPaths, options, callback) {
  let hadError = false;
  let hadInvalid = false;
  let numValidated = 0;
  specPaths.forEach((specPath) => {
    function onResult(err, result) {
      if (err) {
        hadError = true;
        if (options.verbosity >= -1) {
          options.err.write(`${specPath}: ${err}\n`);
          if (options.verbosity >= 1) {
            options.err.write(err.stack);
          }
        }
      } else {
        const messages = getMessages(result);
        if (messages.length > 0) {
          hadInvalid = true;
          if (options.verbosity >= 0) {
            const messagesWithPath =
              messages.map((message) => `${specPath}: ${message}`);
            options.out.write(`${messagesWithPath.join('\n')}\n`);
          }
        }
      }

      numValidated += 1;
      if (numValidated === specPaths.length) {
        if (!hadError && !hadInvalid && options.verbosity >= 0) {
          options.err.write('All OpenAPI/Swagger specs are valid.\n');
        }

        callback(null, hadError ? 2 : hadInvalid ? 1 : 0);
      }
    }

    if (specPath === '-') {
      swaggerSpecValidator.validate(options.in, options, onResult);
    } else {
      swaggerSpecValidator.validateFile(specPath, options, onResult);
    }
  });
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
// const CommandOptions;

/** Entry point for this command.
 *
 * @param {!Array<string>} args Command-line arguments.
 * @param {CommandOptions=} options Options.
 * @param {?function(Error, number=)=}
 * callback Callback for the exit code or an <code>Error</code>.
 * @return {Promise<number>|undefined} If <code>callback</code> is not given, a
 * <code>Promise</code> with the exit code or <code>Error</code>.
 * @exports swagger-spec-validator/bin/swagger-spec-validator
 */
function swaggerSpecValidatorCmd(args, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = null;
  }

  if (!callback) {
    return new Promise((resolve, reject) => {
      swaggerSpecValidatorCmd(args, options, (err, result) => {
        if (err) { reject(err); } else { resolve(result); }
      });
    });
  }

  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  try {
    if (args === undefined || args === null) {
      args = [];
    } else if (typeof args !== 'object'
               || Math.floor(args.length) !== args.length) {
      throw new TypeError('args must be Array-like');
    } else if (args.length < 2 && args.length !== 0) {
      throw new RangeError('args must have at least 2 elements');
    } else {
      args = Array.prototype.slice.call(args, 2).map(String);
    }

    if (options !== undefined && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }

    options = {
      in: process.stdin,
      out: process.stdout,
      err: process.stderr,
      ...options,
    };

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
    process.nextTick(() => {
      callback(err);
    });
    return undefined;
  }

  // Workaround for https://github.com/yargs/yargs/issues/783
  // Necessary because mocha package.json overrides .parserConfiguration()
  require.main = module;
  const yargs = new Yargs(null, null, require)
    .parserConfiguration({
      'parse-numbers': false,
      'duplicate-arguments-array': false,
      'flatten-duplicate-arrays': false,
    })
    .usage('Usage: $0 [options] [swagger.yaml...]')
    .option('header', {
      alias: 'H',
      describe: 'Additional HTTP header to send',
      requiresArg: true,
      array: true,
      // Prevent array from eating non-option arguments
      nargs: 1,
      coerce: parseHeaders,
    })
    .help()
    .alias('help', 'h')
    .alias('help', '?')
    .option('quiet', {
      alias: 'q',
      describe: 'Print less output',
      count: true,
    })
    .option('url', {
      alias: 'u',
      describe: 'Validator URL',
      defaultDescription: swaggerSpecValidator.DEFAULT_URL,
      nargs: 1,
    })
    .option('verbose', {
      alias: 'v',
      describe: 'Print more output',
      count: true,
    })
    .version(`${packageJson.name} ${packageJson.version}`)
    .alias('version', 'V')
    .strict();
  yargs.parse(args, (err, argOpts, output) => {
    if (err) {
      if (output) {
        options.err.write(`${output}\n`);
      } else {
        options.err.write(`${err.name}: ${err.message}\n`);
      }
      callback(null, 3);
      return;
    }

    if (output) {
      options.out.write(`${output}\n`);
    }

    if (argOpts.help || argOpts.version) {
      callback(null, 0);
      return;
    }

    const verbosity = argOpts.verbose - argOpts.quiet;

    let specPaths = argOpts._;
    if (specPaths.length === 0) {
      // Default to validating stdin
      specPaths.push('-');
      if (verbosity > 1) {
        options.out.write('Reading spec from stdin...\n');
      }
    } else if (specPaths.length > 1) {
      specPaths = [...new Set(specPaths)];
    }

    const validateOpts = {
      ...options,
      request: argOpts.header ? { headers: argOpts.header } : null,
      url: argOpts.url,
      verbosity,
    };
    validateAll(specPaths, validateOpts, callback);
  });

  return undefined;
}

swaggerSpecValidatorCmd.default = swaggerSpecValidatorCmd;
module.exports = swaggerSpecValidatorCmd;

if (require.main === module) {
  // This file was invoked directly.
  /* eslint-disable no-process-exit */
  const mainOptions = {
    in: process.stdin,
    out: process.stdout,
    err: process.stderr,
  };
  swaggerSpecValidatorCmd(process.argv, mainOptions, (err, exitCode) => {
    if (err) {
      if (err.stdout) { process.stdout.write(err.stdout); }
      if (err.stderr) { process.stderr.write(err.stderr); }
      process.stderr.write(`${err.name}: ${err.message}\n`);

      exitCode = typeof err.exitCode === 'number' ? err.exitCode : 1;
    }

    process.exit(exitCode);
  });
}
