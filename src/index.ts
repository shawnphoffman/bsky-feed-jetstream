import dotenv from 'dotenv'

import { maybeInt, maybeStr } from './util/environment'
import JetstreamClient from './JetstreamClient'

const run = async () => {
	dotenv.config()
	const server = JetstreamClient.create({
		port: maybeInt(process.env.PORT) ?? 3000,
		listenhost: maybeStr(process.env.FEEDGEN_LISTENHOST) ?? 'localhost',
		sqliteLocation: maybeStr(process.env.FEEDGEN_SQLITE_LOCATION) ?? ':memory:',
		subscriptionReconnectDelay: maybeInt(process.env.FEEDGEN_SUBSCRIPTION_RECONNECT_DELAY) ?? 3000,
	})
	await server.start()

	console.log(`
==================================
🤖 running feed-jetstream at http://${server.cfg.listenhost}:${server.cfg.port}
☑️ node: ${process.version}
💽 db: ${process.env.FEEDGEN_SQLITE_LOCATION}
🖱️ cursor: ${process.env.DISABLE_CURSOR !== 'true' ? 'enabled' : 'disabled'}
==================================`)
}

run()
