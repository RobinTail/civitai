import { getJobDate } from '~/server/jobs/job';
import { dbWrite, dbRead } from '~/server/db/client';
import { Prisma, PrismaClient, SearchIndexUpdateQueueAction } from '@prisma/client';
import { swapIndex } from '~/server/meilisearch/util';
import { chunk } from 'lodash-es';

const DEFAULT_UPDATE_INTERVAL = 60 * 1000;

export function createSearchIndexUpdateProcessor({
  indexName,
  swapIndexName,
  onIndexUpdate,
  onIndexSetup,
  updateInterval = DEFAULT_UPDATE_INTERVAL,
}: {
  indexName: string;
  swapIndexName: string;
  onIndexUpdate: SearchIndexProcessorContext;
  onIndexSetup: SearchIndexSetupProcessorContext;
  updateInterval?: number;
}) {
  return {
    indexName,
    async update() {
      const [lastUpdatedAt, setLastUpdate] = await getJobDate(
        `searchIndex:${indexName.toLowerCase()}`
      );
      const ctx = { db: dbRead, lastUpdatedAt, indexName };
      // Check if update is needed
      const shouldUpdate = lastUpdatedAt.getTime() + updateInterval < Date.now();

      if (!shouldUpdate) {
        console.log(
          'createSearchIndexUpdateProcessor :: update :: Job does not require updating yet.'
        );
        return;
      }

      // Run update
      const now = new Date();
      await onIndexUpdate(ctx);
      await setLastUpdate();

      // Clear update queue
      await dbWrite.searchIndexUpdateQueue.deleteMany({
        where: { type: indexName, createdAt: { lt: now } },
      });
    },
    /**
     * Resets an entire index by using its swap counterpart.
     * The goal here is to ensure we keep the  existing search index during the
     * reset process.
     */
    async reset() {
      // First, setup and init both indexes - Swap requires both indexes to be created:
      await onIndexSetup({ indexName });
      await onIndexSetup({ indexName: swapIndexName });

      // Now, fill in the "swap" with new content:
      await onIndexUpdate({ db: dbWrite, indexName: swapIndexName });

      // Finally, perform the swap:
      await swapIndex({ indexName, swapIndexName });

      // Clear update queue since our index should be brand new:
      await dbWrite.searchIndexUpdateQueue.deleteMany({
        where: { type: indexName, createdAt: { lt: new Date() } },
      });
    },
    async queueUpdate(items: Array<{ id: number; action?: SearchIndexUpdateQueueAction }>) {
      if (!items.length) {
        return;
      }

      console.log(
        `createSearchIndexUpdateProcessor :: ${indexName} :: queueUpdate :: Called with ${items.length} items`
      );

      const batches = chunk(items, 500);
      for (const batch of batches) {
        await dbWrite.$executeRawUnsafe(`
          INSERT INTO "SearchIndexUpdateQueue" ("type", "id", "action")
          VALUES ${batch
            .map(
              ({ id, action }) =>
                `('${indexName}', ${id}, '${action ?? SearchIndexUpdateQueueAction.Update}')`
            )
            .join(', ')}
          ON CONFLICT ("type", "id", "action") DO NOTHING;
      `);
      }
    },
  };
}
export type SearchIndexRunContext = {
  db: PrismaClient;
  lastUpdatedAt?: Date;
  indexName: string;
};

export type SearchIndexSetupContext = {
  indexName: string;
};

type SearchIndexProcessorContext = (context: SearchIndexRunContext) => Promise<void>;
type SearchIndexSetupProcessorContext = (context: SearchIndexSetupContext) => Promise<void>;
