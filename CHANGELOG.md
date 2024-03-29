# [5.0.0](https://github.com/kevinoid/swagger-spec-validator/compare/v4.0.1...v5.0.0) (2022-11-17)

### BREAKING CHANGES

* Drop support for Node.js 15 and 14.17 and below.
* The `?` CLI option was dropped in favor of `-h` or `--help`.
* Only `index.js`, `cli.js`, and `package.json` are exported from this package.
* `require('swagger-spec-validator/bin/swagger-spec-validator.js')` has been
  renamed to `require('swagger-spec-validator/cli.js')`.
* The `in`, `out`, and `err` properties of the `options` argument of
  `swagger-spec-validator/cli.js` are now `stdin`, `stdout`, and `stderr` to
  match `process` for easier calling.
- Default values for the `args` and `options` arguments of
  `swagger-spec-validator/cli.js` are no longer provided, due to lack of
  compelling use-case, to avoid ambiguity, and to reduce code.
- `swagger-spec-validator/cli.js` no longer accepts a callback argument.  It
  returns a `Promise` with exit code.

### Features

* Use `commander` instead of `yargs` for command-line parsing
  ([2a7c9c8](https://github.com/kevinoid/swagger-spec-validator/commit/2a7c9c867cdcc4e0316729d3a01793a58247a683))
* Switch from `nyc` to `c8` for native V8 coverage collection
  ([d72a313](https://github.com/kevinoid/swagger-spec-validator/commit/d72a3136254166eda40fb56c550283758c25ac1f))
* Set `process.exitCode` instead of calling `process.exit()` in `cli.js`
  ([247de91](https://github.com/kevinoid/swagger-spec-validator/commit/247de91e0e033f531ec604e6e7953b47dd7a10ad))


## [v4.0.1](https://github.com/kevinoid/swagger-spec-validator/tree/v4.0.1) (2019-11-16)
[Full Changelog](https://github.com/kevinoid/swagger-spec-validator/compare/v4.0.0...v4.0.1)

- Update `yargs` to `^15.0.1`.

## [v4.0.0](https://github.com/kevinoid/swagger-spec-validator/tree/v4.0.0) (2019-11-03)
[Full Changelog](https://github.com/kevinoid/swagger-spec-validator/compare/v3.0.1...v4.0.0)

- **BREAKING** Drop support for Node &lt; 8.3.
- Default to https://validator.swagger.io instead of https://online.swagger.io
  which is newer and described in the swagger-api/validator-badge README and
  **supports OpenAPI Specification v3**.
- The `Content-Type` header is now sent on every request (since it is now
  required by `validator.swagger.io` and `online.swagger.io`).  It is
  determined from caller (or command-line) options, or file extension, or file
  content (which requires buffering the document before sending), in that order.
- Specification data may now be passed as `Uint8Array` in addition to
  `string`, `Buffer`, and `stream.Readable` types.
- New `url` option which allows specifying the validator URL separately from
  any request options and (optionally) as a `URL` object.
- Remove HTTPS workarounds for https://online.swagger.io which are no longer
  necessary (see swagger-api/validator-badge#98).
- Replace `pify` dependency with `util.promisify`.
- Dependency version updates.

## [v3.0.1](https://github.com/kevinoid/swagger-spec-validator/tree/v3.0.1) (2019-01-24)
[Full Changelog](https://github.com/kevinoid/swagger-spec-validator/compare/v3.0.0...v3.0.1)

- Fix support for http://online.swagger.io (without HTTPS), when requested by
  callers.
- Developmental dependency version updates.

## [v3.0.0](https://github.com/kevinoid/swagger-spec-validator/tree/v3.0.0) (2018-06-29)
[Full Changelog](https://github.com/kevinoid/swagger-spec-validator/compare/v2.0.0...v3.0.0)

- **BREAKING** Drop support for Node < 6.
- Dependency version updates.
- Drop unnecessary dependencies.
- Code style improvements.

## [v2.0.0](https://github.com/kevinoid/swagger-spec-validator/tree/v2.0.0) (2018-04-19)
[Full Changelog](https://github.com/kevinoid/swagger-spec-validator/compare/v1.0.1...v2.0.0)

- **Major:** Drop support for Node v0.12.  Require Node v4 or later.
- Replace DigiCert intermediate+root certificates with GoDaddy, which is now
  the CA for https://online.swagger.io/
  ([\#38](https://github.com/kevinoid/swagger-spec-validator/issues/38))
- Update dependency versions.  Drop unnecessary dependencies.

## [v1.0.1](https://github.com/kevinoid/swagger-spec-validator/tree/v1.0.1) (2017-05-07)
[Full Changelog](https://github.com/kevinoid/swagger-spec-validator/compare/v1.0.0...v1.0.1)

- Include DigiCert Global Root CA in package to fix SSL validation on Debian.

## [v1.0.0](https://github.com/kevinoid/swagger-spec-validator/tree/v1.0.0) (2017-03-16)
[Full Changelog](https://github.com/kevinoid/swagger-spec-validator/compare/v0.1.2...v1.0.0)

- **No API Changes** Change to v1.0.0 is only a declaration of stability.
- Dev dependency version updates.

## [v0.1.2](https://github.com/kevinoid/swagger-spec-validator/tree/v0.1.2) (2017-03-03)
[Full Changelog](https://github.com/kevinoid/swagger-spec-validator/compare/v0.1.2...v0.1.2)

## [v0.1.2](https://github.com/kevinoid/swagger-spec-validator/tree/v0.1.2) (2017-03-03)
[Full Changelog](https://github.com/kevinoid/swagger-spec-validator/compare/v0.1.1...v0.1.2)

**Merged pull requests:**

- Update dependencies to enable Greenkeeper 🌴 [\#1](https://github.com/kevinoid/swagger-spec-validator/pull/1) ([greenkeeper[bot]](https://github.com/integration/greenkeeper))

## [v0.1.1](https://github.com/kevinoid/swagger-spec-validator/tree/v0.1.1) (2017-01-13)
[Full Changelog](https://github.com/kevinoid/swagger-spec-validator/compare/v0.1.0...v0.1.1)

## [v0.1.0](https://github.com/kevinoid/swagger-spec-validator/tree/v0.1.0) (2017-01-13)


\* *This Change Log was automatically generated by [github_changelog_generator](https://github.com/skywinder/Github-Changelog-Generator)*
