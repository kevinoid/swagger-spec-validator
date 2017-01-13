/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var assign = require('object-assign');
var fs = require('fs');
var http = require('http');
var https = require('https');
var packageJson = require('./package.json');
var path = require('path');
var pify = require('pify');
var tls = require('tls');
var url = require('url');

var readFileP = pify(fs.readFile);
var readdirP = pify(fs.readdir);

/** Default URL to which validation requests are sent.
 * @const
 */
var DEFAULT_URL = 'https://online.swagger.io/validator/debug';

/** Default headers sent with API requests.
 * @const
 */
var DEFAULT_HEADERS = Object.freeze({
  Accept: 'application/json',
  'User-Agent': packageJson.name + '/' + packageJson.version +
    ' Node.js/' + process.version.slice(1)
});

/** HTTPS Agent for online.swagger.io which can valididate the HTTPS
 * certificate lacking an intermediate.
 * See https://github.com/swagger-api/validator-badge/issues/98
 */
var swaggerIoHttpsAgent;

/** Adds our default HTTP Agent to the request options.
 * @private
 */
function getSwaggerIoAgent() {
  if (!swaggerIoHttpsAgent) {
    var certsPath = path.join(__dirname, 'certs');
    swaggerIoHttpsAgent = readdirP(certsPath)
      .then(function(certNames) {
        return Promise.all(
          certNames.map(function(certName) {
            var certPath = path.join(certsPath, certName);
            return readFileP(certPath, {encoding: 'utf8'});
          })
        );
      })
      .then(function(certs) {
        // Note: Using undocumented API to use both root and loaded certs.
        //       Specifying options.ca skips root certs, which could cause cert
        //       verification to fail if online.swagger.io changed certs.
        var secureContext = tls.createSecureContext();
        certs.forEach(function(cert) {
          secureContext.context.addCACert(cert);
        });
        return new https.Agent({
          keepAlive: true,
          secureContext: secureContext
        });
      });
  }

  return swaggerIoHttpsAgent;
}

/** Makes an HTTP(S) request and parses the JSON response.
 * @private
 */
function requestJson(options, callback) {
  var proto = options.protocol === 'https:' ? https :
    options.protocol === 'http:' ? http :
    null;
  if (!proto) {
    callback(new Error('Unsupported protocol "' + options.protocol +
                       '" for validator URL'));
    return;
  }

  var req = proto.request(options)
    .once('error', callback)
    .once('response', function(res) {
      res.on('error', callback);
      var bodyData = [];
      res.on('data', function(data) { bodyData.push(data); });
      res.on('end', function() {
        var resBody = Buffer.concat(bodyData);
        var errBody, resBodyObj;
        try {
          resBodyObj = JSON.parse(resBody.toString());
        } catch (errJson) {
          errBody = new SyntaxError('Error parsing server response as JSON: ' +
                                    errJson.message);
        }

        if (res.statusCode >= 300) {
          var errMessage = 'HTTP ' + res.statusCode;
          if (res.statusMessage) {
            errMessage += ': ' + res.statusMessage;
          }
          var err = new Error(errMessage);
          err.statusCode = res.statusCode;
          err.statusMessage = res.statusMessage;
          err.headers = res.headers;
          err.trailers = res.trailers;
          err.body = resBodyObj !== undefined ? resBodyObj : resBody;
          callback(err);
        } else {
          callback(errBody, resBodyObj);
        }
      });
    });

  var body = options.body;
  if (typeof body === 'string' || Buffer.isBuffer(body)) {
    req.end(body);
  } else {
    body.on('error', function(err) {
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
 *   verbosity: (number|undefined)
 * }} ValidateOptions
 * @property {stream.Writable=} err Stream to which errors (and non-output
 * status messages) are written. (default: <code>process.stderr</code>)
 * @property {Object=} request Options passed to <code>http.request()</code>.
 * @property {number=} verbosity Amount of output to produce.  Larger numbers
 * produce more output.
 */
// var ValidateOptions;

/** Validates an OpenAPI/Swagger API specification.
 *
 * @param {string|!Buffer|!stream.Readable} spec OpenAPI/Swagger API
 * specification content.
 * @param {ValidateOptions=} options Validation options.
 * @param {?function(Error, Object=)=} callback Callback for the validation
 * results object.
 * @return {Promise<Object>|undefined} If <code>callback</code> is not given,
 * a <code>Promise</code> with the validation results or <code>Error</code>.
 */
function validate(spec, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = null;
  }

  if (!callback) {
    return new Promise(function(resolve, reject) {
      validate(spec, options, function(err, result) {
        if (err) { reject(err); } else { resolve(result); }
      });
    });
  }

  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  try {
    if (spec === undefined ||
        spec === null ||
        (typeof spec !== 'string' &&
         !Buffer.isBuffer(spec) &&
         typeof spec.pipe !== 'function')) {
      throw new TypeError('spec must be a string, Buffer, or Readable');
    }

    if (options !== undefined && typeof options !== 'object') {
      throw new TypeError('options must be an object');
    }
  } catch (err) {
    process.nextTick(function() {
      callback(err);
    });
    return undefined;
  }

  var reqOpts = url.parse(DEFAULT_URL);
  reqOpts.method = 'POST';
  assign(reqOpts, options && options.request);
  reqOpts.headers = assign({}, DEFAULT_HEADERS, reqOpts.headers);
  reqOpts.body = spec;

  if (reqOpts.hostname === 'online.swagger.io' &&
      !hasOwnProperty.call(reqOpts, 'agent')) {
    getSwaggerIoAgent()
      .then(function(agent) {
        reqOpts.agent = agent;
        requestJson(reqOpts, callback);
      })
      .catch(callback);
  } else {
    requestJson(reqOpts, callback);
  }

  return undefined;
}

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
function validateFile(specPath, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = null;
  }

  var headers = options && options.request && options.request.headers;
  var hasContentType = headers && Object.keys(headers).some(function(name) {
    return name.toLowerCase() === 'content-type';
  });
  if (!hasContentType) {
    // Server ignores Content-Type, so not worth depending on a Media Type db.
    var contentType = /\.json$/i.test(specPath) ? 'application/json' :
      /\.ya?ml$/i.test(specPath) ? 'text/x-yaml' :
      null;
    if (contentType) {
      options = assign({}, options);
      options.request = assign({}, options.request);
      options.request.headers = assign({}, options.request.headers);
      options.request.headers['Content-Type'] = contentType;
    }
  }

  var specStream = fs.createReadStream(specPath);
  return validate(specStream, options, callback);
}

module.exports = {
  DEFAULT_HEADERS: DEFAULT_HEADERS,
  DEFAULT_URL: DEFAULT_URL,
  validate: validate,
  validateFile: validateFile
};
