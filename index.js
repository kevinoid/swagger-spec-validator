/**
 * @copyright Copyright 2017-2019 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 * @module modulename
 */

'use strict';

const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
// stream.Writable (and therefore http.ClientRequest) accept any Uint8Array
const { types: { isUint8Array } } = require('node:util');

const packageJson = require('./package.json');

/** @exports swagger-spec-validator */
const swaggerSpecValidator = {};

/** JSON Content-Type accepted by validator.swagger.io.
 *
 * @constant
 * @private
 */
const JSON_CONTENT_TYPE = 'application/json';

/** YAML Content-Type accepted by validator.swagger.io.
 * See https://github.com/swagger-api/validator-badge/issues/136
 *
 * @constant
 * @private
 */
const YAML_CONTENT_TYPE = 'application/yaml';

/** Default URL to which validation requests are sent.
 *
 * @constant
 */
const DEFAULT_URL = 'https://validator.swagger.io/validator/debug';
swaggerSpecValidator.DEFAULT_URL = DEFAULT_URL;

/** Default headers sent with API requests.
 *
 * @constant
 */
const DEFAULT_HEADERS = Object.freeze({
  Accept: JSON_CONTENT_TYPE,
  'User-Agent': `${packageJson.name}/${packageJson.version} `
    + `Node.js/${process.version.slice(1)}`,
});
swaggerSpecValidator.DEFAULT_HEADERS = DEFAULT_HEADERS;

/** Combines HTTP headers objects.
 * With the capitalization and value of the last occurrence.
 *
 * @private
 */
function combineHeaders(...args) {
  const combinedLower = {};
  const combined = {};
  args.reverse();
  for (const headers of args) {
    if (headers) {
      for (const name of Object.keys(headers)) {
        const nameLower = name.toLowerCase();
        if (!Object.hasOwn(combinedLower, nameLower)) {
          combinedLower[nameLower] = true;
          combined[name] = headers[name];
        }
      }
    }
  }
  return combined;
}

/** Reads all data from a stream.Readable.
 *
 * @private
 * @param {!module:stream.Readable} stream Stream from which to read all data.
 * @returns {string|Buffer} Data from stream, if any.
 */
function getStreamData(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream
      .on('data', (chunk) => chunks.push(chunk))
      .once('error', reject)
      .once(
        'end',
        () => resolve(
          chunks.length === 0 ? undefined
            : Buffer.isBuffer(chunks[0]) ? Buffer.concat(chunks)
              : typeof chunks[0] === 'string' ? chunks.join('')
                : chunks,
        ),
      );
  });
}

/** Makes an HTTP(S) request and parses the JSON response.
 *
 * @private
 */
function requestJson(url, options, callback) {
  const protocol = options.protocol || url.protocol;
  const proto = protocol === 'https:' ? https
    : protocol === 'http:' ? http
      : undefined;
  if (!proto) {
    callback(
      new Error(`Unsupported protocol "${protocol}" for validator URL`),
    );
    return;
  }

  // http.request and https.request only accept string or URL as url argument.
  // This module allows url object since it is unambiguous in named options.
  // If url is not a URL, combine with options.
  const req =
    url instanceof URL ? proto.request(url, options)
      : proto.request({
        ...url,
        ...options,
      });

  req
    .once('error', callback)
    .once('response', (res) => {
      res.on('error', callback);
      const bodyData = [];
      res.on('data', (data) => { bodyData.push(data); });
      res.on('end', () => {
        const resBody = Buffer.concat(bodyData);
        let err, resBodyObj;
        try {
          resBodyObj = JSON.parse(resBody.toString());
        } catch (errJson) {
          err = new SyntaxError(
            `Error parsing server response as JSON: ${errJson.message}`,
          );
        }

        // Note: Could redirect using follow-redirects, axios, got, node-fetch
        // No known use case, since user should update -u to avoid overhead.
        // If you have a use case, feel free to open an issue.
        if (res.statusCode >= 300) {
          let errMessage = `HTTP ${res.statusCode}`;
          if (res.statusMessage) {
            errMessage += `: ${res.statusMessage}`;
          }
          const { location } = res.headers;
          if (location) {
            errMessage += `: ${location}`;
          }
          err = new Error(errMessage);
        }

        if (err) {
          err.statusCode = res.statusCode;
          err.statusMessage = res.statusMessage;
          err.headers = res.headers;
          err.trailers = res.trailers;
          err.body = resBodyObj !== undefined ? resBodyObj : resBody;
          callback(err);
        } else {
          // Use null to preserve current API.
          // eslint-disable-next-line unicorn/no-null
          callback(null, resBodyObj);
        }
      });
    });

  const { body } = options;
  if (typeof body === 'string' || isUint8Array(body)) {
    req.end(body);
  } else {
    body.on('error', (err) => {
      req.abort();
      callback(err);
    });
    body.pipe(req);
  }
}

/** Guesses Content-Type of OpenAPI/Swagger spec data.
 *
 * @private
 * @param {string|!Uint8Array} spec OpenAPI/Swagger API specification content.
 * @returns {string} Content type of spec.
 */
function guessSpecDataContentType(spec, options) {
  try {
    JSON.parse(spec);
    return JSON_CONTENT_TYPE;
  } catch {
    if (options.verbosity >= 1) {
      options.err.write(
        'Unable to parse spec content as JSON.  Assuming YAML.\n',
      );
    }

    return YAML_CONTENT_TYPE;
  }
}

