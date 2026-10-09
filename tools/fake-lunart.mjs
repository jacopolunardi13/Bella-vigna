#!/usr/bin/env node
/**
 * LunArt's Staff API as production answers it today, for local runs of the
 * console only: invented data, the same shapes, no house named in the answers.
 *
 *   PORT=4174 LUNART_TOKEN=… node tools/fake-lunart.mjs
 *
 * Never deployed. The staging console talks to a real LunArt staging service
 * (its own PR branch, in preview mode) instead.
 */
import { fakeLunart } from '../test/support/console.mjs';

const { server } = fakeLunart({ token: process.env.LUNART_TOKEN });
server.listen(Number(process.env.PORT ?? 4174), () => console.log(`  fake LunArt Staff API on :${server.address().port}`));
