/**
 * @copyright Copyright 2017-2019 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const assert = require('assert');
const nock = require('nock');
const path = require('path');
const regexpEscape = require('regexp.escape');
const stream = require('stream');
const url = require('url');
// TODO [engine:node@>=10]: Use URL defined globally
const { URL } = url; // eslint-disable-line no-shadow

const packageJson = require('../package.json');
const swaggerSpecValidator = require('..');

const defaultUrl = new URL(swaggerSpecValidator.DEFAULT_URL);
const defaultProtoHost = `${defaultUrl.protocol}//${defaultUrl.host}`;
const defaultUrlPath = defaultUrl.pathname + defaultUrl.search;

const onlineSwaggerIoUrl =
  new URL('https://online.swagger.io/validator/debug');
const onlineSwaggerIoProtoHost =
  `${onlineSwaggerIoUrl.protocol}//${onlineSwaggerIoUrl.host}`;
const onlineSwaggerIoUrlPath =
  onlineSwaggerIoUrl.pathname + onlineSwaggerIoUrl.search;

const swaggerJsonPath =
  path.join(__dirname, '..', 'test-data', 'petstore-minimal.json');
const swaggerYamlPath =
  path.join(__dirname, '..', 'test-data', 'petstore-minimal.yaml');
const emptyPath =
  path.join(__dirname, '..', 'test-data', 'empty.txt');

function neverCalled() {
  throw new Error('should not be called');
}

function waitForever() {
  return new Promise(() => {});
}

describe('swaggerSpecValidator', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  before(() => {
    nock.disableNetConnect();
  });
  after(() => {
    nock.enableNetConnect();
    nock.restore();
  });

  describe('.validate', () => {
    it('POSTs to DEFAULT_URL by default', () => {
      const testBody = 'swagger';
      const response = {};
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath, testBody)
        .reply(200, response);
      return swaggerSpecValidator.validate(testBody)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('POSTs to string in options.url', () => {
      const testProtoHost = 'http://example.com';
      const testPath = '/foo/bar?baz=quux';
      const response = {};
      const ne = nock(testProtoHost)
        .post(testPath)
        .reply(200, response);
      const options = { url: testProtoHost + testPath };
      return swaggerSpecValidator.validate('swagger', options)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('POSTs to URL in options.url', () => {
      const testProtoHost = 'http://example.com';
      const testPath = '/foo/bar?baz=quux';
      const response = {};
      const ne = nock(testProtoHost)
        .post(testPath)
        .reply(200, response);
      const options = { url: new URL(testProtoHost + testPath) };
      return swaggerSpecValidator.validate('swagger', options)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('POSTs to url.parse in options.url', () => {
      const testProtoHost = 'http://example.com';
      const testPath = '/foo/bar?baz=quux';
      const response = {};
      const ne = nock(testProtoHost)
        .post(testPath)
        .reply(200, response);
      // eslint-disable-next-line node/no-deprecated-api
      const options = { url: url.parse(testProtoHost + testPath) };
      return swaggerSpecValidator.validate('swagger', options)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('POSTs to url.parse in request options', () => {
      const testProtoHost = 'http://example.com';
      const testPath = '/foo/bar?baz=quux';
      const response = {};
      const ne = nock(testProtoHost)
        .post(testPath)
        .reply(200, response);
      // eslint-disable-next-line node/no-deprecated-api
      const options = { request: url.parse(testProtoHost + testPath) };
      return swaggerSpecValidator.validate('swagger', options)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    // Note: options overrides url, as in http.request(url, options)
    it('path in request options overrides path in options.url', () => {
      const testProtoHost = 'http://example.com';
      const testPath1 = '/foo/bar?baz=quux';
      const testPath2 = '/foo2/bar2?baz2=quux2';
      const response = {};
      const ne = nock(testProtoHost)
        .post(testPath2)
        .reply(200, response);
      const options = {
        request: { path: testPath2 },
        url: testProtoHost + testPath1,
      };
      return swaggerSpecValidator.validate('swagger', options)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('POSTs to URL path in request options with default host', () => {
      const testPath = '/foo/bar?baz=quux';
      const response = {};
      const ne = nock(defaultProtoHost)
        .post(testPath)
        .reply(200, response);
      const options = { request: { path: testPath } };
      return swaggerSpecValidator.validate('swagger', options)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('POSTs to http://online.swagger.io in request options', () => {
      const testProtoHost = 'http://online.swagger.io';
      const testPath = '/validator/debug';
      const response = {};
      const ne = nock(testProtoHost)
        .post(testPath)
        .reply(function(uri, requestBody) {
          // FIXME: This test doesn't work because this.req is
          // OverriddenClientRequest which doesn't have a copy of agent.
          // Currently also tested in integration.js as a workaround.
          assert.notStrictEqual(
            this.req.agent,
            /* eslint-disable no-underscore-dangle */
            swaggerSpecValidator._getSwaggerIoHttpsAgent(),
          );
          return [200, response];
        });
      // eslint-disable-next-line node/no-deprecated-api
      const options = { request: url.parse(testProtoHost + testPath) };
      return swaggerSpecValidator.validate('swagger', options)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('sends Accept: application/json by default', () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Accept', 'application/json')
        .post(defaultUrlPath)
        .reply(200, response);
      return swaggerSpecValidator.validate('swagger')
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('sends User-Agent with package version by default', () => {
      const uaRE = new RegExp(
        `^${regexpEscape(`${packageJson.name}/${packageJson.version}`)}`,
      );
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('User-Agent', uaRE)
        .post(defaultUrlPath)
        .reply(200, response);
      return swaggerSpecValidator.validate('swagger')
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('can override default headers', () => {
      const uaRE = new RegExp(
        `^${regexpEscape(`${packageJson.name}/${packageJson.version}`)}`,
      );
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Accept', 'text/plain')
        .matchHeader('User-Agent', uaRE)
        .post(defaultUrlPath)
        .reply(200, response);
      const options = { request: { headers: { Accept: 'text/plain' } } };
      return swaggerSpecValidator.validate('swagger', options)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('can override default headers case-insensitively', () => {
      const uaRE = new RegExp(
        `^${regexpEscape(`${packageJson.name}/${packageJson.version}`)}`,
      );
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Accept', 'text/plain')
        .matchHeader('User-Agent', uaRE)
        .post(defaultUrlPath)
        .reply(200, response);
      const options = { request: { headers: { accept: 'text/plain' } } };
      return swaggerSpecValidator.validate('swagger', options)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('returns Error loading custom Agent for online.swagger.io', () => {
      const testStatusCode = 200;
      const testResponse = {};
      const ne = nock(onlineSwaggerIoProtoHost)
        .post(onlineSwaggerIoUrlPath)
        .optionally()
        .reply(testStatusCode, testResponse);

      const errTest = new Error('test error');
      function getTestError() {
        return Promise.reject(errTest);
      }
      /* eslint-disable no-underscore-dangle */
      const getSwaggerIoHttpsAgent =
        swaggerSpecValidator._getSwaggerIoHttpsAgent;
      let result;
      try {
        swaggerSpecValidator._getSwaggerIoHttpsAgent = getTestError;
        result = swaggerSpecValidator
          .validate('swagger', { url: onlineSwaggerIoUrl })
          .then(
            neverCalled,
            (err) => {
              assert.strictEqual(err, errTest);
              ne.done();
            },
          );
      } finally {
        swaggerSpecValidator._getSwaggerIoHttpsAgent = getSwaggerIoHttpsAgent;
      }
      /* eslint-enable no-underscore-dangle */
      return result;
    });

    it('returns Error for invalid JSON body', () => {
      const testStatusCode = 200;
      const testResponse = '{"bad": "json"';
      const testType = 'application/json';
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath)
        .reply(testStatusCode, testResponse, { 'Content-Type': testType });
      return swaggerSpecValidator.validate('swagger')
        .then(
          neverCalled,
          (err) => {
            assert.strictEqual(err.statusCode, testStatusCode);
            assert.strictEqual(err.headers['content-type'], testType);
            assert.strictEqual(String(err.body), testResponse);
            ne.done();
          },
        );
    });

    it('returns Error with JSON body for 4XX/5XX response', () => {
      const response = { message: 'test' };
      const testStatusCode = 400;
      const testType = 'application/json';
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath)
        .reply(testStatusCode, response, { 'Content-Type': testType });
      return swaggerSpecValidator.validate('swagger')
        .then(
          neverCalled,
          (err) => {
            assert.strictEqual(err.statusCode, testStatusCode);
            assert.strictEqual(err.headers['content-type'], testType);
            assert.deepStrictEqual(err.body, response);
            ne.done();
          },
        );
    });

    it('returns Error with non-JSON body for 4XX/5XX response', () => {
      const response = 'test message';
      const testStatusCode = 500;
      const testType = 'text/plain';
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath)
        .reply(testStatusCode, response, { 'Content-Type': testType });
      return swaggerSpecValidator.validate('swagger')
        .then(
          neverCalled,
          (err) => {
            assert.strictEqual(err.statusCode, testStatusCode);
            assert.strictEqual(err.headers['content-type'], testType);
            assert.strictEqual(String(err.body), response);
            ne.done();
          },
        );
    });

    it('returns Error for unsupported protocol in request options', () => {
      // eslint-disable-next-line node/no-deprecated-api
      const options = { request: url.parse('ftp://example.com') };
      return swaggerSpecValidator.validateFile(swaggerJsonPath, options)
        .then(
          neverCalled,
          (err) => {
            assert.ok(/ftp/.test(err.message));
          },
        );
    });

    it('returns validator JSON with errors', () => {
      const testBody = 'swagger';
      const response = { messages: ['test1', 'test2'] };
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath, testBody)
        .reply(200, response);
      return swaggerSpecValidator.validate(testBody)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('can be called with callback without options', (done) => {
      const testBody = 'swagger';
      const testResponse = {};
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath, testBody)
        .reply(200, testResponse);
      swaggerSpecValidator.validate(testBody, (err, result) => {
        assert.ifError(err);
        assert.deepStrictEqual(result, testResponse);
        ne.done();
        done();
      });
    });

    it('throws for non-function callback', () => {
      const testBody = 'swagger';
      assert.throws(
        () => {
          swaggerSpecValidator.validate(testBody, {}, true);
        },
        TypeError,
        /\bcallback\b/,
      );
    });

    it('accepts spec as Buffer', () => {
      const testBody = 'swagger';
      const response = {};
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath, testBody)
        .reply(200, response);
      return swaggerSpecValidator.validate(Buffer.from(testBody))
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('accepts spec as Uint8Array', () => {
      const testBody = 'swagger';
      const response = {};
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath, testBody)
        .reply(200, response);
      return swaggerSpecValidator.validate(
        new Uint8Array(Buffer.from(testBody)),
      )
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('Error for non-string, non-Buffer, non-Readable spec',
      () => swaggerSpecValidator.validate(true)
        .then(
          neverCalled,
          (err) => {
            assert.ok(err instanceof TypeError);
            assert.ok(/\bspec\b/.test(err.message));
          },
        ));

    it('Error for non-object options', () => {
      const testBody = 'swagger';
      return swaggerSpecValidator.validate(testBody, true)
        .then(
          neverCalled,
          (err) => {
            assert.ok(err instanceof TypeError);
            assert.ok(/\boptions\b/.test(err.message));
          },
        );
    });

    it('Error for non-Writable options.err', () => {
      const testBody = 'swagger';
      const options = { err: new stream.Readable() };
      return swaggerSpecValidator.validate(testBody, options)
        .then(
          neverCalled,
          (err) => {
            assert.ok(err instanceof TypeError);
            assert.ok(/\boptions\.err\b/.test(err.message));
          },
        );
    });
  });

  describe('.validateFile', () => {
    it('POSTs to DEFAULT_URL by default', () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath)
        .reply(200, response);
      return swaggerSpecValidator.validateFile(swaggerJsonPath)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('adds Content-Type: application/json for .json files', () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/json')
        .post(defaultUrlPath)
        .reply(200, response);
      return swaggerSpecValidator.validateFile(swaggerJsonPath)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    // application/yaml is the only known supported YAML type on
    // validator.swagger.io and online.swagger.io
    // https://github.com/swagger-api/validator-badge/issues/136#issuecomment-545945678
    it('adds Content-Type: application/yaml .yaml files', () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/yaml')
        .post(defaultUrlPath)
        .reply(200, response);
      return swaggerSpecValidator.validateFile(swaggerYamlPath)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('adds Content-Type: application/json for non-.json JSON files', () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/json')
        .post(defaultUrlPath)
        .reply(200, response);
      return swaggerSpecValidator.validateFile(swaggerJsonPath.slice(0, -3))
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('adds Content-Type: application/yaml for non-.yaml YAML files', () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/yaml')
        .post(defaultUrlPath)
        .reply(200, response);
      return swaggerSpecValidator.validateFile(swaggerYamlPath.slice(0, -3))
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('adds Content-Type: application/yaml for non-JSON files', () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/yaml')
        .post(defaultUrlPath)
        .reply(200, response);
      return swaggerSpecValidator.validateFile(emptyPath)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('adds Content-Type: application/json for JSON content', () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/json')
        .post(defaultUrlPath)
        .reply(200, response);
      return swaggerSpecValidator.validate('{}')
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('adds Content-Type: application/yaml for non-JSON content', () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/yaml')
        .post(defaultUrlPath)
        .reply(200, response);
      return swaggerSpecValidator.validate('swagger: "2.0"')
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('adds Content-Type: application/json for JSON stream', () => {
      const spec = new stream.PassThrough();
      spec.end('{}');
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/json')
        .post(defaultUrlPath)
        .reply(200, response);
      return swaggerSpecValidator.validate(spec)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('adds Content-Type: application/yaml for non-JSON stream', () => {
      const spec = new stream.PassThrough();
      spec.end('swagger: "2.0"');
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/yaml')
        .post(defaultUrlPath)
        .reply(200, response);
      return swaggerSpecValidator.validate(spec)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('does not change caller-provided Content-Type', () => {
      const response = {};
      const testType = 'text/plain';
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', testType)
        .post(defaultUrlPath)
        .reply(200, response);
      const options = { request: { headers: { 'content-type': testType } } };
      return swaggerSpecValidator.validateFile(swaggerYamlPath, options)
        .then((result) => {
          assert.deepStrictEqual(result, response);
          ne.done();
        });
    });

    it('can be called with callback without options', (done) => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath)
        .reply(200, response);
      swaggerSpecValidator.validateFile(swaggerYamlPath, (err, result) => {
        assert.ifError(err);
        assert.deepStrictEqual(result, response);
        ne.done();
        done();
      });
    });

    it('returns Error for unreadable file', () => {
      const testStatusCode = 200;
      const testResponse = {};
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath)
        .optionally()
        .reply(testStatusCode, testResponse);
      return swaggerSpecValidator.validateFile('nonexistent.yaml')
        .then(
          neverCalled,
          (err) => {
            assert.strictEqual(err.code, 'ENOENT');
            ne.done();
          },
        );
    });

    // The error event can be emitted from a file stream before reading begins.
    // If this happens before a listener is attached, it will cause an unhandled
    // exception.  This test covers a case where that could occur.
    it('returns Error for unreadable file while loading Agent', () => {
      const testStatusCode = 200;
      const testResponse = {};
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath)
        .optionally()
        .reply(testStatusCode, testResponse);

      /* eslint-disable no-underscore-dangle */
      const getSwaggerIoHttpsAgent =
        swaggerSpecValidator._getSwaggerIoHttpsAgent;
      let result;
      try {
        swaggerSpecValidator._getSwaggerIoHttpsAgent = waitForever;
        result = swaggerSpecValidator.validateFile('nonexistent.yaml')
          .then(
            neverCalled,
            (err) => {
              assert.strictEqual(err.code, 'ENOENT');
              ne.done();
            },
          );
      } finally {
        swaggerSpecValidator._getSwaggerIoHttpsAgent = getSwaggerIoHttpsAgent;
      }
      /* eslint-enable no-underscore-dangle */
      return result;
    });

    it('returns one Error for unreadable file and Agent', (done) => {
      const testStatusCode = 200;
      const testResponse = {};
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath)
        .optionally()
        .reply(testStatusCode, testResponse);

      const errTest = new Error('test error');
      function getTestError() {
        return Promise.reject(errTest);
      }
      /* eslint-disable no-underscore-dangle */
      const getSwaggerIoHttpsAgent =
        swaggerSpecValidator._getSwaggerIoHttpsAgent;
      try {
        swaggerSpecValidator._getSwaggerIoHttpsAgent = getTestError;
        swaggerSpecValidator.validateFile('nonexistent.yaml', (err) => {
          assert(err === errTest || err.code === 'ENOENT');
          ne.done();
          done();
        });
      } finally {
        swaggerSpecValidator._getSwaggerIoHttpsAgent = getSwaggerIoHttpsAgent;
      }
      /* eslint-enable no-underscore-dangle */
    });
  });
});
