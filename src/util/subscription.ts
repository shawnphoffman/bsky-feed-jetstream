import { AppBskyFeedPost } from '@atproto/api'
import { AppBskyFeedRepost } from '@atproto/api'
import { AppBskyFeedLike } from '@atproto/api'
import { AppBskyGraphFollow } from '@atproto/api'
import { ComAtprotoSyncSubscribeRepos } from '@atproto/api'
import { ids, lexicons } from '@atproto/bsky/src/lexicon/lexicons'
import { BlobRef } from '@atproto/lexicon'
import { cborToLexRecord, readCar } from '@atproto/repo'
import { Subscription } from '@atproto/xrpc-server'
import io from '@pm2/io'

import { Database } from '../db'

const cursor = io.metric({
	name: 'Firehose Cursor',
	id: 'feed/subscription/cursor',
})
const invalidMessages = io.counter({
	name: 'Invalid Messages',
	id: 'feed/subscription/invalid_messages',
})
const subStarts = io.counter({
	name: 'Subscription Starts',
	id: 'feed/subscription/starts',
})
const subErrors = io.counter({
	name: 'Subscription Errors',
	id: 'feed/subscription/errors',
})
const cantHandles = io.counter({
	name: 'Unhandled Messages',
	id: 'feed/subscription/cantHandles',
})

export abstract class FirehoseSubscriptionBase {
	public sub: Subscription<ComAtprotoSyncSubscribeRepos.Commit>

	constructor(public db: Database, public service: string) {
		this.sub = new Subscription({
			service: service,
			method: ids.ComAtprotoSyncSubscribeRepos,
			getParams: () => this.getCursor(),
			validate: (value: unknown) => {
				try {
					return lexicons.assertValidXrpcMessage<ComAtprotoSyncSubscribeRepos.Commit>(ids.ComAtprotoSyncSubscribeRepos, value)
				} catch (err) {
					invalidMessages.inc()
					console.error('🟠 repo subscription skipped invalid message', err.message)
				}
			},
		})
	}

	abstract handleEvent(evt: ComAtprotoSyncSubscribeRepos.Commit): Promise<void>

	async run(subscriptionReconnectDelay: number) {
		console.log('')
		console.log('🟢 repo subscription started...')
		subStarts.inc()
		try {
			for await (const evt of this.sub) {
				try {
					await this.handleEvent(evt)
				} catch (err) {
					if (!err.message?.includes('decode varint')) {
						console.error('🟡 repo subscription could not handle message', err)
						cantHandles.inc()
					}
				}
				// update stored cursor every 20 events or so
				if (ComAtprotoSyncSubscribeRepos.isCommit(evt) && evt.seq % 1000 === 0) {
					cursor.set(evt.seq)
					await this.upsertCursor(evt.seq)
				}
			}
		} catch (err) {
			console.error('🔴 repo subscription errored', err)
			subErrors.inc()
			setTimeout(() => this.run(subscriptionReconnectDelay), subscriptionReconnectDelay)
		}
	}

	async upsertCursor(cursor: number = 0, service: string = this.service) {
		const state = await this.db.selectFrom('sub_state').select(['service', 'cursor']).where('service', '=', service).executeTakeFirst()

		if (state) {
			await this.db.updateTable('sub_state').set({ cursor }).where('service', '=', service).execute()
		} else {
			await this.db.insertInto('sub_state').values({ cursor, service }).execute()
		}
	}

	async getCursor(): Promise<{ cursor?: number }> {
		const res = await this.db.selectFrom('sub_state').select('cursor').where('service', '=', this.service).executeTakeFirst()
		if (process.env.DISABLE_CURSOR === 'true') {
			console.log('🐀 ignoring cursor')
			return { cursor: process.env.OVERRIDE_CURSOR ? parseInt(process.env.OVERRIDE_CURSOR) : undefined }
		} else {
			console.log(`🐁 using cursor: ${res?.cursor || 'unknown'}`)
		}
		return res ? { cursor: res.cursor } : {}
	}
}

