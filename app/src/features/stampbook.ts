import { sfx } from '../audio'
import { save } from '../state'
import { el } from '../engine/stage'
import { openOverlay, closeButton } from '../engine/ui'
import { STAMPS } from '../data/stamps'

/** Club Penguin's stamp book: a leather-bound passport of everything you've done. */
export function openStampBook() {
  const book = el('div', 'stamp-book')
  const entries = Object.entries(STAMPS)
  const got = entries.filter(([id]) => save.stamps.includes(id)).length
  const pages = [
    { title: 'Around Town', tier: 1 },
    { title: 'Explorer', tier: 2 },
    { title: 'Experts', tier: 3 },
  ]
  let page = 0
  const render = () => {
    const p = pages[page]
    const list = entries.filter(([, s]) => s.tier === p.tier)
    book.innerHTML = `
      <div class="sb-cover">
        <div class="sb-emblem">★</div>
        <div class="sb-title">Stamp Book</div>
        <div class="sb-owner">${save.name}</div>
        <div class="sb-count"><b>${got}</b> / ${entries.length} stamps</div>
        <div class="sb-bar"><i style="width:${(got / entries.length) * 100}%"></i></div>
        <small>Every 5 stamps earns 25 coins.</small>
      </div>
      <div class="sb-page">
        <h3>${p.title}</h3>
        <div class="sb-grid">${list
          .map(([id, s]) => {
            const has = save.stamps.includes(id)
            return `<div class="sb-stamp ${has ? 'got' : ''} t${s.tier}" title="${s.desc}"><div class="sb-ink">${has ? s.icon : '?'}</div><b>${has ? s.name : '???'}</b><small>${s.desc}</small></div>`
          })
          .join('')}</div>
        <div class="sb-tabs">${pages.map((pp, i) => `<button class="sb-tab ${i === page ? 'on' : ''}" data-i="${i}">${pp.title}</button>`).join('')}</div>
      </div>`
    book.querySelectorAll<HTMLButtonElement>('.sb-tab').forEach((b) => {
      b.onclick = () => {
        sfx.whoosh()
        page = +b.dataset.i!
        render()
      }
    })
    book.append(closeButton())
  }
  render()
  sfx.whoosh()
  openOverlay(book)
}
