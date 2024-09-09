import bodyParser from 'body-parser'
import cors from 'cors'
import express from 'express'

import { Post } from '../db/schema'
import { AppContext } from '../types/config'

const jsonParser = bodyParser.json()

// ================
// KEY CHECK SHIT
// ================
export const checkKey = function (req: express.Request, res: express.Response, next: express.NextFunction) {
	console.log('🔑🔑 CHECKING KEY 🔑🔑')
	const key = req.headers['x-force-key']
	if (process.env.FORCE_KEY !== key) {
		console.warn('🚫🚫 INVALID OR MISSING KEY 🚫🚫')
		return res.status(403).send('Forbidden')
	}
	next()
}

const makeRouter = (ctx: AppContext) => {
	const router = express.Router()

	router.use(cors())

	// ================
	// CRUD
	// ================

	router.get('/posts', checkKey, async (_req: express.Request, res: express.Response) => {
		const posts = await ctx.db.selectFrom('post').selectAll().orderBy('indexedAt', 'desc').execute()
		return res.json(posts)
	})

	router.post('/posts', [jsonParser, checkKey], async (req: express.Request, res: express.Response) => {
		if (!req.body) {
			return res.status(400).send('Bad Request')
		}
		const { cid, uri, indexedAt } = req.body

		if (!cid || !uri || !indexedAt) {
			return res.status(400).send('Bad Request')
		}

		console.log('Adding post', req.body)
		const post: Post = req.body
		const resp = await ctx.db
			.insertInto('post')
			.values(post)
			.returningAll()
			.onConflict(oc => oc.doNothing())
			.execute()
		return res.json(resp)
	})

	router.delete('/posts/:cid', checkKey, async (req: express.Request, res: express.Response) => {
		await ctx.db.deleteFrom('post').where('post.cid', '=', req.params.cid).execute()
		return res.sendStatus(200)
	})

	return router
}
export default makeRouter
