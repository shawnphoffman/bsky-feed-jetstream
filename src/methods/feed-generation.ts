import { Server } from '@atproto/bsky/src/lexicon'
// import { validateAuth } from '../auth'
import { AtUri } from '@atproto/syntax'
import { InvalidRequestError } from '@atproto/xrpc-server'

import algos from '../algos'
import { AppContext } from '../types/config'

export default function (server: Server, ctx: AppContext) {
	// Feed skeletons are fetched by the PDS
	server.app.bsky.feed.getFeedSkeleton(async ({ params, req }) => {
		const feedUri = new AtUri(params.feed)
		const algo = algos[feedUri.rkey]

		if (feedUri.hostname !== ctx.cfg.publisherDid || feedUri.collection !== 'app.bsky.feed.generator' || !algo) {
			throw new InvalidRequestError('Unsupported algorithm', 'UnsupportedAlgorithm')
		}

		/**
		 * Example of how to check auth if giving user-specific results:
		 *
		 * const requesterDid = await validateAuth(
		 *   req,
		 *   ctx.cfg.serviceDid,
		 *   ctx.didResolver,
		 * )
		 */

		const body = await algo(ctx, params)
		return {
			encoding: 'application/json',
			body: body,
		}
	})
}
