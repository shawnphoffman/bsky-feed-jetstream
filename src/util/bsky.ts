import { AppBskyFeedSearchPosts, AtpAgent, BskyAgent } from '@atproto/api'
import dotenv from 'dotenv'

dotenv.config()

const handle = process.env.BSKY_USERNAME ?? 'uhoh'
const password = process.env.BSKY_PASSWORD ?? 'uhoh'

export const getPodcastEmbedFeed = async () => {
	const agent = new BskyAgent({ service: 'https://bsky.social' })

	const loginResponse = await agent.login({ identifier: handle, password })
	if (!loginResponse?.success) {
		console.error('BLUESKY LOGIN FAILED', loginResponse)
		return []
	}

	const resp = await agent.getAuthorFeed({
		actor: handle,
	})

	// Filter out replies and posts without embeds
	const feed = resp.data.feed.filter(item => item.reply === undefined && item.post.embed !== undefined)

	// console.log('feed', JSON.stringify(feed, null, 2))

	return feed
}

export const getSpoilerPosts = async (cursor?: string, limit: number = 10) => {
	const agent = new AtpAgent({ service: 'https://bsky.social' })

	const loginResponse = await agent.login({ identifier: handle, password })
	if (!loginResponse?.success) {
		console.error('BLUESKY LOGIN FAILED', loginResponse)
		return null
	}

	const params: AppBskyFeedSearchPosts.QueryParams = {
		// q: '*spoiler*',
		q: '#spoiler',
		cursor,
		limit,
	}

	console.log('params', params)

	const options: AppBskyFeedSearchPosts.CallOptions = {}

	const searchResp = await agent.api.app.bsky.feed.searchPosts(params, options)
	// const searchResp = await agent
	// 	.withProxy('atproto_labeler', process.env.MOD_BSKY_USERNAME!)
	// 	.api.xrpc.call('app.bsky.feed.searchPosts', params)

	if (!searchResp.success) {
		console.error('BLUESKY SPOILER SEARCH FAILED', searchResp)
		return searchResp.data
	}

	return searchResp.data
}

export const labelPostAsSpoiler = async ({ uri, cid }) => {
	try {
		const agent = new BskyAgent({ service: 'https://bsky.social' })

		const loginResponse = await agent.login({
			identifier: process.env.MOD_BSKY_USERNAME!,
			password: process.env.MOD_BSKY_PASSWORD!,
		})
		if (!loginResponse?.success) {
			console.error('BLUESKY MOD LOGIN FAILED', loginResponse)
			return
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

		await agent
			.withProxy('atproto_labeler', process.env.MOD_BSKY_USERNAME!)
			.api.xrpc.call('tools.ozone.moderation.emitEvent', {}, labelData)
		await agent.withProxy('atproto_labeler', process.env.MOD_BSKY_USERNAME!).api.xrpc.call('tools.ozone.moderation.emitEvent', {}, ackData)

		// console.log('temp', temp)
	} catch (error) {
		console.log('❌❌❌ spoiler label error', error)
	}
}

export const getModRecord = async ({ uri, cid }) => {
	try {
		const agent = new AtpAgent({ service: 'https://bsky.social' })

		const loginResponse = await agent.login({
			identifier: process.env.MOD_BSKY_USERNAME!,
			password: process.env.MOD_BSKY_PASSWORD!,
		})
		if (!loginResponse?.success) {
			console.error('BLUESKY MOD LOGIN FAILED', loginResponse)
			return
		}

		const modRecord = await agent
			.withProxy('atproto_labeler', process.env.MOD_BSKY_USERNAME!)
			.api.xrpc.call('tools.ozone.moderation.getRecord', {
				uri,
				cid,
			})

		console.log('modRecord.headers', modRecord.headers)

		return modRecord
	} catch (error) {
		console.log('❌❌❌ mod record error', error)
	}
}
