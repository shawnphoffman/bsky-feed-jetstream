import type { JetstreamRecord } from '../jetstream/jetstream-subscription'

export const recordHasSpoilers = (record: JetstreamRecord) => {
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

	const hasText = record?.text?.toLowerCase().includes('[spoiler]')
	return hasText
}
