import { productionReadiness } from '../src/server/integrations/preflight';

const gates = productionReadiness();
const ready = gates.every((gate) => gate.ready);
console.log(JSON.stringify({ event: 'production_preflight', ready, gates }, null, 2));
if (!ready) process.exitCode = 1;
