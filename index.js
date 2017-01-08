/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var assign = require('object-assign');
var caseless = require('caseless');
var fs = require('fs');
var http = require('http');
var https = require('https');
var packageJson = require('./package.json');
var url = require('url');

/** Default URL to which validation requests are sent.
 * @const
 */
var DEFAULT_URL = 'https://online.swagger.io/validator/debug';

/** Default headers sent with API requests.
 * @const
 */
var DEFAULT_HEADERS = Object.freeze({
  Accept: 'application/json',
  'User-Agent': 'swagger-spec-validator/' + packageJson.version +
    ' Node.js/' + process.version.slice(1)
});

/** Makes an HTTP(S) request and parses the JSON response. */
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

/** Validates an OpenAPI/Swagger API specification.
 *
 * @param {string|!Buffer|!stream.Readable} spec OpenAPI/Swagger API
 * specification content.
 * @param {Object=} options Options for <code>http.request</code>.
 * @param {?function(Error, Object=)=} callback Callback for the validation
 * results object.  Required if <code>global.Promise</code> is not defined.
 * @return {Promise<Object>|undefined} If <code>callback</code> is not given
 * and <code>global.Promise</code> is defined, a <code>Promise</code> with the
 * validation results or <code>Error</code>.
 */
function validate(spec, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = null;
  }

  if (!callback && typeof Promise === 'function') {
    // eslint-disable-next-line no-undef
    return new Promise(function(resolve, reject) {
      validate(spec, options, function(err, result) {
        if (err) { reject(err); } else { resolve(result); }
      });
    });
  }

  if (typeof callback !== 'function') {
    throw new TypeError('callback must be a function');
  }

  if (options && typeof options !== 'object') {
    process.nextTick(function() {
      callback(new TypeError('options must be an object'));
    });
    return undefined;
  }

  var reqOpts = url.parse(DEFAULT_URL);
  reqOpts.method = 'POST';
  assign(reqOpts, options);
  reqOpts.headers = assign({}, DEFAULT_HEADERS, options && options.headers);
  reqOpts.body = spec;
  requestJson(reqOpts, callback);

  return undefined;
}

/** Validates an OpenAPI/Swagger API specification file.
 *
 * If not specified, the Content-Type header will be set for <code>.json</code>
 * and <code>.yaml</code>/<code>.yml</code> files.
 *
 * @param {string} specPath Path of OpenAPI/Swagger API specification file.
 * @param {Object=} options Options for <code>http.request</code>.
 * @param {?function(Error, Object=)=} callback Callback for the validation
 * results object.  Required if <code>global.Promise</code> is not defined.
 * @return {Promise<Object>|undefined} If <code>callback</code> is not given
 * and <code>global.Promise</code> is defined, a <code>Promise</code> with the
 * validation results or <code>Error</code>.
 */
function validateFile(specPath, options, callback) {
  if (!callback && typeof options === 'function') {
    callback = options;
    options = null;
  }

  var headers = options && options.headers;
  if (!headers || !caseless(headers).has('Content-Type')) {
    // Server ignores Content-Type, so not worth depending on a Media Type db.
    var contentType = /\.json$/i.test(specPath) ? 'application/json' :
      /\.ya?ml$/i.test(specPath) ? 'text/x-yaml' :
      null;
    if (contentType) {
      options = assign({}, options);
      options.headers = assign({}, options.headers);
      options.headers['Content-Type'] = contentType;
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
