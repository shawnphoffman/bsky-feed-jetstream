import type { Record } from '@atproto/api/dist/client/types/app/bsky/feed/post'
import { OutputSchema } from '@atproto/bsky/src/lexicon/types/app/bsky/feed/searchPosts'
import express from 'express'

import { AppContext } from '../types/config'
import { getSpoilerPosts, labelPostAsSpoiler } from '../util/bsky'
import redis, { RedisKeys } from '../util/redis'

import { checkKey } from './crud'

const makeRouter = (ctx: AppContext) => {
	const router = express.Router()

	// ================
	// HEALTH CHECK
	// ================

	router.get('/health', async (_req: express.Request, res: express.Response) => {
		const temp = await ctx.db
			.selectFrom('post')
			.select(({ fn }) => fn.countAll().as('num_posts'))
			.executeTakeFirst()
		console.log(`✅ health check | post count: ${temp?.num_posts ?? 0}`)
		res.sendStatus(200)
	})

	// ================
	// DATABASE ROUTES
	// ================

	// PRINT ALL DB POSTS
	router.get('/db/print', async (_req: express.Request, res: express.Response) => {
		const posts = await ctx.db.selectFrom('post').selectAll().orderBy('indexedAt', 'desc').execute()
		console.log(`📙 /list posts`)
		for (const post of posts) {
			console.log(`   - ${post.uri} (${post.indexedAt})`)
		}
		console.log(`📙 end/list`)
		return res.json(posts)
	})

	// LIST DB CURSOR STATE
	router.get('/db/state', async (_req: express.Request, res: express.Response) => {
		await ctx.db
			.selectFrom('sub_state')
			.selectAll()
			.execute()
			.then(state => {
				res.json(state)
			})
	})

	// ================
	// REDIS ROUTES
	// ================

	// LIST ALL REDIS POSTS
	router.get('/redis', async (_req: express.Request, res: express.Response) => {
		try {
			const data = await redis.hgetall(RedisKeys.ShawnBotPost)
			if (!data) {
				return res.json({ redis: [] })
			}
			const dataArray = Object.values(data)
			dataArray.sort((a: any, b: any) => new Date(b.indexedAt).getTime() - new Date(a.indexedAt).getTime())
			res.json({ length: dataArray.length, redis: dataArray })
		} catch (error) {
			console.log('error', error)
			res.json({ error })
		}
	})

	// ================
	// TEST
	// ================

	router.get('/backfill/spoilers', checkKey, async (req: express.Request, res: express.Response) => {
		try {
			const limit = req.query.limit ? parseInt(req.query.limit as string) : 10
			const searchData: OutputSchema | null = await getSpoilerPosts(req.query.cursor as string, limit)

			const spoilerPosts: any[] = []
			const fetchedRecords: any[] = []

			if (!searchData) {
				return res.json({ error: 'no search data' })
			}

			// Check for facets
			searchData.posts.forEach(post => {
				const record = post?.record as Record
				const hasSpoilerTag = record?.facets
					? record.facets.some(facet => {
							return facet.features.some(f => {
								if (f.$type !== 'app.bsky.richtext.facet#tag') return false
								const wow = f as { tag: string }
								return wow.tag?.toLowerCase().includes('spoiler')
							})
					  })
					: false
				if (hasSpoilerTag) {
					// spoilerPosts.push({ uri: post.uri, cid: post.cid })
					spoilerPosts.push(post)
				}
			})

			for (const post of spoilerPosts) {
				// const modRecord = await getModRecord({ uri: post.uri, cid: post.cid })

				// if (!modRecord || !modRecord.success) continue

				// fetchedRecords.push(modRecord.data)

				// if (
				// 	modRecord.data?.labels?.some(label => {
				// 		return label.val === 'spoiler' && label.src === process.env.MOD_BSKY_USERNAME
				// 	})
				// ) {
				// 	console.log('already labeled as spoiler', modRecord.data.cid)
				// 	continue
				// } else {
				// 	console.log('labeling as spoiler', modRecord.data.cid)
				// 	// await labelPostAsSpoiler({ uri: post.uri, cid: post.cid })
				// }
				await labelPostAsSpoiler({ uri: post.uri, cid: post.cid })
			}

			res.json({ fetchedRecords, spoilerPosts, count: spoilerPosts.length, searchData })
		} catch (error) {
			console.log('search error', error)
			res.json({ error })
		}
	})

	return router
}
export default makeRouter
