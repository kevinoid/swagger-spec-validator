#!/usr/bin/env node
/**
 * @copyright Copyright 2021 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const main = require('../cli.js');

// eslint-disable-next-line promise/catch-or-return
main(process.argv, process).then(process.exit);
