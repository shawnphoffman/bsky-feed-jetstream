export type Post = {
	uri: string
	cid: string
	replyParent: string | null
	replyRoot: string | null
	indexedAt: string
}

export const addToStarWarsFeed = async (post: Post) => {
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
