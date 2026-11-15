import { MongoClient } from 'npm:mongodb@7.8.0';
import { createHandler } from './controller.mjs';
import { readConfig, createVerifyUser, createLazyMongo } from './runtime.mjs';
import { createSqlAdapter } from './sql.mjs';
import { createMongoAdapter } from './mongo.mjs';

export { createHandler } from './controller.mjs';
const config = readConfig((name: string) => Deno.env.get(name));
const getMongo = createLazyMongo({ MongoClient, uri: config.mongoUri, database: config.mongoDatabase });
const handler = createHandler({
  verifyUser: createVerifyUser(config),
  sql: createSqlAdapter(config),
  mongo: createMongoAdapter({ getMongo }),
  allowedOrigins: config.allowedOrigins,
});
Deno.serve(handler);
