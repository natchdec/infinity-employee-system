import { blockingReadiness, productionReadiness } from '../src/server/integrations/preflight';

const gates = productionReadiness();
const ready = blockingReadiness(gates);
const deferred = gates.filter((gate) => !gate.blocking).map((gate) => gate.id);

console.log(JSON.stringify({ event: 'production_preflight', ready, deferred, gates }, null, 2));
if (!ready) process.exitCode = 1;
