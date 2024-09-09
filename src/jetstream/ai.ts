import { BskyAgent } from '@atproto/api'
import type { Record } from '@atproto/api/dist/client/types/app/bsky/feed/post'

const blacklistTags = [
	//
	'ai',
	'aiart',
	'artificialintelligence',
	'generativeai',
	'gpt4',
	'llm',
	'midjourney',
	'proceduralart',
	'stablediffusion',
]

export const recordHasAiContent = (record: Record) => {
	const hasTags = record?.facets
		? record.facets.some(facet => {
				return facet.features.some(f => {
					if (f.$type !== 'app.bsky.richtext.facet#tag') return false

					const tagObj = f as { tag: string }
					// console.log(`  #️⃣ tag: ${tagObj.tag?.toLowerCase()}`)

					if (blacklistTags.includes(tagObj.tag?.toLowerCase())) return true

					// Partial tag text check?

					return false
				})
		  })
		: false
	if (hasTags) {
		return true
	}
	const hasText = record?.text.toLowerCase().includes('[ai]')
	return hasText
}

export const labelPostAsAiContent = async ({ uri, cid }) => {
	try {
		const agent = new BskyAgent({ service: 'https://bsky.social' })

		const loginResponse = await agent.login({
			identifier: process.env.MOD_BSKY_USERNAME!,
			password: process.env.MOD_BSKY_PASSWORD!,
		})
		if (!loginResponse?.success) {
			console.error('🤖 BLUESKY MOD LOGIN FAILED', loginResponse)
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
				createLabelVals: ['ai-related-content'],
				negateLabelVals: [],
				comment: 'AI content auto-labeled via firehose',
			},
		}
		const ackData = {
			...baseData,
			event: {
				$type: 'tools.ozone.moderation.defs#modEventAcknowledge',
				comment: 'AI content auto-acked via firehose',
			},
		}

		const labeler = agent.withProxy('atproto_labeler', process.env.MOD_BSKY_USERNAME!).api.tools.ozone.moderation

		const labelProm = labeler.emitEvent(labelData)
		const ackProm = labeler.emitEvent(ackData)
		await Promise.all([labelProm, ackProm])

		// console.log('temp', temp)
	} catch (error) {
		console.log('❌❌❌ ai label error', error)
	}
}
