//
// TODO - UPDATE TO MATCH MACMINI CHANGES!!!
//

import { ids } from '@atproto/bsky/src/lexicon/lexicons'
import chalk from 'chalk'
import tx2 from 'tx2'

import { labelPostAsAiContent, recordHasAiContent } from '../logic/ai'
import { isJetstreamCommit, JetstreamEvent, JetstreamFirehoseSubscriptionBase } from './jetstream-subscription'
import { labelPostAsSpoiler, recordHasSpoilers } from '../logic/spoilers'
import { isStarWarsPost, processStarWarsPost } from '../logic/starwars'

const meter = tx2.meter({
	name: 'req/sec',
	samples: 1,
	timeframe: 60,
})
const histo_all = tx2.histogram({
	name: 'histogram_requests',
	unit: 'Requests',
	measurement: 'mean',
})
const histo_spoilers = tx2.histogram({
	name: 'histogram_spoiler',
	unit: 'Spoilers',
	measurement: 'count',
})
const histo_sw = tx2.histogram({
	name: 'histogram_starwars',
	unit: 'Star Wars',
	measurement: 'count',
})
const histo_ai = tx2.histogram({
	name: 'histogram_ai',
	unit: 'AI-Related',
	measurement: 'count',
})

export class JetstreamFirehoseSubscription extends JetstreamFirehoseSubscriptionBase {
	async handleEvent(event: JetstreamEvent) {
		const DISABLE_SPOILERS = process.env.DISABLE_SPOILERS == 'true'
		const DISABLE_STARWARS = process.env.DISABLE_STARWARS == 'true'
		const DISABLE_AICONTENT = process.env.DISABLE_AICONTENT == 'true'

		if (!isJetstreamCommit(event)) return
		// console.log('🛩️🛩️🛩️', event)

		meter.mark()
		histo_all.update(histo_all.val() + 1)

		// Just in case the filter doesn't work
		if (![ids.AppBskyFeedPost, ids.AppBskyFeedRepost].includes(event?.commit?.collection)) {
			return console.log('🙈', event)
		}

		// Check for deletes
		const isDelete = event.commit.operation === 'delete'
		if (isDelete) {
			// I should probably cache and bulk-delete these from feeds
			return
		}

		// if ([ids.AppBskyFeedRepost].includes(event?.commit?.collection)) {
		// 	// return console.log('♻️', JSON.stringify(event.commit.record.subject))
		// 	return console.log('♻️', event)
		// }

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
				histo_sw.update(histo_sw.val() + 1)
				console.log(chalk.bold.blueBright('\n🟢🟢 STAR WARS 🟢🟢'), event)
				await processStarWarsPost(event, { uri: uri, cid: event.commit.cid })
			}
		}

		// DON'T PROCESS REPOSTS BEYOND THIS
		if ([ids.AppBskyFeedRepost].includes(event?.commit?.collection)) {
			return
		}

		// =============================
		// SPOILERS
		// =============================
		if (!DISABLE_SPOILERS) {
			const hasSpoiler = recordHasSpoilers(record)
			if (hasSpoiler) {
				histo_spoilers.update(histo_spoilers.val() + 1)
				console.log(chalk.bold.blueBright('\n🟡🟡 SPOILER 🟡🟡'), event)
				await labelPostAsSpoiler({ uri: uri, cid: event.commit.cid })
			}
		}

		// =============================
		// AI CONTENT
		// =============================
		if (!DISABLE_AICONTENT) {
			const hasAI = recordHasAiContent(record)
			if (hasAI) {
				histo_ai.update(histo_ai.val() + 1)
				console.log(chalk.bold.blueBright('\n🔵🔵 AI CONTENT 🔵🔵'), event)
				await labelPostAsAiContent({ uri: uri, cid: event.commit.cid })
			}
		}
	}
}
