import events from 'events'
import express from 'express'
import http from 'http'
import promClient, { register } from 'prom-client'

import { JetstreamFirehoseSubscription } from './jetstream/jetstream-firehose'
import { createDb, Database, migrateToLatest } from './db'

promClient.collectDefaultMetrics()

type Config = {
	port: number
	listenhost: string
	sqliteLocation: string
	subscriptionReconnectDelay: number
}

export class JetstreamClient {
	public app: express.Application
	public server?: http.Server
	public db: Database
	public jetstream: JetstreamFirehoseSubscription | null
	public cfg: Config

	constructor(app: express.Application, db: Database, jetstream: JetstreamFirehoseSubscription | null, cfg: Config) {
		this.app = app
		this.db = db
		this.jetstream = jetstream
		this.cfg = cfg
	}

	static create(cfg: Config) {
		const app = express()
		const db = createDb(cfg.sqliteLocation)

		const jetstream = process.env.DISABLE_JETSTREAM !== 'true' ? new JetstreamFirehoseSubscription(process.env.JETSTREAM_URL, db) : null

		// const server = createServer({
		// 	validateResponse: true,
		// 	payload: {
		// 		jsonLimit: 100 * 1024, // 100kb
		// 		textLimit: 100 * 1024, // 100kb
		// 		blobLimit: 5 * 1024 * 1024, // 5mb
		// 	},
		// })
		// app.use(server.xrpc.router)

		app.get('/metrics', async (req, res) => {
			try {
				res.set('Content-Type', register.contentType)
				res.end(await register.metrics())
			} catch (ex) {
				res.status(500).end(ex)
			}
		})

		app.get('/metrics/count_all', async (req, res) => {
			try {
				res.set('Content-Type', register.contentType)
				res.end(await register.getSingleMetricAsString('count_all'))
			} catch (ex) {
				res.status(500).end(ex)
			}
		})

		return new JetstreamClient(app, db, jetstream, cfg)
	}

	async start(): Promise<http.Server> {
		await migrateToLatest(this.db)

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

export default JetstreamClient
