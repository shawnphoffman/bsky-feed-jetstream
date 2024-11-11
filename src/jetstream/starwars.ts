import { JetstreamEvent } from './jetstream-subscription'

export const processStarWarsPost = async (event: JetstreamEvent, { uri, cid }) => {
	//
	const url = process.env.FEEDGEN_HOSTNAME
	const key = process.env.FORCE_KEY

	if (!url || !key) {
		console.error('Feed generator URL or key not found')
		return
	}

	const addUrl = `https://${url}/posts`

	const myHeaders = new Headers()
	myHeaders.append('Content-Type', 'application/json')
	myHeaders.append('x-force-key', key)

	const post = {
		uri: uri,
		cid: cid,
		replyParent: event.commit.record?.reply?.parent.uri ?? null,
		replyRoot: event.commit.record?.reply?.root.uri ?? null,
		indexedAt: new Date().toISOString(),
	}

	// console.log('INPUT', post)
	const requestOptions = {
		headers: myHeaders,
		method: 'POST',
		body: JSON.stringify(post),
	}
	try {
		return await fetch(addUrl, requestOptions)
		// const temp = await fetch(addUrl, requestOptions)
		// console.log('RESULT', temp)
		// return temp
	} catch (error) {
		console.error('Error adding to star wars feed', error)
	}
}

export const isStarWarsPost = (event: JetstreamEvent) => {
	const test = isShawnBotPost(event) || isIncludePost(event) || isCKAndorPost(event)

	if (test) {
		console.log('🟢 Including post')
		return true
	}
	return false
}

const isShawnBotPost = (event: JetstreamEvent) => {
	// SHAWNBOT POSTS
	if (event.did !== process.env.SHAWNBOT_DID) {
		return false
	}
	console.log('\n+++++++++++++++++++++++++')
	console.log('🆕 ShawnBot', event.commit.record.text)

	// Ignore replies
	if (event.commit.record.reply !== undefined) {
		console.log(`❌ Ignoring reply: ${event.commit.record.text}`)
		return false
	}

	const hasFacets = event.commit.record.facets !== undefined && event.commit.record.facets.length > 0

	// If it doesn't have facets, it's a simple text post
	// I should probably remove this
	if (!hasFacets) {
		console.log(` - Include no facets: ${event.commit.record.text}`)
		return true
	}

	const hasHashtags =
		hasFacets &&
		// @ts-expect-error Facets
		event.commit.record.facets.some(facet => {
			// console.log(` - facet: ${JSON.stringify(facet)}`)
			return facet.features.some(f => {
				return f.$type === 'app.bsky.richtext.facet#tag'
			})
		})

	// console.log(` - Hashtags: ${hasHashtags}`)

	// If it has hashtags, check for #starwars
	if (hasHashtags) {
		// @ts-expect-error Facets
		const hasStarWarsTag = event.commit.record.facets.some(facet => {
			return facet.features.some(f => {
				if (f.$type !== 'app.bsky.richtext.facet#tag') return false
				const wow = f as { tag: string }
				console.log(`  #️⃣ tag: ${wow.tag}`)
				return wow.tag?.toLowerCase() === 'starwars'
			})
		})
		// Don't include posts without the #starwars tag if they have hashtags
		if (!hasStarWarsTag) {
			console.log(`❌ Ignoring non-starwars: ${event.commit.record.text}`)
			return false
		}
		// Include posts with the #starwars tag
		return true
	}

	// Include posts with embeds as a last resort
	const hasEmbed = event.commit.record.embed !== undefined

	console.log(` - HasEmbed?: ${hasEmbed}`)

	return hasEmbed
}

const isIncludePost = (event: JetstreamEvent) => {
	try {
		const includeDids = process.env.FEED_INCLUDE_DIDS?.split(',') ?? []
		if (!includeDids.includes(event.did)) {
			return false
		}
		console.log('\n+++++++++++++++++++++++++')
		console.log('🆕➕ IncludeDID', event.commit.record.text)

		// Ignore replies
		if (event.commit.record.reply !== undefined) {
			console.log(`❌➕ Ignoring include reply: ${event.commit.record.text}`)
			return false
		}

		// Only include posts with embeds
		const hasEmbed = event.commit.record.embed !== undefined

		console.log(` - ➕HasEmbed?: ${hasEmbed}`)

		return hasEmbed
	} catch (error) {
		console.error(`❌➕ Error with includes`, error)
	}
}

const isCKAndorPost = (event: JetstreamEvent) => {
	if (event.did === process.env.CK_DID && process.env.CK_ANDOR_POST == 'true') {
		if (event.commit.record.text.toLowerCase().includes('one day closer to')) {
			console.log('\n+++++++++++++++++++++++++')
			console.log('🆕 CK Andor', event.commit.record.text)
			return true
		} else {
			console.log(`❌ Ignoring Non-Andor C.K. Post: ${event.commit.record.text}`)
		}
	}
}
