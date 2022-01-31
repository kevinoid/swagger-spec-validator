/**
 * @copyright Copyright 2017-2019 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 * @module swagger-spec-validator/cli.js
 */

'use strict';

const { Command, InvalidArgumentError } = require('commander');
const { promisify } = require('util');

const packageJson = require('./package.json');
const swaggerSpecValidator = require('./index.js');

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
    throw new InvalidArgumentError(
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

// TODO: Replace promisify() with Promise-returning version
const validateAll = promisify((specPaths, options, callback) => {
  let hadError = false;
  let hadInvalid = false;
  let numValidated = 0;
  for (const specPath of specPaths) {
    function onResult(err, result) {
      if (err) {
        hadError = true;
        if (options.verbosity >= -1) {
          options.stderr.write(`${specPath}: ${err}\n`);
          if (options.verbosity >= 1) {
            options.stderr.write(err.stack);
          }
        }
      } else {
        const messages = getMessages(result);
        if (messages.length > 0) {
          hadInvalid = true;
          if (options.verbosity >= 0) {
            const messagesWithPath =
              messages.map((message) => `${specPath}: ${message}`);
            options.stdout.write(`${messagesWithPath.join('\n')}\n`);
          }
        }
      }

      numValidated += 1;
      if (numValidated === specPaths.length) {
        if (!hadError && !hadInvalid && options.verbosity >= 0) {
          options.stderr.write('All OpenAPI/Swagger specs are valid.\n');
        }

        callback(undefined, hadError ? 2 : hadInvalid ? 1 : 0);
      }
    }

    if (specPath === '-') {
      swaggerSpecValidator.validate(options.stdin, options, onResult);
    } else {
      swaggerSpecValidator.validateFile(specPath, options, onResult);
    }
  }
});

/** Options for command entry points.
 *
 * @typedef {{
 *   stdin: !module:stream.Readable,
 *   stdout: !module:stream.Writable,
 *   stderr: !module:stream.Writable
 * }} CommandOptions
 * @property {!module:stream.Readable} stdin Stream from which input is read.
 * @property {!module:stream.Writable} stdout Stream to which output is
 * written.
 * @property {!module:stream.Writable} stderr Stream to which errors and
 * non-output status messages are written.
 */
// const CommandOptions;

/**
 * Entry point for this command.
 *
 * @param {!Array<string>} args Command-line arguments.
 * @param {!CommandOptions} options Options.
 * @returns {!Promise<number>} Promise for exit code.  Only rejected for
 * arguments with invalid type (or args.length < 2).
 */
module.exports =
async function swaggerSpecValidatorCmd(args, options) {
  if (!Array.isArray(args) || args.length < 2) {
    throw new TypeError('args must be an Array with at least 2 items');
  }

  if (!options || typeof options !== 'object') {
    throw new TypeError('options must be an object');
  }

  if (!options.stdin || typeof options.stdin.on !== 'function') {
    throw new TypeError('options.stdin must be a stream.Readable');
  }
  if (!options.stdout || typeof options.stdout.write !== 'function') {
    throw new TypeError('options.stdout must be a stream.Writable');
  }
  if (!options.stderr || typeof options.stderr.write !== 'function') {
    throw new TypeError('options.stderr must be a stream.Writable');
  }

  let errVersion;
  const command = new Command()
    .exitOverride()
    .configureOutput({
      writeOut: (str) => options.stdout.write(str),
      writeErr: (str) => options.stderr.write(str),
      getOutHelpWidth: () => options.stdout.columns,
      getErrHelpWidth: () => options.stderr.columns,
    })
    .arguments('[swagger.yaml...]')
    .allowExcessArguments(false)
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
      options.stdout.write(`${packageJson.name} ${packageJson.version}\n`);
      return 0;
    }

    // If a non-Commander error was thrown, treat it as unhandled.
    // It probably represents a bug and has not been written to stdout/stderr.
    // throw commander.{CommanderError,InvalidArgumentError} to avoid.
    if (typeof errParse.code !== 'string'
      || !errParse.code.startsWith('commander.')) {
      throw errParse;
    }

    return errParse.exitCode === 0 ? 0 : 3;
  }

  const argOpts = command.opts();

  const verbosity = (argOpts.verbose || 0) - (argOpts.quiet || 0);

  let specPaths = command.args;
  if (specPaths.length === 0) {
    // Default to validating stdin
    specPaths.push('-');
    if (verbosity > 1) {
      options.stdout.write('Reading spec from stdin...\n');
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
  return validateAll(specPaths, validateOpts);
};
