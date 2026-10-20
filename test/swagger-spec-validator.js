/**
 * @copyright Copyright 2017-2019 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const assert = require('node:assert');
const path = require('node:path');
const stream = require('node:stream');
const url = require('node:url');

const { default: nock } = require('nock');
const regexpEscape = require('regexp.escape');

// https://github.com/import-js/eslint-plugin-import/issues/2844
// eslint-disable-next-line import-x/extensions
const swaggerSpecValidator = require('..');
const packageJson = require('../package.json');

const defaultUrl = new URL(swaggerSpecValidator.DEFAULT_URL);
const defaultProtoHost = `${defaultUrl.protocol}//${defaultUrl.host}`;
const defaultUrlPath = defaultUrl.pathname + defaultUrl.search;

const swaggerJsonPath =
  path.join(__dirname, '..', 'test-data', 'petstore-minimal.json');
const swaggerYamlPath =
  path.join(__dirname, '..', 'test-data', 'petstore-minimal.yaml');
const emptyPath =
  path.join(__dirname, '..', 'test-data', 'empty.txt');

/** Runs a function with DeprecationWarnings suppressed.
 *
 * @private
 * @param {!function(*): *} func Function to run.
 * @param {Array} args Arguments to pass to {@link func}.
 * @returns {*} Return value of {@link func}.
 */
