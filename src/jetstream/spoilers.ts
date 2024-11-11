import { BskyAgent } from '@atproto/api'
import type { Record } from '@atproto/api/dist/client/types/app/bsky/feed/post'
import { Headers } from '@atproto/xrpc'
import Bottleneck from 'bottleneck'
import tx2 from 'tx2'

const countReceived = tx2.metric({
	name: '⌛ Received',
})
const countQueued = tx2.metric({
	name: '⌛ Queued',
})
const countQueuedToo = tx2.metric({
	name: '⌛ Queued2',
})
const countRunning = tx2.metric({
	name: '⌛ Running',
})
const countExecuting = tx2.metric({
	name: '⌛ Executing',
})
const countDone = tx2.metric({
	name: '⌛ Done',
})
const isEmpty = tx2.metric({
	name: '❓ Empty?',
})

export const recordHasSpoilers = (record: Record) => {
	const hasTags = record?.facets
		? record.facets.some(facet => {
				return facet.features.some(f => {
					if (f.$type !== 'app.bsky.richtext.facet#tag') return false
					const wow = f as { tag: string }
					return wow.tag?.toLowerCase().includes('spoiler')
				})
		  })
		: false
	if (hasTags) {
		return true
	}
	const hasText = record?.text.toLowerCase().includes('[spoiler]')
	return hasText
}

// Create a Bottleneck limiter
const limiter = new Bottleneck({
	reservoir: 30, // Max 30 requests available
	reservoirRefreshAmount: 30,
	reservoirRefreshInterval: 300 * 1000, // Every 5 minutes (300 seconds)
	maxConcurrent: 1, // Allow only 1 concurrent request
	minTime: 100, // Minimum time between requests (ms)
})

limiter.on('depleted', () => {
	console.log('🥺🥺🥺 Limiter depleted 🥺🥺🥺')
})

// Helper to update limiter using rate-limit headers
const updateLimiterFromHeaders = (headers: Headers) => {
	const remaining = Number(headers['ratelimit-remaining']) || 0
	const resetTime = Number(headers['ratelimit-reset']) || 0
	const now = Date.now()
	const resetMs = resetTime * 1000 - now // Convert Unix timestamp to ms

	// Update the reservoir based on 'ratelimit-remaining'
	if (remaining >= 0) {
		console.log('🚰🚰🚰 Updating reservoir 🚰🚰🚰', remaining)
		limiter.updateSettings({ reservoir: remaining })
	}

	// Adjust the refresh interval based on 'ratelimit-reset'
	if (resetTime) {
		limiter.updateSettings({ reservoirRefreshInterval: resetMs })
	}

	const counts = limiter.counts()
	countDone.set(counts.DONE || 0)
	countExecuting.set(counts.EXECUTING)
	countQueued.set(counts.QUEUED)
	countReceived.set(counts.RECEIVED)
	countRunning.set(counts.RUNNING)
	isEmpty.set(limiter.empty())
	countQueuedToo.set(limiter.queued())
}

const ohShit = () => {
	console.log('💩💩💩 OH SHIT 💩💩💩')

	const remaining = 0
	const resetMs = 86400000

	limiter.updateSettings({ reservoir: remaining })
	limiter.updateSettings({ reservoirRefreshInterval: resetMs })
}

const agent = new BskyAgent({ service: 'https://bsky.social' })

// Throttle the login and emitEvent calls
export const labelPostAsSpoiler = async ({ uri, cid }) => {
	try {
		await agent.refreshSession()
		if (!agent.hasSession) {
			try {
				// Throttle the login process
				const loginResponse = await limiter.schedule(() =>
					agent.login({
						identifier: process.env.MOD_BSKY_USERNAME!,
						password: process.env.MOD_BSKY_PASSWORD!,
					})
				)

				// Update Bottleneck based on the response headers
				updateLimiterFromHeaders(loginResponse.headers)

				if (!loginResponse?.success) {
					console.error('BLUESKY MOD LOGIN FAILED', loginResponse)
					return
				}
			} catch (le) {
				console.error('❌❌❌ login error', le)
				ohShit()
			}
		}

		const baseData = {
			subject: {
				$type: 'com.atproto.repo.strongRef',
				uri: uri,
				cid: cid,
			},
			subjectBlobCids: [],
			createdBy: process.env.MOD_BSKY_USERNAME!,
			createdAt: new Date().toISOString(),
		}

		const labelData = {
			...baseData,
			event: {
				$type: 'tools.ozone.moderation.defs#modEventLabel',
				createLabelVals: ['spoiler'],
				negateLabelVals: [],
				comment: 'Spoiler auto-labeled via firehose',
			},
		}
		const ackData = {
			...baseData,
			event: {
				$type: 'tools.ozone.moderation.defs#modEventAcknowledge',
				comment: 'Spoiler auto-acked via firehose',
			},
		}
		const labeler = agent.withProxy('atproto_labeler', process.env.MOD_BSKY_USERNAME!).api.tools.ozone.moderation

		// Throttle and emit label event
		const labelResponse = await limiter.schedule(() => labeler.emitEvent(labelData))
		console.log('labelResponse', labelResponse)

		// Update Bottleneck based on the response headers
		updateLimiterFromHeaders(labelResponse.headers)

		// Throttle and emit acknowledge event
		const ackResponse = await limiter.schedule(() => labeler.emitEvent(ackData))
		console.log('ackResponse', ackResponse)

		// Update Bottleneck again after ack event
		updateLimiterFromHeaders(ackResponse.headers)
	} catch (error) {
		console.log('❌❌❌ spoiler label error', error)
	}
}

// export const labelPostAsSpoiler = async ({ uri, cid }) => {
// 	try {
// 		const agent = new BskyAgent({ service: 'https://bsky.social' })

// 		const loginResponse = await agent.login({
// 			identifier: process.env.MOD_BSKY_USERNAME!,
// 			password: process.env.MOD_BSKY_PASSWORD!,
// 		})
// 		if (!loginResponse?.success) {
// 			console.error('BLUESKY MOD LOGIN FAILED', loginResponse)
// 			return
// 		}

// 		const baseData = {
// 			subject: {
// 				$type: 'com.atproto.repo.strongRef',
// 				uri: uri,
// 				cid: cid,
// 			},
// 			subjectBlobCids: [],
// 			createdBy: process.env.MOD_BSKY_USERNAME!,
// 			createdAt: new Date().toISOString(),
// 		}

// 		const labelData = {
// 			...baseData,
// 			event: {
// 				$type: 'tools.ozone.moderation.defs#modEventLabel',
// 				createLabelVals: ['spoiler'],
// 				negateLabelVals: [],
// 				comment: 'Spoiler auto-labeled via firehose',
// 			},
// 		}
// 		const ackData = {
// 			...baseData,
// 			event: {
// 				$type: 'tools.ozone.moderation.defs#modEventAcknowledge',
// 				comment: 'Spoiler auto-acked via firehose',
// 			},
// 		}
// 		const labeler = agent.withProxy('atproto_labeler', process.env.MOD_BSKY_USERNAME!).api.tools.ozone.moderation

// 		const temp = await labeler.emitEvent(labelData)
// 		console.log('temp', temp)
// 		await labeler.emitEvent(ackData)

// 		// console.log('temp', temp)
// 	} catch (error) {
// 		console.log('❌❌❌ spoiler label error', error)
// 	}
// }
