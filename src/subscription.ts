import {
  OutputSchema as RepoEvent,
  isCommit,
} from './lexicon/types/com/atproto/sync/subscribeRepos'
import { FirehoseSubscriptionBase, getOpsByType } from './util/subscription'

export class FirehoseSubscription extends FirehoseSubscriptionBase {
  async handleEvent(evt: RepoEvent) {
    if (!isCommit(evt)) return
    const ops = await getOpsByType(evt)

    // This logs the text of every post off the firehose.
    // Just for fun :)
    // Delete before actually using
    for (const post of ops.posts.creates) {
      // console.log(`$: ${post.record.text}`)
      if (post.author === process.env.FEEDGEN_PUBLISHER_DID) {
        // console.log(`+CREATE+`, post)
        console.log(`${post.author}: "${post.record.text}" [${post.uri}]`)
      }
    }

    // for (const post of ops.posts.deletes) {
    //   if (
    //     post.uri ===
    //     'at://did:plc:urx3a5yigiv7huqo7odvoapt/app.bsky.feed.post/3k2ocez5njj2r'
    //   ) {
    //     console.log(`-DELETE-`, post)
    //   }
    // }

    const postsToDelete = ops.posts.deletes.map((del) => del.uri)
    const postsToCreate = ops.posts.creates
      .filter((create) => {
        // only alf-related posts
        // return create.record.text.toLowerCase().includes('shawn')
        return create.author === process.env.FEEDGEN_PUBLISHER_DID
      })
      .map((create) => {
        // map alf-related posts to a db row
        return {
          uri: create.uri,
          cid: create.cid,
          replyParent: create.record?.reply?.parent.uri ?? null,
          replyRoot: create.record?.reply?.root.uri ?? null,
          indexedAt: new Date().toISOString(),
        }
      })

    if (postsToDelete.length > 0) {
      await this.db
        .deleteFrom('post')
        .where('uri', 'in', postsToDelete)
        .execute()
    }
    if (postsToCreate.length > 0) {
      await this.db
        .insertInto('post')
        .values(postsToCreate)
        .onConflict((oc) => oc.doNothing())
        .execute()
    }
  }
}
