addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  const hostname = url.hostname
  
  // Check if it's a WebSocket upgrade request
  if (request.headers.get('Upgrade') === 'websocket') {
    return fetch(request)
  }

  // If it's the main domain, proxy to Vercel
  if (hostname === 'hyperframe.computer') {
    return fetch(request)
  }

  // Check if it's a valid subdomain
  const subdomain = hostname.replace('.hyperframe.computer', '')
  if (/^[a-z]+-[a-z]+$/.test(subdomain)) {
    return fetch(request)
  }

  // Invalid subdomain, redirect to main site
  return Response.redirect('https://hyperframe.computer', 302)
} 