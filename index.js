/**
 * @copyright Copyright 2017-2019 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const tls = require('tls');
// TODO [engine:node@>=10]: Use URL defined globally
const { URL } = require('url'); // eslint-disable-line no-shadow
const util = require('util');

const packageJson = require('./package.json');

// stream.Writable (and therefore http.ClientRequest) accept any Uint8Array
// TODO [engine:node@>=10]: Use util.types unconditionally
// eslint-disable-next-line node/no-unsupported-features/node-builtins
const isUint8Array = util.types ? util.types.isUint8Array
  : function isUint8Array(obj) {
    return Object.prototype.toString.call(obj) === '[object Uint8Array]';
  };

const readFileP = util.promisify(fs.readFile);
const readdirP = util.promisify(fs.readdir);

/** @exports swagger-spec-validator */
const swaggerSpecValidator = {};

/** Default URL to which validation requests are sent.
 * @const
 */
const DEFAULT_URL = 'https://online.swagger.io/validator/debug';
swaggerSpecValidator.DEFAULT_URL = DEFAULT_URL;

/** Default headers sent with API requests.
 * @const
 */
const DEFAULT_HEADERS = Object.freeze({
  Accept: 'application/json',
  'User-Agent': `${packageJson.name}/${packageJson.version} `
    + `Node.js/${process.version.slice(1)}`,
});
swaggerSpecValidator.DEFAULT_HEADERS = DEFAULT_HEADERS;

/** HTTPS Agent for online.swagger.io which can valididate the HTTPS
 * certificate lacking an intermediate.
 * See https://github.com/swagger-api/validator-badge/issues/98
 * @private
 */
let swaggerIoHttpsAgent;

/** Adds our default HTTP Agent to the request options.
 *
 * This private function is exported to allow it to be overridden for testing.
 * @private
 */
// eslint-disable-next-line no-underscore-dangle
swaggerSpecValidator._getSwaggerIoHttpsAgent =
function _getSwaggerIoHttpsAgent() {
  if (!swaggerIoHttpsAgent) {
    const certsPath = path.join(__dirname, 'certs');
    swaggerIoHttpsAgent = readdirP(certsPath)
      .then((certNames) => Promise.all(
        certNames.map((certName) => {
          const certPath = path.join(certsPath, certName);
          return readFileP(certPath, { encoding: 'utf8' });
        }),
      ))
      .then((certs) => {
        // Note: Using undocumented API to use both root and loaded certs.
        //       Specifying options.ca skips root certs, which could cause cert
        //       verification to fail if online.swagger.io changed certs.
        // Note: First call to addCACert reloads root certs without
        //       NODE_EXTRA_CA_CERTS. On Debian this includes all root CAs.
        //       This is why the DigiCert Root CA file is in the package.
        const secureContext = tls.createSecureContext();
        certs.forEach((cert) => {
          secureContext.context.addCACert(cert);
        });
        return new https.Agent({
          keepAlive: true,
          secureContext,
        });
      });
  }

  return swaggerIoHttpsAgent;
};

/** Combines HTTP headers objects.
 * With the capitalization and value of the last occurrence.
 * @private
 */
function combineHeaders(...args) {
  const combinedLower = {};
  const combined = {};
  args.reverse();
  args.forEach((headers) => {
    if (headers) {
      Object.keys(headers).forEach((name) => {
        const nameLower = name.toLowerCase();
        if (!hasOwnProperty.call(combinedLower, nameLower)) {
          combinedLower[nameLower] = true;
          combined[name] = headers[name];
        }
      });
    }
  });
  return combined;
}

/** Makes an HTTP(S) request and parses the JSON response.
 * @private
 */
