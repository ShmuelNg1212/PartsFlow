// Existing assets are served before this handler. Only unmatched routes reach it.
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    const isFile = /^\/(assets|samples)(\/|$)/.test(url.pathname) || /\/[^/]*\.[^/]+$/.test(url.pathname)
    if (!['GET', 'HEAD'].includes(request.method) || isFile) {
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
    }
    url.pathname = '/'
    url.search = ''
    return env.ASSETS.fetch(new Request(url, request))
  },
}
