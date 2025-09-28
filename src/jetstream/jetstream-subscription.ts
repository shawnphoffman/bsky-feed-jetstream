import { Record as PostRecord } from '@atproto/bsky/src/lexicon/types/app/bsky/feed/post'
import { Record as RepostRecord } from '@atproto/bsky/src/lexicon/types/app/bsky/feed/repost'
import { hasProp, isObj } from '@atproto/lexicon'
import { Subscription } from '@atproto/xrpc-server'
import { WebSocketKeepAlive } from '@atproto/xrpc-server/src/stream/websocket-keepalive'
import { ids } from '@atproto/bsky/src/lexicon/lexicons'

import { Database } from '../db' // This is the standard DB class from bluesky-social/feed-generator

export abstract class JetstreamFirehoseSubscriptionBase {
	public sub: JetstreamSubscription
	public db: Database

	constructor(public service: string = 'wss://jetstream1.us-west.bsky.network', db: Database) {
		this.db = db

		this.sub = new JetstreamSubscription({
			service: service,
			method: 'subscribe',
			getParams: async () => ({
				cursor: await this.getCursor(),
				wantedCollections: [ids.AppBskyFeedPost, ids.AppBskyFeedRepost],
				// wantedCollections: [ids.AppBskyFeedPost],
			}),
			validate: (value: unknown) => {
				return value
				// try {
				// 	return value as JetstreamPost // TODO validate??
				// } catch (err) {
				// 	console.error('repo subscription skipped invalid message', err)
				// }
			},
		})
	}

	abstract handleEvent(evt: JetstreamEvent): Promise<void>

	async run(subscriptionReconnectDelay: number) {
		let i = 0
		try {
			for await (const evt of this.sub) {
				this.handleEvent(evt as JetstreamEvent)
				i++
				const mod = i % 1000 === 0
				// update stored cursor every 100 events or so
				if (isJetstreamCommit(evt) && mod) {
					// console.log('🛩️ Updating cursor', { i, evt })
					console.log('🛩️ Updating cursor', evt.time_us)
					await this.updateCursor(evt.time_us)
					i = 0
				} else {
					// console.log('🛩️ Skipping cursor update', { i, evt })
				}
			}
		} catch (err) {
			console.error('repo subscription errored', err)
			setTimeout(() => this.run(subscriptionReconnectDelay), subscriptionReconnectDelay)
		}
	}

	async updateCursor(cursor: number) {
		const state = await this.db.selectFrom('sub_state').select(['service', 'cursor']).where('service', '=', this.service).executeTakeFirst()

		if (state) {
			await this.db.updateTable('sub_state').set({ cursor }).where('service', '=', this.service).execute()
		} else {
			await this.db.insertInto('sub_state').values({ cursor, service: this.service }).execute()
		}
		// console.log('🛩️ Updating cursor', {db:this.db,cursor})
		// await this.db.updateTable('sub_state').set({ cursor }).where('service', '=', this.service).execute()
	}

	async getCursor(): Promise<number | undefined> {
		if (process.env.OVERRIDE_CURSOR) {
			console.log('🛩️ Using cursor override', process.env.OVERRIDE_CURSOR)
			const temp = parseInt(process.env.OVERRIDE_CURSOR as string)
			return isNaN(temp) ? undefined : temp
		}
		// TODO Implement cursor disable
		const res = await this.db.selectFrom('sub_state').selectAll().where('service', '=', this.service).executeTakeFirst()
		// console.log('🛩️ Getting cursor', res?.cursor)
		if (res?.cursor) {
			return res.cursor
		}
		return undefined

		// return res?.cursor || process.env.CURSOR_OVERRIDE ? parseInt(process.env.CURSOR_OVERRIDE as string) : undefined
	}
}
export function isJetstreamCommit(v: unknown): v is JetstreamEvent {
	return isObj(v) && hasProp(v, 'kind') && v.kind === 'commit'
}

export interface JetstreamEvent {
	did: string
	time_us: number
	// type: string
	kind: string
	commit: JetstreamCommit
}

export interface JetstreamCommit {
	operation: string
	rev: string
	// type: string
	collection: string
	rkey: string
	record: JetstreamRecord
	cid: string
}

export type JetstreamRecord = JetstreamPost & JetstreamRepost

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface JetstreamPost extends PostRecord {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface JetstreamRepost extends RepostRecord {}

export interface JetstreamSubject {
	cid: string
	uri: string
}

class JetstreamSubscription<T = unknown> extends Subscription {
	async *[Symbol.asyncIterator](): AsyncGenerator<T> {
		const ws = new WebSocketKeepAlive({
			...this.opts,
			getUrl: async () => {
				const params = (await this.opts.getParams?.()) ?? {}

				const JETSTREAM_OVERRIDE = process.env.JETSTREAM_OVERRIDE
				if (JETSTREAM_OVERRIDE) {
					const query = encodeQueryParams({ cursor: params.cursor })
					console.log(`${JETSTREAM_OVERRIDE}${query ? `?${query}` : ''}`)
					return `${JETSTREAM_OVERRIDE}${query ? `?${query}` : ''}`
				}

				// console.log('🔗', params)
				const query = encodeQueryParams(params)
				console.log(`${this.opts.service}/${this.opts.method}?${query}`)
				return `${this.opts.service}/${this.opts.method}?${query}`
			},
		})
		for await (const chunk of ws) {
			try {
				const record = JSON.parse(Buffer.from(chunk).toString())
				// console.log('📦', record)
				yield record
			} catch (e) {
				console.error(e)
			}
		}
	}
}

function encodeQueryParams(obj: Record<string, unknown>): string {
	const params = new URLSearchParams()
	Object.entries(obj).forEach(([key, value]) => {
		const encoded = encodeQueryParam(value)
		if (Array.isArray(encoded)) {
			encoded.forEach(enc => params.append(key, enc))
		} else if (encoded !== '') {
			params.set(key, encoded)
		}
	})
	return params.toString()
}

// Adapted from xrpc, but without any lex-specific knowledge
function encodeQueryParam(value: unknown): string | string[] {
	if (typeof value === 'string') {
		return value
	}
	if (typeof value === 'number') {
		return value.toString()
	}
	if (typeof value === 'boolean') {
		return value ? 'true' : 'false'
	}
	if (typeof value === 'undefined') {
		return ''
	}
	if (typeof value === 'object') {
		if (value instanceof Date) {
			return value.toISOString()
		} else if (Array.isArray(value)) {
			return value.flatMap(encodeQueryParam)
		} else if (!value) {
			return ''
		}
	}
	throw new Error(`Cannot encode ${typeof value}s into query params`)
}

// export const getJetstreamOpsByType = (evt: JetstreamEvent): OperationsByType => {
// 	const opsByType: OperationsByType = {
// 		posts: [],
// 		reposts: [],
// 	}

// if (evt?.commit?.collection === 'app.bsky.feed.post' && evt?.commit?.operation === 'create' && evt?.commit?.record) {
// 	opsByType.posts.push(evt)
// }

// 	if (evt?.commit?.collection === ids.AppBskyFeedRepost && evt?.commit?.type === 'c' && evt?.commit?.record) {
// 		opsByType.reposts.push(evt)
// 	}

// 	return opsByType
// }

// type OperationsByType = {
// 	posts: JetstreamEvent[]
// 	reposts: JetstreamEvent[]
// }
