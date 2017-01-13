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
  });
});
