import { createServer } from '@atproto/bsky/src/lexicon'
import { DidResolver, MemoryCache } from '@atproto/identity'
import events from 'events'
import express from 'express'
import http from 'http'

import { JetstreamFirehoseSubscription } from './jetstream/jetstream-firehose'
import describeGenerator from './methods/describe-generator'
import feedGeneration from './methods/feed-generation'
import crudRoutes from './routes/crud'
import miscRoutes from './routes/misc'
import wellKnown from './routes/well-known'
import { AppContext, Config } from './types/config'
import { createDb, Database, migrateToLatest } from './db'
import { FirehoseSubscription } from './subscription'

export class FeedGenerator {
	public app: express.Application
	public server?: http.Server
	public db: Database
	public firehose: FirehoseSubscription | null
	public jetstream: JetstreamFirehoseSubscription | null
	public cfg: Config

	constructor(
		app: express.Application,
		db: Database,
		firehose: FirehoseSubscription | null,
		jetstream: JetstreamFirehoseSubscription | null,
		cfg: Config
	) {
		this.app = app
		this.db = db
		this.firehose = firehose
		this.jetstream = jetstream
		this.cfg = cfg
	}

	static create(cfg: Config) {
		const app = express()
		const db = createDb(cfg.sqliteLocation)

		const firehose = process.env.DISABLE_FIREHOSE !== 'true' ? new FirehoseSubscription(db, cfg.subscriptionEndpoint) : null

		const jetstream =
			process.env.DISABLE_JETSTREAM !== 'true' ? new JetstreamFirehoseSubscription(process.env.JETSTREAM_URL, undefined, db) : null

		const didCache = new MemoryCache()
		const didResolver = new DidResolver({
			plcUrl: 'https://plc.directory',
			didCache,
		})

		const server = createServer({
			validateResponse: true,
			payload: {
				jsonLimit: 100 * 1024, // 100kb
				textLimit: 100 * 1024, // 100kb
				blobLimit: 5 * 1024 * 1024, // 5mb
			},
		})
		const ctx: AppContext = {
			db,
			didResolver,
			cfg,
		}
		// getFeedSkeleton
		feedGeneration(server, ctx)
		// describeFeedGenerator
		describeGenerator(server, ctx)
		//
		app.use(server.xrpc.router)
		app.use(wellKnown(ctx))
		app.use(miscRoutes(ctx))
		app.use(crudRoutes(ctx))

		return new FeedGenerator(app, db, firehose, jetstream, cfg)
	}

	async start(): Promise<http.Server> {
		await migrateToLatest(this.db)

		if (process.env.DISABLE_FIREHOSE !== 'true' && this.firehose) {
			console.log('🔥🔥 STARTING THE FIREHOSE 🔥🔥')
			this.firehose.run(this.cfg.subscriptionReconnectDelay)
		} else {
			console.log('\n🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫')
			console.log('🔥🔥 FIREHOSE DISABLED 🔥🔥')
			console.log('🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫')
		}

		if (process.env.DISABLE_JETSTREAM !== 'true' && this.jetstream) {
			console.log('🔥🔥 STARTING THE JETSTREAM 🔥🔥')
			this.jetstream.run(this.cfg.subscriptionReconnectDelay)
		} else {
			console.log('\n🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫')
			console.log('🔥🔥 JETSTREAM DISABLED 🔥🔥')
			console.log('🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫🚫')
		}

		this.server = this.app.listen(this.cfg.port)

		await events.once(this.server, 'listening')

		return this.server
	}
}

export default FeedGenerator
