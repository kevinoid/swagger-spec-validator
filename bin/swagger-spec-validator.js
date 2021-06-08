#!/usr/bin/env node
/**
 * swagger-spec-validator executable command.
 *
 * @copyright Copyright 2017-2019 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const { Command, InvalidOptionArgumentError } = require('commander');

const packageJson = require('../package.json');
const swaggerSpecValidator = require('..');

/** Option parser to count the number of occurrences of the option.
 *
 * @private
 * @param {boolean|string} optarg Argument passed to option (ignored).
 * @param {number=} previous Previous value of option (counter).
 * @returns {number} previous + 1.
 */
function countOption(optarg, previous) {
  return (previous || 0) + 1;
}

/** Option parser to count the number of occurrences of the option.
 *
 * @private
 * @param {string} headerLine Option argument (header line).
 * @param {!object<string,string>=} headers Previous value of header option
 * (object mapping header names to values) if any.
 * @returns {!object<string,string>} Object mapping header names to values,
 * with header argument added.
 * @throws Error If headerLine can not be parsed.
 */
function headerOption(headerLine, headers = Object.create(null)) {
  // Note: curl uses the header line literally.  We can't due to Node API.
  //       Node enforces name is a valid RFC 7230 token, so remove whitespace
  //       as a convenience for users.
  const match = /^\s*(\S+)\s*: ?(.*)$/.exec(headerLine);
  if (!match) {
    throw new InvalidOptionArgumentError(
      `Header must start with token, then colon.  Got "${headerLine}"`,
    );
  }

  const [, name, value] = match;
  headers[name] = value;
  return headers;
}

/** Gets validation messages from a validation response object.
 *
 * @private
 */
function getMessages(result) {
  let messages = [];
  if (result.messages) {
    messages = [...messages, ...result.messages];
  }
  if (result.schemaValidationMessages) {
    messages = [
      ...messages,
      ...result.schemaValidationMessages.map((m) => `${m.level}: ${m.message}`),
    ];
  }
  return messages;
}

function validateAll(specPaths, options, callback) {
  let hadError = false;
  let hadInvalid = false;
  let numValidated = 0;
  for (const specPath of specPaths) {
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

        // Use null to preserve current API.
        // eslint-disable-next-line unicorn/no-null
        callback(null, hadError ? 2 : hadInvalid ? 1 : 0);
      }
    }

    if (specPath === '-') {
      swaggerSpecValidator.validate(options.in, options, onResult);
    } else {
      swaggerSpecValidator.validateFile(specPath, options, onResult);
    }
  }
}

/** Options for command entry points.
 *
 * @typedef {{
 *   in: (module:stream.Readable|undefined),
 *   out: (module:stream.Writable|undefined),
 *   err: (module:stream.Writable|undefined)
 * }} CommandOptions
 * @property {module:stream.Readable=} in Stream from which input is read.
 * (default: <code>process.stdin</code>)
 * @property {module:stream.Writable=} out Stream to which output is written.
 * (default: <code>process.stdout</code>)
 * @property {module:stream.Writable=} err Stream to which errors (and
 * non-output status messages) are written.
 * (default: <code>process.stderr</code>)
 */
// const CommandOptions;

/**
 * Entry point for this command.
 *
 * @param {!Array<string>} args Command-line arguments.
 * @param {CommandOptions=} options Options.
 * @param {?function(Error, number=)=} callback Callback for the exit code or
 * an <code>Error</code>.
 * @returns {Promise<number>|undefined} If <code>callback</code> is not given, a
 * <code>Promise</code> with the exit code or <code>Error</code>.
 * @exports swagger-spec-validator/bin/swagger-spec-validator
 */
function swaggerSpecValidatorCmd(args, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = undefined;
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
      args = Array.prototype.slice.call(args).map(String);
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

  let errVersion;
  const command = new Command()
    .exitOverride()
    .configureOutput({
      writeOut: (str) => options.out.write(str),
      writeErr: (str) => options.err.write(str),
      getOutHelpWidth: () => options.out.columns,
      getErrHelpWidth: () => options.err.columns,
    })
    .arguments('[swagger.yaml...]')
    .allowExcessArguments(false)
    // Check for required/excess arguments.
    // Workaround https://github.com/tj/commander.js/issues/1493
    // TODO [commander@>=8]: Remove if fixed
    .action(() => {})
    .description('Validate OpenAPI/Swagger files.')
    .option(
      '-H, --header <header>',
      'additional HTTP header to send',
      headerOption,
    )
    .option('-q, --quiet', 'print less output', countOption)
    .option(
      '-u, --url <validator_url>',
      'validator URL',
      swaggerSpecValidator.DEFAULT_URL,
    )
    .option('-v, --verbose', 'print more output', countOption)
    // TODO: Replace with .version(packageJson.version) loaded as JSON module
    // https://github.com/nodejs/node/issues/37141
    .option('-V, --version', 'output the version number')
    // throw exception to stop option parsing early, as commander does
    // (e.g. to avoid failing due to missing required arguments)
    .on('option:version', () => {
      errVersion = new Error('version');
      throw errVersion;
    });

  try {
    command.parse(args);
  } catch (errParse) {
    if (errVersion) {
      options.out.write(`${packageJson.name} ${packageJson.version}\n`);
      // eslint-disable-next-line unicorn/no-null
      process.nextTick(callback, null, 0);
      return undefined;
    }

    // If a non-Commander error was thrown, treat it as unhandled.
    // It probably represents a bug and has not been written to stdout/stderr.
    // throw commander.{CommanderError,InvalidOptionArgumentError} to avoid.
    if (typeof errParse.code !== 'string'
      || !errParse.code.startsWith('commander.')) {
      throw errParse;
    }

    const exitCode = errParse.exitCode === 0 ? 0 : 3;
    // eslint-disable-next-line unicorn/no-null
    process.nextTick(callback, null, exitCode);
    return undefined;
  }

  const argOpts = command.opts();

  const verbosity = (argOpts.verbose || 0) - (argOpts.quiet || 0);

  let specPaths = command.args;
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
    request: argOpts.header ? { headers: argOpts.header } : undefined,
    url: argOpts.url,
    verbosity,
  };
  validateAll(specPaths, validateOpts, callback);
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
