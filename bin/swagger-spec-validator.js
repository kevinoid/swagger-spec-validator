#!/usr/bin/env node
/**
 * @copyright Copyright 2021 Kevin Locke <kevin@kevinlocke.name>
 * @license MIT
 */

'use strict';

const main = require('../cli.js');

const mainOptions = {
  in: process.stdin,
  out: process.stdout,
  err: process.stderr,
};
main(process.argv, mainOptions, (err, exitCode) => {
  if (err) {
    if (err.stdout) { process.stdout.write(err.stdout); }
    if (err.stderr) { process.stderr.write(err.stderr); }
    process.stderr.write(`${err.name}: ${err.message}\n`);

    exitCode = typeof err.exitCode === 'number' ? err.exitCode : 1;
  }

  // eslint-disable-next-line no-process-exit
  process.exit(exitCode);
});