function requestJson(url, options, callback) {
  const protocol = options.protocol || url.protocol;
  const proto = protocol === 'https:' ? https
    : protocol === 'http:' ? http
      : null;
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

        if (res.statusCode >= 300) {
          let errMessage = `HTTP ${res.statusCode}`;
          if (res.statusMessage) {
            errMessage += `: ${res.statusMessage}`;
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

/** Validation options
 *
 * @typedef {{
 *   err: (stream.Writable|undefined),
 *   request: (Object|undefined),
 *   url: (URL|Object|string|undefined),
 *   verbosity: (number|undefined)
 * }} ValidateOptions
 * @property {stream.Writable=} err Stream to which errors (and non-output
 * status messages) are written. (default: <code>process.stderr</code>)
 * @property {Object=} request Options passed to <code>http.request()</code>.
 * @property {URL|Object|string=} url URL passed to <code>http.request()</code>.
 * @property {number=} verbosity Amount of output to produce.  Larger numbers
 * produce more output.
 */
// var ValidateOptions;

/** Validates an OpenAPI/Swagger API specification.
 *
 * @param {string|!Uint8Array|!stream.Readable} spec OpenAPI/Swagger API
 * specification content.
 * @param {ValidateOptions=} options Validation options.
 * @param {?function(Error, Object=)=} callback Callback for the validation
 * results object.
 * @return {Promise<Object>|undefined} If <code>callback</code> is not given,
 * a <code>Promise</code> with the validation results or <code>Error</code>.
 */
swaggerSpecValidator.validate =
function validate(spec, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = null;
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

    if (options !== undefined && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }
  } catch (err) {
    process.nextTick(() => {
      callback(err);
    });
    return undefined;
  }

  // Note: Options on URL object are ignored by https.request()
  // Don't combine into single options object without conversion to generic obj.
  const reqUrl =
    !options || !options.url ? new URL(DEFAULT_URL)
      : typeof options.url === 'object' ? options.url
        : new URL(options.url);
  const reqOpts = {
    method: 'POST',
    ...options && options.request,
    body: spec,
  };
  reqOpts.headers =
    reqOpts.headers ? combineHeaders(DEFAULT_HEADERS, reqOpts.headers)
      : DEFAULT_HEADERS;

  let calledBack = false;
  function callbackOnce(...args) {
    if (!calledBack) {
      calledBack = true;
      callback.apply(this, args);
    }
  }

  if ((reqOpts.protocol || reqUrl.protocol) === 'https:'
      && (reqOpts.hostname || reqUrl.hostname) === 'online.swagger.io'
      && !hasOwnProperty.call(reqOpts, 'agent')) {
    if (typeof spec.pipe === 'function') {
      // Stream can emit an error before Agent is loaded.  Handle this.
      spec.on('error', callbackOnce);
    }

    // eslint-disable-next-line no-underscore-dangle
    swaggerSpecValidator._getSwaggerIoHttpsAgent()
      .then((agent) => {
        if (!calledBack) {
          reqOpts.agent = agent;
          requestJson(reqUrl, reqOpts, callbackOnce);
        }
      })
      .catch(callbackOnce);
  } else {
    requestJson(reqUrl, reqOpts, callback);
  }

  return undefined;
};

/** Validates an OpenAPI/Swagger API specification file.
 *
 * If not specified, the Content-Type header will be set for <code>.json</code>
 * and <code>.yaml</code>/<code>.yml</code> files.
 *
 * @param {string} specPath Path of OpenAPI/Swagger API specification file.
 * @param {ValidateOptions=} options Validation options.
 * @param {?function(Error, Object=)=} callback Callback for the validation
 * results object.
 * @return {Promise<Object>|undefined} If <code>callback</code> is not given,
 * a <code>Promise</code> with the validation results or <code>Error</code>.
 */
swaggerSpecValidator.validateFile =
function validateFile(specPath, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = null;
  }

  const headers = options && options.request && options.request.headers;
  const hasContentType = headers
      && Object.keys(headers)
        .some((name) => name.toLowerCase() === 'content-type');
  if (!hasContentType) {
    // application/yaml is the only known supported type on validator.swagger.io
    // online.swagger.io ignores Content-Type
    // https://github.com/swagger-api/validator-badge/issues/136#issuecomment-545945678
    const contentType = /\.json$/i.test(specPath) ? 'application/json'
      : /\.ya?ml$/i.test(specPath) ? 'application/yaml'
        : null;
    if (contentType) {
      options = { ...options };
      options.request = { ...options.request };
      options.request.headers = { ...options.request.headers };
      options.request.headers['Content-Type'] = contentType;
    }
  }

  const specStream = fs.createReadStream(specPath);
  return swaggerSpecValidator.validate(specStream, options, callback);
};

module.exports = swaggerSpecValidator;
