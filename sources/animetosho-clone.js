import AbstractSource from './abstract.js'

const BASE_URL = 'http://localhost:8002'
const QUALITIES = ['2160', '1080', '720', '540', '480']

function extractHashFromMagnet(magnet) {
  if (!magnet) return ''
  const match = magnet.match(/xt=urn:btih:([a-zA-Z0-9]+)/)
  return match ? match[1] : ''
}

function matchesExclusions(name, exclusions) {
  if (!exclusions?.length) return false
  const lower = name.toLowerCase()
  return exclusions.some((e) => lower.includes(String(e).toLowerCase()))
}

function matchesResolution(name, resolution) {
  if (!resolution) return true
  const hasOurs = new RegExp(`\\b${resolution}p?\\b`, 'i').test(name)
  const others = QUALITIES.filter((q) => q !== resolution)
  const hasOther = others.some((q) => new RegExp(`\\b${q}p?\\b`, 'i').test(name))
  return hasOurs || !hasOther
}

export default new (class AnimeToshoClone extends AbstractSource {
  #buildSearchString(titles, exclusions) {
    const parts = titles && titles.length ? [titles[0]] : []
    if (exclusions?.length) {
      parts.push(...exclusions.map((e) => `-${e}`))
    }
    return parts.join(' ')
  }

  #map(entries, batch = false) {
    return entries.map(
      ({ id, name, magnet, size, size_str, upload_date, source_url, seeders = 0, leechers = 0 }) => ({
        title: name,
        link: magnet || source_url || '',
        id,
        seeders: Math.min(seeders || 0, 29999),
        leechers: Math.min(leechers || 0, 29999),
        downloads: 0,
        accuracy: 'medium',
        type: batch ? 'batch' : undefined,
        hash: extractHashFromMagnet(magnet),
        size: size || 0,
        date: upload_date ? new Date(upload_date) : new Date(),
      })
    )
  }

  async #query(searchString, { resolution, exclusions, episodeCount }) {
    const url = `${BASE_URL}/api/torrents/?search=${encodeURIComponent(searchString)}&per_page=100`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    let filtered = data
    if (Array.isArray(data)) {
      filtered = data.filter((t) => {
        if (matchesExclusions(t.name, exclusions)) return false
        if (resolution && !matchesResolution(t.name, resolution)) return false
        if (episodeCount != null && episodeCount > 1 && t.size && t.size < 500000000) return false
        return true
      })
    }
    return filtered.length ? this.#map(!episodeCount ? filtered : filtered.filter((t) => (t.file_count || 0) > 1)) : []
  }

  async single({ titles, resolution, exclusions }) {
    if (!titles?.length) throw new Error('No titles provided')
    const search = this.#buildSearchString(titles, exclusions)
    return this.#query(search, { resolution, exclusions })
  }

  async batch({ titles, resolution, episodeCount, exclusions }) {
    if (!titles?.length) throw new Error('No titles provided')
    const search = this.#buildSearchString(titles, exclusions)
    return this.#query(search, { resolution, exclusions, episodeCount }, true)
  }

  async movie({ titles, resolution, exclusions }) {
    if (!titles?.length) throw new Error('No titles provided')
    const search = this.#buildSearchString(titles, exclusions)
    return this.#query(search, { resolution, exclusions })
  }

  async validate() {
    return (await fetch(`${BASE_URL}/api/torrents/?per_page=1`))?.ok
  }
})()
