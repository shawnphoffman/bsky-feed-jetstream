import type { JetstreamRecord } from '../jetstream/jetstream-subscription'

const blacklistTags = [
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

export const recordHasAiContent = (record: JetstreamRecord) => {
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
