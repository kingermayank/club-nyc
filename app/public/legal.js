// The Cookie Policy's "Your Choice" box (cookies.html#choices): shows what this browser chose about the optional
// analytics and changes it. It reads and writes the same record as the landing page's banner (app/src/consent.ts):
// localStorage "club-nyc:consent" = {"v":1,"analytics":true|false,"at":<ms>}, asked again after a year.
;(() => {
  const KEY = 'club-nyc:consent'
  const YEAR = 365 * 86400000
  const box = document.querySelector('[data-consent-box]')
  if (!box) return
  const status = box.querySelector('[data-consent-status]')
  const actions = box.querySelector('[data-consent-actions]')
  const gpc = navigator.globalPrivacyControl === true

  function read() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) || 'null')
      return s && s.v === 1 && typeof s.analytics === 'boolean' && Date.now() - s.at < YEAR ? s : null
    } catch {
      return null
    }
  }
  function render(saved) {
    const s = read()
    let text
    if (s) text = s.analytics ? 'Analytics are on: you chose Allow Analytics.' : 'Analytics are off: you chose Necessary Only.'
    else if (gpc) text = 'Analytics are off: your browser sends Global Privacy Control.'
    else text = 'You haven’t chosen yet, so analytics are off.'
    status.textContent = saved ? `Saved. ${text}` : text
    for (const b of actions.querySelectorAll('button')) b.setAttribute('aria-pressed', String(!!s && s.analytics === (b.dataset.analytics === 'yes')))
  }
  for (const b of actions.querySelectorAll('button'))
    b.addEventListener('click', () => {
      try {
        localStorage.setItem(KEY, JSON.stringify({ v: 1, analytics: b.dataset.analytics === 'yes', at: Date.now() }))
        // "no" also forgets this tab's visit number
        if (b.dataset.analytics !== 'yes') sessionStorage.removeItem('club-nyc:session')
      } catch {
        status.textContent = 'Your browser is blocking this site’s storage, so analytics stay off.'
        return
      }
      render(true)
    })
  actions.hidden = false
  render(false)
})()
