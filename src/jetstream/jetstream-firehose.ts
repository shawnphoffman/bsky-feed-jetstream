import { ids } from '@atproto/bsky/src/lexicon/lexicons'
import chalk from 'chalk'
import { Counter } from 'prom-client'

import { isJetstreamCommit, JetstreamEvent, JetstreamFirehoseSubscriptionBase } from './jetstream-subscription'
import { labelPost } from '../logic/labeler'
import { recordHasSpoilers } from '../logic/spoilers'

const count_all = new Counter({
	name: 'count_all',
	help: 'All requests',
	// labelNames: ['code'],
})
const count_spoilers = new Counter({
	name: 'count_spoilers',
	help: 'Spoiler labels',
	// labelNames: ['code'],
})

export class JetstreamFirehoseSubscription extends JetstreamFirehoseSubscriptionBase {
	async handleEvent(event: JetstreamEvent) {
		const DISABLE_SPOILERS = process.env.DISABLE_SPOILERS == 'true'

		if (!isJetstreamCommit(event)) return
		console.log('🛩️🛩️🛩️', event)

		count_all.inc(1)

		// Just in case the filter doesn't work
		// if (![ids.AppBskyFeedPost].includes(event?.commit?.collection)) {
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
				count_spoilers.inc(1)
				console.log(chalk.bold.blueBright('\n🟡🟡 SPOILER 🟡🟡'), event)
				await labelPost({ uri: uri, cid: event.commit.cid, labelText: 'spoiler' })

				try {
					if (record?.reply?.parent?.uri && record?.reply?.parent?.cid) {
						const rootUri = record?.reply?.parent?.uri
						const rootCid = record?.reply?.parent?.cid
						await labelPost({ uri: rootUri, cid: rootCid, labelText: 'spoiler-parent' })
					}
				} catch (error) {
					console.error('🔴 Error labeling parent record', error)
				}
			}
		}
	}
}
