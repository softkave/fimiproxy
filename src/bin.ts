#!/usr/bin/env node

import {startFimiproxyUsingProcessArgs} from './proxy/startFimiproxy.js';

startFimiproxyUsingProcessArgs().catch(console.error.bind(console));
