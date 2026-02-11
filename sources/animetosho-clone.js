import AbstractSource from './abstract.js'

const BASE_URL = 'https://kemotoshoapi.xive.cc'
const QUALITIES = ['2160', '1080', '720', '540', '480']

function magnetToInfoHashHex(magnet) {
  if (!magnet) return ''
  const match = magnet.match(/xt=urn:btih:([a-zA-Z0-9]+)/)
  if (!match) return ''
  const raw = match[1]
  if (raw.length === 40 && /^[0-9a-fA-F]+$/.test(raw)) return raw.toLowerCase()
  if (raw.length === 32) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
    let bits = 0
    let value = 0
    const bytes = []
    for (const c of raw.toUpperCase()) {
      const idx = alphabet.indexOf(c)
      if (idx < 0) continue
      value = (value << 5) | idx
      bits += 5
      if (bits >= 8) {
        bits -= 8
        bytes.push((value >> bits) & 0xff)
      }
    }
    if (bytes.length === 20) return bytes.map((b) => b.toString(16).padStart(2, '0')).join('')
  }
  return ''
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
      ({ id, name, magnet, size, size_str, upload_date, source_url, seeders = 0, leechers = 0, info_hash, anidb_aid, anidb_eid, anidb_fid }) => ({
        title: name,
        link: magnet || source_url || '',
        id,
        seeders: Math.min(seeders || 0, 29999),
        leechers: Math.min(leechers || 0, 29999),
        downloads: 0,
        accuracy: anidb_fid ? 'high' : 'medium',
        type: batch ? 'batch' : undefined,
        hash: info_hash || magnetToInfoHashHex(magnet),
        size: size || 0,
        date: upload_date ? new Date(upload_date) : new Date(),
      })
    )
  }

  async #query(searchString, { resolution, exclusions, episodeCount, anidbAid }) {
    const params = new URLSearchParams({ per_page: '100' })
    if (anidbAid) {
      params.set('anidb_aid', String(anidbAid))
    }
    if (searchString) {
      params.set('search', searchString)
    }
    const url = `${BASE_URL}/api/torrents/?${params.toString()}`
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

  async single({ titles, resolution, exclusions, anidbAid }) {
    if (!titles?.length && !anidbAid) throw new Error('No titles provided')
    const search = this.#buildSearchString(titles || [], exclusions)
    return this.#query(search, { resolution, exclusions, anidbAid })
  }

  async batch({ titles, resolution, episodeCount, exclusions, anidbAid }) {
    if (!titles?.length && !anidbAid) throw new Error('No titles provided')
    const search = this.#buildSearchString(titles || [], exclusions)
    return this.#query(search, { resolution, exclusions, episodeCount, anidbAid }, true)
  }

  async movie({ titles, resolution, exclusions, anidbAid }) {
    if (!titles?.length && !anidbAid) throw new Error('No titles provided')
    const search = this.#buildSearchString(titles || [], exclusions)
    return this.#query(search, { resolution, exclusions, anidbAid })
  }

  async validate() {
    return (await fetch(`${BASE_URL}/api/torrents/?per_page=1`))?.ok
  }
})()
