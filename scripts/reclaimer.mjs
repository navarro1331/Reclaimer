#!/usr/bin/env node
import {cli} from '../lib/cli.mjs';
await cli(process.argv.slice(2),{applicationName:'reclaimer'});
