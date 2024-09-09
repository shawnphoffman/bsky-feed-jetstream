import { Server } from '@atproto/bsky/src/lexicon'
import { AtUri } from '@atproto/syntax'

import algos from '../algos'
import { AppContext } from '../types/config'

export default function (server: Server, ctx: AppContext) {
	server.app.bsky.feed.describeFeedGenerator(async () => {
		const feeds = Object.keys(algos).map(shortname => ({
			uri: AtUri.make(ctx.cfg.publisherDid, 'app.bsky.feed.generator', shortname).toString(),
		}))
		return {
			encoding: 'application/json',
			body: {
				did: ctx.cfg.serviceDid,
				feeds,
			},
		}
	})
}