function withoutDeprecationWarning(func, ...args) {
  // TODO: Could suppress more selectively by overriding process.emit as in
  // https://github.com/yarnpkg/berry/blob/031b5da1dc8e459e844efda137b2f00d7cdc9dda/packages/yarnpkg-pnp/sources/loader/applyPatch.ts#L304-L325

  if (process.noDeprecation) {
    // Fast path.  No additional suppression required.
    return func(...args);
  }

  // Slow path.  Must change, then restore noDeprecation.
  //
  // Note: noDeprecation is currently (Node.js 25) a read-only property which
  // is only defined when the --no-deprecation option is passed to node.  This
  // code is intended to be future-proof against unconditional definition.
  const noDeprecationProp =
    Object.getOwnPropertyDescriptor(process, 'noDeprecation');
  try {
    Object.defineProperty(process, 'noDeprecation', {
      value: true,
      configurable: true, // so it can be restored
      enumerable: noDeprecationProp?.enumerable,
    });

    return func(...args);
  } finally {
    if (noDeprecationProp) {
      Object.defineProperty(process, 'noDeprecation', noDeprecationProp);
    } else {
      delete process.noDeprecation;
    }
  }
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
    it('POSTs to DEFAULT_URL by default', async () => {
      const testBody = 'swagger';
      const response = {};
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath, testBody)
        .reply(200, response);
      const result = await swaggerSpecValidator.validate(testBody);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('POSTs to string in options.url', async () => {
      const testProtoHost = 'https://example.com';
      const testPath = '/foo/bar?baz=quux';
      const response = {};
      const ne = nock(testProtoHost)
        .post(testPath)
        .reply(200, response);
      const options = { url: testProtoHost + testPath };
      const result = await swaggerSpecValidator.validate('swagger', options);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('POSTs to URL in options.url', async () => {
      const testProtoHost = 'https://example.com';
      const testPath = '/foo/bar?baz=quux';
      const response = {};
      const ne = nock(testProtoHost)
        .post(testPath)
        .reply(200, response);
      const options = { url: new URL(testProtoHost + testPath) };
      const result = await swaggerSpecValidator.validate('swagger', options);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('POSTs to url.parse in options.url', async () => {
      const testProtoHost = 'https://example.com';
      const testPath = '/foo/bar?baz=quux';
      const response = {};
      const ne = nock(testProtoHost)
        .post(testPath)
        .reply(200, response);
      const options = {
        // eslint-disable-next-line n/no-deprecated-api
        url: withoutDeprecationWarning(url.parse, testProtoHost + testPath),
      };
      const result = await swaggerSpecValidator.validate('swagger', options);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('POSTs to url.parse in request options', async () => {
      const testProtoHost = 'https://example.com';
      const testPath = '/foo/bar?baz=quux';
      const response = {};
      const ne = nock(testProtoHost)
        .post(testPath)
        .reply(200, response);
      // eslint-disable-next-line n/no-deprecated-api
      const options = { request: url.parse(testProtoHost + testPath) };
      const result = await swaggerSpecValidator.validate('swagger', options);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    // Note: options overrides url, as in http.request(url, options)
    it('path in request options overrides path in options.url', async () => {
      const testProtoHost = 'https://example.com';
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
      const result = await swaggerSpecValidator.validate('swagger', options);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('POSTs to URL path in request options with default host', async () => {
      const testPath = '/foo/bar?baz=quux';
      const response = {};
      const ne = nock(defaultProtoHost)
        .post(testPath)
        .reply(200, response);
      const options = { request: { path: testPath } };
      const result = await swaggerSpecValidator.validate('swagger', options);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('sends Accept: application/json by default', async () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Accept', 'application/json')
        .post(defaultUrlPath)
        .reply(200, response);
      const result = await swaggerSpecValidator.validate('swagger');
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('sends User-Agent with package version by default', async () => {
      const uaRE = new RegExp(
        `^${regexpEscape(`${packageJson.name}/${packageJson.version}`)}`,
      );
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('User-Agent', uaRE)
        .post(defaultUrlPath)
        .reply(200, response);
      const result = await swaggerSpecValidator.validate('swagger');
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('can override default headers', async () => {
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
      const result = await swaggerSpecValidator.validate('swagger', options);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('can override default headers case-insensitively', async () => {
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
      const result = await swaggerSpecValidator.validate('swagger', options);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('returns Error for invalid JSON body', async () => {
      const testStatusCode = 200;
      const testResponse = '{"bad": "json"';
      const testType = 'application/json';
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath)
        .reply(testStatusCode, testResponse, { 'Content-Type': testType });
      await assert.rejects(
        swaggerSpecValidator.validate('swagger'),
        (err) => {
          assert.strictEqual(err.statusCode, testStatusCode);
          assert.strictEqual(err.headers['content-type'], testType);
          assert.strictEqual(String(err.body), testResponse);
          ne.done();
          return true;
        },
      );
    });

    it('returns Error with JSON body for 4XX/5XX response', async () => {
      const response = { message: 'test' };
      const testStatusCode = 400;
      const testType = 'application/json';
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath)
        .reply(testStatusCode, response, { 'Content-Type': testType });
      await assert.rejects(
        swaggerSpecValidator.validate('swagger'),
        (err) => {
          assert.strictEqual(err.statusCode, testStatusCode);
          assert.strictEqual(err.headers['content-type'], testType);
          assert.deepStrictEqual(err.body, response);
          ne.done();
          return true;
        },
      );
    });

    it('returns Error with non-JSON body for 4XX/5XX response', async () => {
      const response = 'test message';
      const testStatusCode = 500;
      const testType = 'text/plain';
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath)
        .reply(testStatusCode, response, { 'Content-Type': testType });
      await assert.rejects(
        swaggerSpecValidator.validate('swagger'),
        (err) => {
          assert.strictEqual(err.statusCode, testStatusCode);
          assert.strictEqual(err.headers['content-type'], testType);
          assert.strictEqual(String(err.body), response);
          ne.done();
          return true;
        },
      );
    });

    it('returns Error for unsupported protocol in options', async () => {
      // eslint-disable-next-line n/no-deprecated-api
      const options = { request: url.parse('ftp://example.com') };
      await assert.rejects(
        swaggerSpecValidator.validateFile(swaggerJsonPath, options),
        (err) => {
          assert.ok(/ftp/.test(err.message));
          return true;
        },
      );
    });

    it('returns validator JSON with errors', async () => {
      const testBody = 'swagger';
      const response = { messages: ['test1', 'test2'] };
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath, testBody)
        .reply(200, response);
      const result = await swaggerSpecValidator.validate(testBody);
      assert.deepStrictEqual(result, response);
      ne.done();
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

    it('accepts spec as Buffer', async () => {
      const testBody = 'swagger';
      const response = {};
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath, testBody)
        .reply(200, response);
      const result = await swaggerSpecValidator.validate(Buffer.from(testBody));
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('accepts spec as Uint8Array', async () => {
      const testBody = 'swagger';
      const response = {};
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath, testBody)
        .reply(200, response);
      const result = await swaggerSpecValidator.validate(
        new Uint8Array(Buffer.from(testBody)),
      );
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('Error for non-string, non-Buffer, non-Readable spec', async () => {
      await assert.rejects(
        swaggerSpecValidator.validate(true),
        (err) => {
          assert.ok(err instanceof TypeError);
          assert.ok(/\bspec\b/.test(err.message));
          return true;
        },
      );
    });

    it('Error for non-object options', async () => {
      const testBody = 'swagger';
      await assert.rejects(
        swaggerSpecValidator.validate(testBody, true),
        (err) => {
          assert.ok(err instanceof TypeError);
          assert.ok(/\boptions\b/.test(err.message));
          return true;
        },
      );
    });

    it('Error for non-Writable options.err', async () => {
      const testBody = 'swagger';
      const options = { err: new stream.Readable() };
      await assert.rejects(
        swaggerSpecValidator.validate(testBody, options),
        (err) => {
          assert.ok(err instanceof TypeError);
          assert.ok(/\boptions\.err\b/.test(err.message));
          return true;
        },
      );
    });
  });

  describe('.validateFile', () => {
    it('POSTs to DEFAULT_URL by default', async () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath)
        .reply(200, response);
      const result = await swaggerSpecValidator.validateFile(swaggerJsonPath);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('adds Content-Type: application/json for .json files', async () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/json')
        .post(defaultUrlPath)
        .reply(200, response);
      const result = await swaggerSpecValidator.validateFile(swaggerJsonPath);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    // application/yaml is the only known supported YAML type on
    // validator.swagger.io
    // https://github.com/swagger-api/validator-badge/issues/136#issuecomment-545945678
    it('adds Content-Type: application/yaml .yaml files', async () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/yaml')
        .post(defaultUrlPath)
        .reply(200, response);
      const result = await swaggerSpecValidator.validateFile(swaggerYamlPath);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('adds JSON Content-Type: for non-.json JSON files', async () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/json')
        .post(defaultUrlPath)
        .reply(200, response);
      const result =
        await swaggerSpecValidator.validateFile(swaggerJsonPath.slice(0, -3));
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('adds YAML Content-Type for non-.yaml YAML files', async () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/yaml')
        .post(defaultUrlPath)
        .reply(200, response);
      const result =
        await swaggerSpecValidator.validateFile(swaggerYamlPath.slice(0, -3));
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('adds Content-Type: application/yaml for non-JSON files', async () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/yaml')
        .post(defaultUrlPath)
        .reply(200, response);
      const result = await swaggerSpecValidator.validateFile(emptyPath);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('adds Content-Type: application/json for JSON content', async () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/json')
        .post(defaultUrlPath)
        .reply(200, response);
      const result = await swaggerSpecValidator.validate('{}');
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('adds Content-Type: application/yaml for non-JSON content', async () => {
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/yaml')
        .post(defaultUrlPath)
        .reply(200, response);
      const result = await swaggerSpecValidator.validate('swagger: "2.0"');
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('adds Content-Type: application/json for JSON stream', async () => {
      const spec = new stream.PassThrough();
      spec.end('{}');
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/json')
        .post(defaultUrlPath)
        .reply(200, response);
      const result = await swaggerSpecValidator.validate(spec);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('adds Content-Type: application/yaml for non-JSON stream', async () => {
      const spec = new stream.PassThrough();
      spec.end('swagger: "2.0"');
      const response = {};
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', 'application/yaml')
        .post(defaultUrlPath)
        .reply(200, response);
      const result = await swaggerSpecValidator.validate(spec);
      assert.deepStrictEqual(result, response);
      ne.done();
    });

    it('does not change caller-provided Content-Type', async () => {
      const response = {};
      const testType = 'text/plain';
      const ne = nock(defaultProtoHost)
        .matchHeader('Content-Type', testType)
        .post(defaultUrlPath)
        .reply(200, response);
      const options = { request: { headers: { 'content-type': testType } } };
      const result =
        await swaggerSpecValidator.validateFile(swaggerYamlPath, options);
      assert.deepStrictEqual(result, response);
      ne.done();
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

    it('returns Error for unreadable file', async () => {
      const testStatusCode = 200;
      const testResponse = {};
      const ne = nock(defaultProtoHost)
        .post(defaultUrlPath)
        .optionally()
        .reply(testStatusCode, testResponse);
      await assert.rejects(
        swaggerSpecValidator.validateFile('nonexistent.yaml'),
        (err) => {
          assert.strictEqual(err.code, 'ENOENT');
          ne.done();
          return true;
        },
      );
    });
  });
});
