/**
 * @copyright Copyright 2017 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

var assert = require('assert');
var nock = require('nock');
var packageJson = require('../package.json');
var path = require('path');
var regexpEscape = require('regexp.escape');
var swaggerSpecValidator = require('..');
var url = require('url');

var defaultUrl = url.parse(swaggerSpecValidator.DEFAULT_URL);
var defaultProtoHost = defaultUrl.protocol + '//' + defaultUrl.host;

var swaggerJsonPath =
  path.join(__dirname, '..', 'test-data', 'petstore-minimal.json');
var swaggerYamlPath =
  path.join(__dirname, '..', 'test-data', 'petstore-minimal.yaml');
var emptyPath =
  path.join(__dirname, '..', 'test-data', 'empty.txt');

function neverCalled() {
  throw new Error('should not be called');
}

describe('swaggerSpecValidator', function() {
  afterEach(function() {
    nock.cleanAll();
  });

  before(function() {
    nock.disableNetConnect();
  });
  after(function() {
    nock.enableNetConnect();
    nock.restore();
  });

  describe('.validate', function() {
    it('POSTs to DEFAULT_URL by default', function() {
      var testBody = 'swagger';
      var response = {};
      var ne = nock(defaultProtoHost)
        .post(defaultUrl.path, testBody)
        .reply(200, response);
      return swaggerSpecValidator.validate(testBody)
        .then(function(result) {
          assert.deepEqual(result, response);
          ne.done();
        });
    });

    it('POSTs to URL from caller options', function() {
      var testProtoHost = 'http://example.com';
      var testPath = '/foo/bar?baz=quux';
      var response = {};
      var ne = nock(testProtoHost)
        .post(testPath)
        .reply(200, response);
      var options = {request: url.parse(testProtoHost + testPath)};
      return swaggerSpecValidator.validate('swagger', options)
        .then(function(result) {
          assert.deepEqual(result, response);
          ne.done();
        });
    });

    it('POSTs to URL path from caller options with default host', function() {
      var testPath = '/foo/bar?baz=quux';
      var response = {};
      var ne = nock(defaultProtoHost)
        .post(testPath)
        .reply(200, response);
      var options = {request: {path: testPath}};
      return swaggerSpecValidator.validate('swagger', options)
        .then(function(result) {
          assert.deepEqual(result, response);
          ne.done();
        });
    });

    it('sends Accept: application/json by default', function() {
      var response = {};
      var ne = nock(defaultProtoHost)
        .matchHeader('Accept', 'application/json')
        .post(defaultUrl.path)
        .reply(200, response);
      return swaggerSpecValidator.validate('swagger')
        .then(function(result) {
          assert.deepEqual(result, response);
          ne.done();
        });
    });

    it('sends User-Agent with package version by default', function() {
      var uaRE = new RegExp(
        '^' + regexpEscape(packageJson.name + '/' + packageJson.version)
      );
      var response = {};
      var ne = nock(defaultProtoHost)
        .matchHeader('User-Agent', uaRE)
        .post(defaultUrl.path)
        .reply(200, response);
      return swaggerSpecValidator.validate('swagger')
        .then(function(result) {
          assert.deepEqual(result, response);
          ne.done();
        });
    });

    it('can override default headers', function() {
      var uaRE = new RegExp(
        '^' + regexpEscape(packageJson.name + '/' + packageJson.version)
      );
      var response = {};
      var ne = nock(defaultProtoHost)
        .matchHeader('Accept', 'text/plain')
        .matchHeader('User-Agent', uaRE)
        .post(defaultUrl.path)
        .reply(200, response);
      var options = {request: {headers: {Accept: 'text/plain'}}};
      return swaggerSpecValidator.validate('swagger', options)
        .then(function(result) {
          assert.deepEqual(result, response);
          ne.done();
        });
    });

    it('can override default headers case-insensitively', function() {
      var uaRE = new RegExp(
        '^' + regexpEscape(packageJson.name + '/' + packageJson.version)
      );
      var response = {};
      var ne = nock(defaultProtoHost)
        .matchHeader('Accept', 'text/plain')
        .matchHeader('User-Agent', uaRE)
        .post(defaultUrl.path)
        .reply(200, response);
      var options = {request: {headers: {accept: 'text/plain'}}};
      return swaggerSpecValidator.validate('swagger', options)
        .then(function(result) {
          assert.deepEqual(result, response);
          ne.done();
        });
    });

    it('returns Error loading Agent', function() {
      var testStatusCode = 200;
      var testResponse = {};
      var ne = nock(defaultProtoHost)
        .post(defaultUrl.path)
        .optionally()
        .reply(testStatusCode, testResponse);

      var errTest = new Error('test error');
      function getTestError() {
        return Promise.reject(errTest);
      }
      /* eslint-disable no-underscore-dangle */
      var getSwaggerIoAgent = swaggerSpecValidator._getSwaggerIoAgent;
      var result;
      try {
        swaggerSpecValidator._getSwaggerIoAgent = getTestError;
        result = swaggerSpecValidator.validate('swagger')
          .then(
            neverCalled,
            function(err) {
              assert.strictEqual(err, errTest);
              ne.done();
            }
          );
      } finally {
        swaggerSpecValidator._getSwaggerIoAgent = getSwaggerIoAgent;
      }
      /* eslint-enable no-underscore-dangle */
      return result;
    });

    it('returns Error for invalid JSON body', function() {
      var testStatusCode = 200;
      var testResponse = '{"bad": "json"';
      var testType = 'application/json';
      var ne = nock(defaultProtoHost)
        .post(defaultUrl.path)
        .reply(testStatusCode, testResponse, {'Content-Type': testType});
      return swaggerSpecValidator.validate('swagger')
        .then(
          neverCalled,
          function(err) {
            assert.strictEqual(err.statusCode, testStatusCode);
            assert.strictEqual(err.headers['content-type'], testType);
            assert.strictEqual(String(err.body), testResponse);
            ne.done();
          }
        );
    });

    it('returns Error with JSON body for 4XX/5XX response', function() {
      var response = {message: 'test'};
      var testStatusCode = 400;
      var testType = 'application/json';
      var ne = nock(defaultProtoHost)
        .post(defaultUrl.path)
        .reply(testStatusCode, response, {'Content-Type': testType});
      return swaggerSpecValidator.validate('swagger')
        .then(
          neverCalled,
          function(err) {
            assert.strictEqual(err.statusCode, testStatusCode);
            assert.strictEqual(err.headers['content-type'], testType);
            assert.deepEqual(err.body, response);
            ne.done();
          }
        );
    });

    it('returns Error with non-JSON body for 4XX/5XX response', function() {
      var response = 'test message';
      var testStatusCode = 500;
      var testType = 'text/plain';
      var ne = nock(defaultProtoHost)
        .post(defaultUrl.path)
        .reply(testStatusCode, response, {'Content-Type': testType});
      return swaggerSpecValidator.validate('swagger')
        .then(
          neverCalled,
          function(err) {
            assert.strictEqual(err.statusCode, testStatusCode);
            assert.strictEqual(err.headers['content-type'], testType);
            assert.strictEqual(String(err.body), response);
            ne.done();
          }
        );
    });

    it('returns Error for unsupported protocol', function() {
      var options = {request: url.parse('ftp://example.com')};
      return swaggerSpecValidator.validateFile(swaggerJsonPath, options)
        .then(
          neverCalled,
          function(err) {
            assert.ok(/ftp/.test(err.message));
          }
        );
    });

    it('returns validator JSON with errors', function() {
      var testBody = 'swagger';
      var response = {messages: ['test1', 'test2']};
      var ne = nock(defaultProtoHost)
        .post(defaultUrl.path, testBody)
        .reply(200, response);
      return swaggerSpecValidator.validate(testBody)
        .then(function(result) {
          assert.deepEqual(result, response);
          ne.done();
        });
    });

    it('can be called with callback without options', function(done) {
      var testBody = 'swagger';
      var testResponse = {};
      var ne = nock(defaultProtoHost)
        .post(defaultUrl.path, testBody)
        .reply(200, testResponse);
      swaggerSpecValidator.validate(testBody, function(err, result) {
        assert.ifError(err);
        assert.deepEqual(result, testResponse);
        ne.done();
        done();
      });
    });

    it('throws for non-function callback', function() {
      var testBody = 'swagger';
      assert.throws(
        function() {
          swaggerSpecValidator.validate(testBody, {}, true);
        },
        TypeError,
        /\bcallback\b/
      );
    });

    it('accepts spec as Buffer', function() {
      var testBody = 'swagger';
      var response = {};
      var ne = nock(defaultProtoHost)
        .post(defaultUrl.path, testBody)
        .reply(200, response);
      return swaggerSpecValidator.validate(new Buffer(testBody))
        .then(function(result) {
          assert.deepEqual(result, response);
          ne.done();
        });
    });

    it('Error for non-string, non-Buffer, non-Readable spec', function() {
      return swaggerSpecValidator.validate(true)
        .then(
          neverCalled,
          function(err) {
            assert.ok(err instanceof TypeError);
            assert.ok(/\bspec\b/.test(err.message));
          }
        );
    });

    it('Error for non-object options', function() {
      var testBody = 'swagger';
      return swaggerSpecValidator.validate(testBody, true)
        .then(
          neverCalled,
          function(err) {
            assert.ok(err instanceof TypeError);
            assert.ok(/\boptions\b/.test(err.message));
          }
        );
    });
  });

  describe('.validateFile', function() {
    it('POSTs to DEFAULT_URL by default', function() {
      var response = {};
      var ne = nock(defaultProtoHost)
        .post(defaultUrl.path)
        .reply(200, response);
      return swaggerSpecValidator.validateFile(swaggerJsonPath)
        .then(function(result) {
          assert.deepEqual(result, response);
          ne.done();
        });
    });

    it('adds Content-Type: application/json for .json files', function() {
      var response = {};
      var ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/json')
        .post(defaultUrl.path)
        .reply(200, response);
      return swaggerSpecValidator.validateFile(swaggerJsonPath)
        .then(function(result) {
          assert.deepEqual(result, response);
          ne.done();
        });
    });

    it('adds Content-Type: text/x-yaml for .yaml files', function() {
      var response = {};
      var ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'text/x-yaml')
        .post(defaultUrl.path)
        .reply(200, response);
      return swaggerSpecValidator.validateFile(swaggerYamlPath)
        .then(function(result) {
          assert.deepEqual(result, response);
          ne.done();
        });
    });

    // This may change in the future.  Test to ensure header is reasonable.
    it('doesn\'t add Content-Type for other extensions', function() {
      var response = {};
      var ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', undefined)
        .post(defaultUrl.path)
        .reply(200, response);
      return swaggerSpecValidator.validateFile(emptyPath)
        .then(function(result) {
          assert.deepEqual(result, response);
          ne.done();
        });
    });

    it('does not change caller-provided Content-Type', function() {
      var response = {};
      var testType = 'text/plain';
      var ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', testType)
        .post(defaultUrl.path)
        .reply(200, response);
      var options = {request: {headers: {'content-type': testType}}};
      return swaggerSpecValidator.validateFile(swaggerYamlPath, options)
        .then(function(result) {
          assert.deepEqual(result, response);
          ne.done();
        });
    });

    it('can be called with callback without options', function(done) {
      var response = {};
      var ne = nock(defaultProtoHost)
        .post(defaultUrl.path)
        .reply(200, response);
      swaggerSpecValidator.validateFile(swaggerYamlPath, function(err, result) {
        assert.ifError(err);
        assert.deepEqual(result, response);
        ne.done();
        done();
      });
    });

    it('returns Error for unreadable file', function() {
      var testStatusCode = 200;
      var testResponse = {};
      var ne = nock(defaultProtoHost)
        .post(defaultUrl.path)
        .optionally()
        .reply(testStatusCode, testResponse);
      return swaggerSpecValidator.validateFile('nonexistent.yaml')
        .then(
          neverCalled,
          function(err) {
            assert.strictEqual(err.code, 'ENOENT');
            ne.done();
          }
        );
    });

    // The error event can be emitted from a file stream before reading begins.
    // If this happens before a listener is attached, it will cause an unhandled
    // exception.  This test covers a case where that could occur.
    it('returns Error for unreadable file while loading Agent', function() {
      var testStatusCode = 200;
      var testResponse = {};
      var ne = nock(defaultProtoHost)
        .post(defaultUrl.path)
        .optionally()
        .reply(testStatusCode, testResponse);

      function waitForever() {
        return new Promise(function() {});
      }
      /* eslint-disable no-underscore-dangle */
      var getSwaggerIoAgent = swaggerSpecValidator._getSwaggerIoAgent;
      var result;
      try {
        swaggerSpecValidator._getSwaggerIoAgent = waitForever;
        result = swaggerSpecValidator.validateFile('nonexistent.yaml')
          .then(
            neverCalled,
            function(err) {
              assert.strictEqual(err.code, 'ENOENT');
              ne.done();
            }
          );
      } finally {
        swaggerSpecValidator._getSwaggerIoAgent = getSwaggerIoAgent;
      }
      /* eslint-enable no-underscore-dangle */
      return result;
    });

    it('returns one Error for unreadable file and Agent', function(done) {
      var testStatusCode = 200;
      var testResponse = {};
      var ne = nock(defaultProtoHost)
        .post(defaultUrl.path)
        .optionally()
        .reply(testStatusCode, testResponse);

      var errTest = new Error('test error');
      function getTestError() {
        return Promise.reject(errTest);
      }
      /* eslint-disable no-underscore-dangle */
      var getSwaggerIoAgent = swaggerSpecValidator._getSwaggerIoAgent;
      try {
        swaggerSpecValidator._getSwaggerIoAgent = getTestError;
        swaggerSpecValidator.validateFile('nonexistent.yaml', function(err) {
          assert(err === errTest || err.code === 'ENOENT');
          ne.done();
          done();
        });
      } finally {
        swaggerSpecValidator._getSwaggerIoAgent = getSwaggerIoAgent;
      }
      /* eslint-enable no-underscore-dangle */
    });
  });
});
