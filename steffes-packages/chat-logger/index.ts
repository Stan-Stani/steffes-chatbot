import { ContainerResponse, CosmosClient } from '@azure/cosmos';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

export class ChatLogger {
  containerResponsePromise: Promise<ContainerResponse>;
  constructor() {
    const deferred = createDeferred<ContainerResponse>();
    this.containerResponsePromise = deferred.promise;
    (async () => {
      const endpoint = process.env['COSMOS_ENDPOINT'];
      const key = process.env['COSMOS_KEY'];

      if (!endpoint || !key) {
        deferred.reject(new Error('Missing COSMOS_ENDPOINT or COSMOS_KEY'));
        return;
      }

      const databaseId = process.env['COSMOS_DATABASE_ID'] || 'dev-2025-04-29';
      const containerId = process.env['COSMOS_CONTAINER_ID'] || 'Chatbot';

      try {
        const client = new CosmosClient({ endpoint, key });

        const { database } = await client.databases.createIfNotExists({
          id: databaseId,
        });

        database.containers
          .createIfNotExists({
            id: containerId,
            // Match existing behavior (items are created without an explicit partition key field).
            // Using /id allows any item with an `id` to be written without extra schema constraints.
            partitionKey: {
              paths: ['/id'],
            },
          })
          .then((containerResponse) => {
            deferred.resolve(containerResponse);
          })
          .catch((error) => {
            deferred.reject(error);
          });
      } catch (error) {
        console.error(error);
      }
    })();
  }
}
