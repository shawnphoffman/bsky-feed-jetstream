import { ComAtprotoSyncSubscribeRepos } from '@atproto/api'

import { labelPostAsSpoiler } from './util/bsky'
import { addToStarWarsFeed } from './util/shawnbot'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

const includeDids = process.env.FEED_INCLUDE_DIDS?.split(',') ?? []

// TODO - Cron job that deletes old posts from the db
// TODO - Optimize the loooooops

export class FirehoseSubscription extends FirehoseSubscriptionBase {
	async handleEvent(evt: ComAtprotoSyncSubscribeRepos.Commit) {
		// Is it a commit?
		if (!ComAtprotoSyncSubscribeRepos.isCommit(evt)) return

		// Parse the event
		const ops = await getOpsByType(evt)

		// Log every 1000 events for sanity
		if (evt.seq % 1000 === 0) {
			try {
				const eventDate = new Date(evt.time)
				const pstDate = eventDate.toLocaleString('en-US', {
					timeZone: 'America/Los_Angeles',
				})
				console.log('🤖', { seq: evt.seq, time: pstDate })
			} catch {
				// Do nothing
			}
		}

		// Deleted posts
		// TODO Do I even need this if I clean things up occasionally?
		const postsToDelete = ops.posts.deletes.map(del => del.uri)

		const spoilerPosts: { uri: string; cid: string }[] = []

		// Incoming posts
		const postsToCreate = ops.posts.creates
			.filter(create => {
				// DEBUGGING
				if (create.record.text.includes('test wow')) {
					console.log('\n')
					console.log('🤯', create)
				}

				// SPOILER POST LABELING
				// if (post.record.langs?.includes('en') === false) return
				const hasSpoilerTag = create?.record?.facets
					? create.record.facets.some(facet => {
							return facet.features.some(f => {
								if (f.$type !== 'app.bsky.richtext.facet#tag') return false
								const wow = f as { tag: string }
								return wow.tag?.toLowerCase().includes('spoiler')
							})
					  })
					: false
				if (hasSpoilerTag || create.record.text.toLowerCase().includes('[spoiler]')) {
					spoilerPosts.push({ uri: create.uri, cid: create.cid })
				}

				// SHAWNBOT POSTS
				if (create.author === process.env.SHAWNBOT_DID) {
					console.log('\n+++++++++++++++++++++++++')
					console.log('🆕 ShawnBot', create.record.text)

					// Ignore replies
					if (create.record.reply !== undefined) {
						console.log(`❌ Ignoring reply: ${create.record.text}`)
						return false
					}

					const hasFacets = create.record.facets !== undefined && create.record.facets.length > 0

					// If it doesn't have facets, it's a simple text post
					// I should probably remove this
					if (!hasFacets) {
						console.log(` - Include no facets: ${create.record.text}`)
						return true
					}

					const hasHashtags =
						hasFacets &&
						create?.record?.facets?.some(facet => {
							// console.log(` - facet: ${JSON.stringify(facet)}`)
							return facet.features.some(f => {
								return f.$type === 'app.bsky.richtext.facet#tag'
							})
						})

					// console.log(` - Hashtags: ${hasHashtags}`)

					// If it has hashtags, check for #starwars
					if (hasHashtags) {
						const hasStarWarsTag = create?.record?.facets?.some(facet => {
							return facet.features.some(f => {
								if (f.$type !== 'app.bsky.richtext.facet#tag') return false
								const wow = f as { tag: string }
								console.log(`  #️⃣ tag: ${wow.tag}`)
								return wow.tag?.toLowerCase() === 'starwars'
							})
						})
						// Don't include posts without the #starwars tag if they have hashtags
						if (!hasStarWarsTag) {
							console.log(`❌ Ignoring non-starwars: ${create.record.text}`)
							return false
						}
						// Include posts with the #starwars tag
						return true
					}

					// Include posts with embeds as a last resort
					const hasEmbed = create.record.embed !== undefined

					console.log(` - HasEmbed?: ${hasEmbed}`)

					return hasEmbed
				}

				// MISC POSTS
				try {
					if (includeDids.includes(create.author)) {
						console.log('\n+++++++++++++++++++++++++')
						console.log('🆕➕ IncludeDID', create.record.text)

						// Ignore replies
						if (create.record.reply !== undefined) {
							console.log(`❌➕ Ignoring include reply: ${create.record.text}`)
							return false
						}

						// Only include posts with embeds
						const hasEmbed = create.record.embed !== undefined

						console.log(` - ➕HasEmbed?: ${hasEmbed}`)

						return hasEmbed
					}
				} catch (error) {
					console.error(`❌➕ Error with includes`, error)
				}

				// C.K. Andor posts
				if (create.author === process.env.CK_DID && process.env.CK_ANDOR_POST == 'true') {
					if (create.record.text.toLowerCase().includes('one day closer to')) {
						console.log('\n+++++++++++++++++++++++++')
						console.log('🆕 CK Andor', create.record.text)
						return true
					} else {
						console.log(`❌ Ignoring Non-Andor C.K. Post: ${create.record.text}`)
					}
				}

				return false
			})
			.map(create => {
				console.log(`  ✅ Creating: ${create.uri}`)
				// Map them to the db schema
				return {
					uri: create.uri,
					cid: create.cid,
					replyParent: create.record?.reply?.parent.uri ?? null,
					replyRoot: create.record?.reply?.root.uri ?? null,
					indexedAt: new Date().toISOString(),
				}
			})

		// Process deleted posts
		// TODO - Aggregate these and delete them in batches?
		if (postsToDelete.length > 0) {
			try {
				const deletedRows = await this.db.deleteFrom('post').where('uri', 'in', postsToDelete).executeTakeFirst()
				if (deletedRows.numDeletedRows > 0) {
					console.log('🗑️  Deleted:', deletedRows.numDeletedRows.toString())
				}
			} catch (error) {
				console.error('❌❌🗑️ Error deleting posts:', error)
			}
		}

		// Process new posts
		if (postsToCreate.length > 0) {
			console.log('💽  Add posts to db:', postsToCreate.length)

			if (process.env.CALL_FORCE_ENDPOINT === 'true') {
				for (const post of postsToCreate) {
					console.log('🚀 Calling force endpoint:', post.uri)
					await addToStarWarsFeed(post)
				}
			}

			await this.db
				.insertInto('post')
				.values(postsToCreate)
				.onConflict(oc => oc.doNothing())
				.execute()
		}

		// Moderation Service Shtuff
		if (process.env.LABEL_SPOILERS == 'true') {
			for (const post of spoilerPosts) {
				console.log('⚠️ Labeling spoiler post: ', post.uri)
				await labelPostAsSpoiler({ uri: post.uri, cid: post.cid })
			}
		} else {
			if (spoilerPosts.length > 0) {
				console.log('⚠️ Ignoring spoilers')
			}
		}
	}
}
