import { BskyAgent } from '@atproto/api'
import type { Record } from '@atproto/api/dist/client/types/app/bsky/feed/post'

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
		const labeler = agent.withProxy('atproto_labeler', process.env.MOD_BSKY_USERNAME!).api.tools.ozone.moderation

		const temp = await labeler.emitEvent(labelData)
		console.log('temp', temp)
		await labeler.emitEvent(ackData)

		// console.log('temp', temp)
	} catch (error) {
		console.log('❌❌❌ spoiler label error', error)
	}
}
