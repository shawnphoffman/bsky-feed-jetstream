import { AtpAgent } from '@atproto/api'
import { ids } from '@atproto/bsky/src/lexicon/lexicons'
import dotenv from 'dotenv'

const run = async () => {
	dotenv.config()

	if (!process.env.BSKY_HANDLE) {
		throw new Error('Please provide an bsky handle in the .env file')
	}
	const handle = process.env.BSKY_HANDLE

	if (!process.env.FEEDGEN_PUBLISH_APP_PASSWORD) {
		throw new Error('Please provide an app password in the .env file')
	}
	const password = process.env.FEEDGEN_PUBLISH_APP_PASSWORD

	if (!process.env.FEEDGEN_SHORT_NAME) {
		throw new Error('Please provide an bsky handle in the .env file')
	}
	const recordName = process.env.FEEDGEN_SHORT_NAME

	// -------------------------------------
	// NO NEED TO TOUCH ANYTHING BELOW HERE
	// -------------------------------------

	if (!process.env.FEEDGEN_SERVICE_DID && !process.env.FEEDGEN_HOSTNAME) {
		throw new Error('Please provide a hostname in the .env file')
	}

	const agent = new AtpAgent({ service: 'https://bsky.social' })
	await agent.login({ identifier: handle, password })

	await agent.api.com.atproto.repo.deleteRecord({
		repo: agent.session?.did ?? '',
		rkey: recordName,
		collection: ids.AppBskyFeedGenerator,
	})

	console.log('All done 🎉')
}

run()
