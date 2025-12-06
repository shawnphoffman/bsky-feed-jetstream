import AtpAgent, { AtpSessionData, AtpSessionEvent } from '@atproto/api'
import { HeadersMap } from '@atproto/xrpc'
import Bottleneck from 'bottleneck'
import { readFile, writeFile } from 'node:fs/promises'
import { Gauge } from 'prom-client'

let savedSessionData: AtpSessionData

const countReceived = new Gauge({
	name: 'countReceived',
	help: '⌛ Received',
})
const countQueued = new Gauge({
	name: 'countQueued',
	help: '⌛ Queued',
})
const countQueuedToo = new Gauge({
	name: 'countQueuedToo',
	help: '⌛ Queued2',
})
const countRunning = new Gauge({
	name: 'countRunning',
	help: '⌛ Running',
})
const countExecuting = new Gauge({
	name: 'countExecuting',
	help: '⌛ Executing',
})
const countDone = new Gauge({
	name: 'countDone',
	help: '⌛ Done',
})

// Create a Bottleneck limiter
const limiter = new Bottleneck({
	id: 'labeler',
	clearDatastore: true,
	strategy: Bottleneck.strategy.LEAK,
	reservoir: 30, // Max 30 requests available
	reservoirRefreshAmount: 30,
	reservoirRefreshInterval: 300 * 1000, // Every 5 minutes (300 seconds)
	maxConcurrent: 1, // Allow only 1 concurrent request
	minTime: 100, // Minimum time between requests (ms)
})

limiter.on('depleted', () => {
	console.log('🥺🥺🥺 Limiter depleted 🥺🥺🥺')
})

// limiter.on('executing', job => {
// 	console.log('🥺🥺🥺 Executing', job)
// })

// Helper to update limiter using rate-limit headers
const updateLimiterFromHeaders = (headers: HeadersMap, labelText: string = '') => {
	const remaining = Number(headers['ratelimit-remaining']) || 0
	const resetTime = Number(headers['ratelimit-reset']) || 0
	const now = Date.now()
	const resetMs = resetTime * 1000 - now // Convert Unix timestamp to ms

	// Update the reservoir based on 'ratelimit-remaining'
	if (remaining >= 0) {
		console.log(`🚰🚰🚰 Updating reservoir 🚰🚰🚰 ${labelText}`, remaining)
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
	countQueuedToo.set(limiter.queued())
}

const ohShit = () => {
	console.log('💩💩💩 OH SHIT 💩💩💩')

	const remaining = 0
	const resetMs = 86400000

	limiter.updateSettings({ reservoir: remaining })
	limiter.updateSettings({ reservoirRefreshInterval: resetMs })
}

const tryLogin = async () => {
	try {
		// Throttle the login process
		const loginResponse = await limiter.schedule(() =>
			agent.login({
				identifier: process.env.MOD_BSKY_USERNAME!,
				password: process.env.MOD_BSKY_PASSWORD!,
			})
		)

		// console.log('🤔🤔🤔 Login response', loginResponse)

		// Update Bottleneck based on the response headers
		updateLimiterFromHeaders(loginResponse.headers, '(login)')

		if (!loginResponse?.success) {
			console.error('BLUESKY MOD LOGIN FAILED', loginResponse)
			return
		}
	} catch (le) {
		// console.error('❌❌❌ login error')
		console.error('❌❌❌ login error', le)
		ohShit()
	}
}

const agent = new AtpAgent({
	service: 'https://bsky.social',
	persistSession: (event: AtpSessionEvent, session?: AtpSessionData) => {
		if (!session) {
			throw new Error('No session data to persist. Did ya pass an incorrect username/password?')
		}
		// store the session-data for reuse
		savedSessionData = session
		// ! Uncomment this line to save the session data to disk. Beware that this is a sensitive file!
		writeFile('./session.json', JSON.stringify(session))
	},
})

export const labelPost = async ({ uri, cid, labelText }: { uri: string; cid: string; labelText: string }) => {
	try {
		// See if we have saved session data
		const session = await readFile('./session.json', { encoding: 'utf-8' }).catch(() => null)
		if (session) {
			console.log('🤔 Found saved session data. Resuming session...')
			savedSessionData = JSON.parse(session)
			const temp = await agent.resumeSession(savedSessionData)
			if (!temp) {
				console.log('🔥🔥🔥 Resuming session failed 🔥🔥🔥')
				await tryLogin()
			}
		}

		// await agent.refreshSession()
		if (!agent.hasSession) {
			await tryLogin()
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
				createLabelVals: [labelText],
				negateLabelVals: [],
				comment: `Auto-labeled via contrails jetstream: ${labelText}`,
			},
		}
		const ackData = {
			...baseData,
			event: {
				$type: 'tools.ozone.moderation.defs#modEventAcknowledge',
				comment: `Auto-acked via contrails jetstream: ${labelText}`,
			},
		}
		const labeler = agent.withProxy('atproto_labeler', process.env.MOD_BSKY_USERNAME!).api.tools.ozone.moderation

		// Throttle and emit label event
		const labelResponse = await limiter.schedule(() => labeler.emitEvent(labelData))
		if (!labelResponse.success) {
			console.log('🔥 labelResponse.failed', labelResponse)
		} else {
			console.log('✅ labelResponse.success', labelText)
		}

		// Update Bottleneck based on the response headers
		updateLimiterFromHeaders(labelResponse.headers, '(label)')

		// Throttle and emit acknowledge event
		const ackResponse = await limiter.schedule(() => labeler.emitEvent(ackData))
		if (!ackResponse.success) {
			console.log('🔥 ackResponse.failed', ackResponse)
		} else {
			console.log('✅ ackResponse.success', labelText)
		}

		// Update Bottleneck again after ack event
		updateLimiterFromHeaders(ackResponse.headers, '(ack)')
	} catch (error) {
		// console.log(`❌❌❌ Label error: ${labelText}`)
		console.log(`❌❌❌ Label error: ${labelText}`, error)
		if (error?.error === 'AuthenticationRequired') {
			await tryLogin()
		}
	}
}
