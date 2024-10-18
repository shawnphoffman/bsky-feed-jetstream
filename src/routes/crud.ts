import bodyParser from 'body-parser'
import cors from 'cors'
import path from 'path'
import express from 'express'

import { Post } from '../db/schema'
import { AppContext } from '../types/config'
import { maybeStr } from '../util/environment'

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

	// Add this endpoint to the makeRouter function
	router.get('/db/download', async (_req: express.Request, res: express.Response) => {
		const sqlPath = maybeStr(process.env.FEEDGEN_SQLITE_LOCATION)
		if (!sqlPath) {
			console.error('No SQLite path configured')
			return res.status(500).send('Internal Server Error')
		}
		const dbPath = sqlPath.includes('app') ? sqlPath : path.resolve(__dirname, `../../${sqlPath}`)

		res.download(dbPath, 'database.sqlite', err => {
			if (err) {
				console.error('Error downloading the file:', err)
				res.status(500).send('Internal Server Error')
			}
		})
	})

	// Add this endpoint to dump posts as CSV
	router.get('/posts/csv', async (_req: express.Request, res: express.Response) => {
		const posts = await ctx.db.selectFrom('post').selectAll().orderBy('indexedAt', 'desc').execute()
		const csvHeaders = 'cid,uri,indexedAt\n'
		const csvRows = posts.map(post => `${post.cid},${post.uri},${post.indexedAt}`).join('\n')
		const csvData = csvHeaders + csvRows

		res.header('Content-Type', 'text/csv')
		res.attachment('posts.csv')
		res.send(csvData)
	})

	// Add this endpoint to remove posts older than 3 months
	router.delete('/posts/old', checkKey, async (_req: express.Request, res: express.Response) => {
		const threeMonthsAgo = new Date()
		threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)

		const count = await ctx.db.deleteFrom('post').where('post.indexedAt', '<', threeMonthsAgo.toISOString()).execute()
		return res.send(`Deleted ${count} posts`)
	})

	return router
}
export default makeRouter