export const getOpsByType = async (evt: ComAtprotoSyncSubscribeRepos.Commit): Promise<OperationsByType> => {
	const car = await readCar(evt.blocks)
	const opsByType: OperationsByType = {
		posts: { creates: [], deletes: [] },
		reposts: { creates: [], deletes: [] },
		likes: { creates: [], deletes: [] },
		follows: { creates: [], deletes: [] },
	}

	for (const op of evt.ops) {
		const uri = `at://${evt.repo}/${op.path}`
		const [collection] = op.path.split('/')

		if (op.action === 'update') continue // updates not supported yet

		if (op.action === 'create') {
			if (!op.cid) continue
			const recordBytes = car.blocks.get(op.cid)
			if (!recordBytes) continue
			const record = cborToLexRecord(recordBytes)
			const create = { uri, cid: op.cid.toString(), author: evt.repo }
			if (collection === ids.AppBskyFeedPost && isPost(record)) {
				opsByType.posts.creates.push({ record, ...create })
			} else if (collection === ids.AppBskyFeedRepost && isRepost(record)) {
				opsByType.reposts.creates.push({ record, ...create })
			} else if (collection === ids.AppBskyFeedLike && isLike(record)) {
				opsByType.likes.creates.push({ record, ...create })
			} else if (collection === ids.AppBskyGraphFollow && isFollow(record)) {
				opsByType.follows.creates.push({ record, ...create })
			}
		}

		if (op.action === 'delete') {
			if (collection === ids.AppBskyFeedPost) {
				opsByType.posts.deletes.push({ uri })
			} else if (collection === ids.AppBskyFeedRepost) {
				opsByType.reposts.deletes.push({ uri })
			} else if (collection === ids.AppBskyFeedLike) {
				opsByType.likes.deletes.push({ uri })
			} else if (collection === ids.AppBskyGraphFollow) {
				opsByType.follows.deletes.push({ uri })
			}
		}
	}

	return opsByType
}

type OperationsByType = {
	posts: Operations<AppBskyFeedPost.Record>
	reposts: Operations<AppBskyFeedRepost.Record>
	likes: Operations<AppBskyFeedLike.Record>
	follows: Operations<AppBskyGraphFollow.Record>
}

type Operations<T = Record<string, unknown>> = {
	creates: CreateOp<T>[]
	deletes: DeleteOp[]
}

type CreateOp<T> = {
	uri: string
	cid: string
	author: string
	record: T
}

type DeleteOp = {
	uri: string
}

export const isPost = (obj: unknown): obj is AppBskyFeedPost.Record => {
	return isType(obj, ids.AppBskyFeedPost)
}

export const isRepost = (obj: unknown): obj is AppBskyFeedRepost.Record => {
	return isType(obj, ids.AppBskyFeedRepost)
}

export const isLike = (obj: unknown): obj is AppBskyFeedLike.Record => {
	return isType(obj, ids.AppBskyFeedLike)
}

export const isFollow = (obj: unknown): obj is AppBskyGraphFollow.Record => {
	return isType(obj, ids.AppBskyGraphFollow)
}

const isType = (obj: unknown, nsid: string) => {
	try {
		lexicons.assertValidRecord(nsid, fixBlobRefs(obj))
		return true
	} catch (err) {
		return false
	}
}

// NOTE right now record validation fails on BlobRefs
// simply because multiple packages have their own copy
// of the BlobRef class, causing instanceof checks to fail.
// This is a temporary solution.
const fixBlobRefs = (obj: unknown): unknown => {
	if (Array.isArray(obj)) {
		return obj.map(fixBlobRefs)
	}
	if (obj && typeof obj === 'object') {
		if (obj.constructor.name === 'BlobRef') {
			const blob = obj as BlobRef
			return new BlobRef(blob.ref, blob.mimeType, blob.size, blob.original)
		}
		return Object.entries(obj).reduce((acc, [key, val]) => {
			return Object.assign(acc, { [key]: fixBlobRefs(val) })
		}, {} as Record<string, unknown>)
	}
	return obj
}