/** Guesses Content-Type of OpenAPI/Swagger spec data or stream.
 *
 * Note: All current versions of the OpenAPI Specification require OpenAPI
 * documents to be JSON or YAML, so this function attempts to distinguish
 * between only those two types.
 *
 * @private
 * @param {string|!Uint8Array|!module:stream.Readable} spec OpenAPI/Swagger API
 * specification content.
 */
function guessSpecContentType(spec, options) {
  let contentType;
  if (typeof spec === 'string' || isUint8Array(spec)) {
    contentType = guessSpecDataContentType(spec, options);
  } else if (spec.path) {
    // fs.ReadStream#path is string or Buffer with file path.
    if (/\.json$/i.test(spec.path)) {
      contentType = JSON_CONTENT_TYPE;
    } else if (/\.ya?ml$/i.test(spec.path)) {
      contentType = YAML_CONTENT_TYPE;
    }
  }

  if (contentType) {
    return Promise.resolve({ contentType });
  }

  if (options.verbosity >= 1) {
    options.err.write(
      'Content-Type not specified and can\'t be inferred from filename.\n'
      + 'Reading spec content...\n',
    );
  }

  return getStreamData(spec)
    .then((specContent) => ({
      contentType: guessSpecDataContentType(specContent, options),
      specContent,
    }));
}

/** Validation options
 *
 * @typedef {{
 *   err: (module:stream.Writable|undefined),
 *   request: (object|undefined),
 *   url: (URL|object|string|undefined),
 *   verbosity: (number|undefined)
 * }} ValidateOptions
 * @property {module:stream.Writable=} err Stream to which errors (and
 * non-output status messages) are written.
 * (default: <code>process.stderr</code>)
 * @property {object=} request Options passed to <code>http.request()</code>.
 * @property {URL|object|string=} url URL passed to <code>http.request()</code>.
 * @property {number=} verbosity Amount of output to produce.  Larger numbers
 * produce more output.
 */
// var ValidateOptions;

/** Validates an OpenAPI/Swagger API specification.
 *
 * @param {string|!Uint8Array|!module:stream.Readable} spec OpenAPI/Swagger API
 * specification content.
 * @param {ValidateOptions=} options Validation options.
 * @param {?function(Error, object=)=} callback Callback for the validation
 * results object.
 * @returns {Promise<object>|undefined} If <code>callback</code> is not given,
 * a <code>Promise</code> with the validation results or <code>Error</code>.
 */
swaggerSpecValidator.validate =
function validate(spec, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = undefined;
  }

  if (!callback) {
    return new Promise((resolve, reject) => {
      validate(spec, options, (err, result) => {
        if (err) { reject(err); } else { resolve(result); }
      });
    });
  }

  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  try {
    if (spec === undefined
        || spec === null
        || (typeof spec !== 'string'
         && !isUint8Array(spec)
         && typeof spec.pipe !== 'function')) {
      throw new TypeError('spec must be a string, Uint8Array, or Readable');
    }

    if (options !== undefined && options !== null) {
      if (typeof options !== 'object') {
        throw new TypeError('options must be an object');
      }

      if (options.err !== undefined
        && options.err !== null
        && typeof options.err.write !== 'function') {
        throw new TypeError('options.err must be a stream.Writable');
      }
    }
  } catch (err) {
    queueMicrotask(() => callback(err));
    return undefined;
  }

  options = { ...options };
  options.err ||= process.stderr;

  // Note: Options on URL object are ignored by https.request()
  // Don't combine into single options object without conversion to generic obj.
  const reqUrl =
    !options.url ? new URL(DEFAULT_URL)
      : typeof options.url === 'object' ? options.url
        : new URL(options.url);
  const reqOpts = {
    method: 'POST',
    ...options.request,
    body: spec,
  };
  reqOpts.headers =
    reqOpts.headers
      ? combineHeaders(DEFAULT_HEADERS, reqOpts.headers || reqUrl.headers)
      : { ...DEFAULT_HEADERS };

  let calledBack = false;
  function callbackOnce(...args) {
    if (!calledBack) {
      calledBack = true;
      callback.apply(this, args);
    }
  }

  let contentInfoP;
  if (!Object.keys(reqOpts.headers)
    .some((name) => name.toLowerCase() === 'content-type')) {
    contentInfoP = guessSpecContentType(spec, options);
  } else {
    // Use null to preserve current API.
    // eslint-disable-next-line unicorn/no-null
    contentInfoP = Promise.resolve(null);
  }

  contentInfoP
    .then((contentInfo) => {
      if (contentInfo) {
        const { contentType, specContent } = contentInfo;
        reqOpts.headers['Content-Type'] = contentType;

        if (specContent) {
          reqOpts.body = specContent;
        }
      }

      requestJson(reqUrl, reqOpts, callbackOnce);
    })
    .catch(callbackOnce);

  return undefined;
};

/** Validates an OpenAPI/Swagger API specification file.
 *
 * If not specified, the Content-Type header will be set for <code>.json</code>
 * and <code>.yaml</code>/<code>.yml</code> files.
 *
 * @param {string} specPath Path of OpenAPI/Swagger API specification file.
 * @param {ValidateOptions=} options Validation options.
 * @param {?function(Error, object=)=} callback Callback for the validation
 * results object.
 * @returns {Promise<object>|undefined} If <code>callback</code> is not given,
 * a <code>Promise</code> with the validation results or <code>Error</code>.
 */
swaggerSpecValidator.validateFile =
function validateFile(specPath, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = undefined;
  }

  const specStream = fs.createReadStream(specPath);
  return swaggerSpecValidator.validate(specStream, options, callback);
};

module.exports = swaggerSpecValidator;
