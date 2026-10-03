import { closeDb } from '../src/server/db';
import { syncProjectMaster } from '../src/server/integrations/project-master';

try {
  const result = await syncProjectMaster();
  console.log(JSON.stringify({ event: 'project_master_sync_complete', ...result }));
} finally {
  await closeDb();
}
