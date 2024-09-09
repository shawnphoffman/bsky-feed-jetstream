import { ids } from '@atproto/bsky/src/lexicon/lexicons'
import chalk from 'chalk'

import { labelPostAsAiContent, recordHasAiContent } from './ai'
// import { JetstreamMessage } from '../copied/types'
import { getJetstreamOpsByType, isJetstreamCommit, JetstreamEvent, JetstreamFirehoseSubscriptionBase } from './jetstream-subscription'
import { labelPostAsSpoiler, recordHasSpoilers } from './spoilers'
import { isStarWarsPost, processStarWarsPost } from './starwars'

const DISABLE_SPOILERS = process.env.DISABLE_SPOILERS == 'true'
const DISABLE_STARWARS = process.env.DISABLE_STARWARS == 'true'
const DISABLE_AICONTENT = process.env.DISABLE_AICONTENT == 'true'

export class JetstreamFirehoseSubscription extends JetstreamFirehoseSubscriptionBase {
	async handleEvent(event: JetstreamEvent) {
		if (!isJetstreamCommit(event)) return
		// console.log('🛩️🛩️🛩️', event)

		// Just in case the filter doesn't work
		if (event?.commit?.collection !== ids.AppBskyFeedPost) {
			return console.log('🙈', event)
		}

		// Check for deletes
		const isDelete = event.commit.type === 'd'
		if (isDelete) {
			// I should probably cache and bulk-delete these from feeds
			return
		}

		// Make sure we have a record
		const record = event.commit?.record
		if (!record) {
			return console.log('🙊', event)
		}

		// =============================
		// Stitch things back together
		// =============================
		// URI
		const path = `${event.commit.collection}/${event.commit.rkey}`
		const uri = `at://${event.did}/${path}`
		// =============================

		// =============================
		// STAR WARS
		// =============================
		if (!DISABLE_STARWARS) {
			const addToStarWarsFeed = isStarWarsPost(event)
			if (addToStarWarsFeed) {
				console.log(chalk.bold.blueBright('\n🟢🟢 STAR WARS 🟢🟢'), event)
				await processStarWarsPost(event, { uri: uri, cid: event.commit.cid })
			}
		}

		// =============================
		// SPOILERS
		// =============================
		if (!DISABLE_SPOILERS) {
			const hasSpoiler = recordHasSpoilers(record)
			if (hasSpoiler) {
				console.log(chalk.bold.blueBright('\n🟡🟡 SPOILER 🟡🟡'), event)
				// await labelPostAsSpoiler({ did: event.did })
				await labelPostAsSpoiler({ uri: uri, cid: event.commit.cid })
			}
		}

		// =============================
		// AI CONTENT
		// =============================
		if (!DISABLE_AICONTENT) {
			const hasAI = recordHasAiContent(record)
			if (hasAI) {
				console.log(chalk.bold.blueBright('\n🔵🔵 AI CONTENT 🔵🔵'), event)
				await labelPostAsAiContent({ uri: uri, cid: event.commit.cid })
			}
		}

		const ops = getJetstreamOpsByType(event)

		if (!ops || !ops.posts?.length) return

		const postsToCreate = ops.posts.filter(create => create.commit.record.embed?.images).filter(i => i)

		if (postsToCreate.length > 0) {
			// handle post however here
		}
	}
}
