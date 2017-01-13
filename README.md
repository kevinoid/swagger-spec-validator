OpenAPI/Swagger Specification Validator
=======================================

[![Build Status: Linux](https://img.shields.io/travis/kevinoid/swagger-spec-validator.svg?style=flat&label=build+on+linux)](https://travis-ci.org/kevinoid/swagger-spec-validator)
[![Build Status: Windows](https://img.shields.io/appveyor/ci/kevinoid/swagger-spec-validator.svg?style=flat&label=build+on+windows)](https://ci.appveyor.com/project/kevinoid/swagger-spec-validator)
[![Coverage](https://img.shields.io/codecov/c/github/kevinoid/swagger-spec-validator.svg?style=flat)](https://codecov.io/github/kevinoid/swagger-spec-validator?branch=master)
[![Dependency Status](https://img.shields.io/david/kevinoid/swagger-spec-validator.svg?style=flat)](https://david-dm.org/kevinoid/swagger-spec-validator)
[![Supported Node Version](https://img.shields.io/node/v/swagger-spec-validator.svg?style=flat)](https://www.npmjs.com/package/swagger-spec-validator)
[![Version on NPM](https://img.shields.io/npm/v/swagger-spec-validator.svg?style=flat)](https://www.npmjs.com/package/swagger-spec-validator)

Validate an OpenAPI/Swagger API specification against the [OpenAPI
Specification](http://swagger.io/specification/) using the [swagger.io online
validator](https://github.com/swagger-api/validator-badge).

The validation performed by this module differs from the validation performed
by [swagger-cli](https://github.com/BigstickCarpet/swagger-cli).
`swagger-cli` uses
[swagger-parser](https://github.com/BigstickCarpet/swagger-parser) for
validation, which is a pure JavaScript implementation that can be used
offline.  This module relies on the validator hosted at swagger.io which uses
Java-based parser and validator implementations.  Therefore, it requires
Internet access to use and requires significantly less code to be installed as
a result.

## Introductory Example

To use `swagger-spec-validator` from the command line, simply invoke it with
the specification files to validate as arguments:

```sh
$ swagger-spec-validator swagger.yaml
```

If no arguments are given, the specification will be read from `stdin`.

`swagger-spec-validator` can be used as a library as follows:

```js
const swaggerSpecValidator = require('swagger-spec-validator');
swaggerSpecValidator.validateFile('swagger.yaml')
  .then((result) => {
    if (Object.keys(result).length > 0) {
      console.log('Invalid.');
    } else {
      console.log('Valid!');
    }
  })
  .catch(err => console.error('Unable to validate: ' + err));
```

## Installation

[This package](https://www.npmjs.com/package/swagger-spec-validator) can be
installed using [npm](https://www.npmjs.com/), either globally or locally, by
running:

```sh
npm install swagger-spec-validator
```

## Recipes

More examples can be found in the [test
specifications](https://kevinoid.github.io/swagger-spec-validator/specs).

## API Docs

To use this module as a library, see the [API
Documentation](https://kevinoid.github.io/swagger-spec-validator/api).

## Contributing

Contributions are welcome and very much appreciated!  Please add tests to
cover any changes and ensure `npm test` passes.

If the desired change is large, complex, backwards-incompatible, can have
significantly differing implementations, or may not be in scope for this
project, opening an issue before writing the code can avoid frustration and
save a lot of time and effort.

## License

This package is available under the terms of the
[MIT License](https://opensource.org/licenses/MIT).
