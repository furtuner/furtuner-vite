import { useState, useRef, useEffect } from 'react'
import { Analytics } from '@vercel/analytics/react'
import DogDietCalculator from './components/DogDietCalculator'
import FAQSection from './components/FAQSection'
import './page.css'

// ─── Mobile-test view, same gate as DogDietCalculator.tsx ────────────────
// Same secret + breakpoint as the calculator's useMobileTestView, so both
// activate together under the same ?testmode=... URL. Real visitors,
// including real phones without the secret, see the current layout
// completely unchanged.
const MOBILE_TEST_SECRET = "7d2132eae669";
const MOBILE_TEST_BREAKPOINT = 640;

function useMobileTestView(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const hasSecret =
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("testmode") === MOBILE_TEST_SECRET;
    if (!hasSecret) return;

    const check = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      // Same landscape-phone coverage as DogDietCalculator.tsx's copy of
      // this hook — keep both in sync.
      setIsMobile(w <= MOBILE_TEST_BREAKPOINT || (h <= 500 && w <= 930));
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

// ─── Diet comparison data ─────────────────────────────────────────────────
// Mirrors the hardcoded desktop comparison-wrap content below exactly.
// Used only by the mobile per-diet 2-column tables (see DIET_PLANS render),
// so the existing desktop markup didn't need to be touched.
const COMPARISON_FEATURES = [
  'Protein Content (%)',
  'Carbohydrate Level',
  'Cereal Grains',
  'Vegetables',
  'Human-Grade Ingredients',
  'Nutritional Balance',
  'Vitamin/Mineral Supplements',
]

const DIET_PLANS = [
  {
    id: '1',
    label: 'Conventional Diet',
    icon: '/images/diet-conventional.svg',
    alt: 'Conventional diet icon',
    values: [
      <>&gt;30% (Dog)<br />&gt;45% (Cat)</>,
      'Moderate',
      'Included',
      'Included',
      '100% Human-Grade',
      'Meets AAFCO standards',
      'No synthetic vitamin/mineral premix required',
    ],
  },
  {
    id: '2',
    label: 'Grain-Free Diet',
    icon: '/images/diet-grain.svg',
    alt: 'Grain-Free diet icon',
    values: [
      <>&gt;30% (Dog)<br />&gt;45% (Cat)</>,
      'Moderate',
      'Not Included',
      'Included',
      '100% Human-Grade',
      'Meets AAFCO standards',
      'No synthetic vitamin/mineral premix required',
    ],
  },
  {
    id: '3',
    label: 'Meat-Based Diet',
    icon: '/images/diet-meat.svg',
    alt: 'Meat-Based diet icon',
    values: [
      <>&gt;50% (Dog)<br />&gt;60% (Cat)</>,
      'Very Low',
      'Not Included',
      'Included (minimal amounts)',
      '100% Human-Grade',
      'Meets AAFCO standards',
      'No synthetic vitamin/mineral premix required',
    ],
  },
]

// ─── Mobile test view: home page styles + card content ───────────────────
// Only injected when isMobileTest is true (same ?testmode gate as everything
// else), so real visitors keep the current layout completely unchanged.
const HOME_MOBILE_CSS = `
.navbar { padding: 10px 16px !important; align-items: center !important; }
.nav-logo, .nav-logo-img { height: 44px !important; }
.nav-hamburger { display: flex !important; }
.nav-links {
  display: none; position: absolute; top: 100%; left: 0; right: 0;
  flex-direction: column; align-items: stretch; align-self: auto; gap: 0; margin-left: 0;
  padding: 4px 16px 12px; background: #E8F5FF; border-bottom: 1px solid #D6E6F2;
  box-shadow: 0 12px 24px rgba(20, 60, 111, 0.12);
}
.nav-links.nav-links--open { display: flex; }
.nav-link { font-size: 20px; padding: 13px 0; border-bottom: 1px solid #D6E6F2; line-height: 1.2; }
.nav-links .nav-link:last-child { border-bottom: 0; }
#calculator { scroll-margin-top: 80px; }

.hero { flex-direction: column !important; align-items: stretch !important; padding: 20px 16px 24px !important; gap: 14px !important; }
.hero-left { display: contents !important; }
.hero-badge-row { order: 1; max-width: 100% !important; align-items: center !important; justify-content: space-between; gap: 8px !important; }
.hero-badge { font-size: 15px !important; line-height: 1.3 !important; white-space: normal !important; color: #B85C00 !important; flex-shrink: 1 !important; }
.hero-badge-icon { width: 56px !important; height: 40px !important; margin-left: 0 !important; }
.hero-headline { order: 2; font-size: 29px !important; line-height: 1.3 !important; max-width: 100% !important; margin: 0 !important; }
.hero-right { order: 3; width: 100%; flex: none !important; min-width: 0 !important; align-self: stretch !important; }
.hero-img { aspect-ratio: 4 / 3 !important; }
.hero-subtitle-group { order: 4; max-width: 100% !important; gap: 14px !important; }
.hero-subtitle { font-size: 17px !important; line-height: 1.55 !important; text-align: left !important; color: #B85C00 !important; }
.hero-subtitle--accent { background: #E0F2FF; color: #143C6F !important; padding: 14px 16px; border-radius: 16px; }
.hero-subtitle--accent strong { color: #143C6F; }

.section-title { font-size: 26px !important; margin-bottom: 16px !important; }
.why-section { padding: 32px 16px 16px !important; }
.plans-section { padding: 32px 0 24px !important; }
.plans-section .section-title { padding: 0 16px; }
.expert-section { padding: 24px 16px !important; }
.expert-inner { flex-direction: column !important; text-align: center; gap: 12px !important; }
.expert-avatar { flex: none !important; width: 120px !important; height: auto !important; }
.expert-text { font-size: 16px !important; line-height: 1.5 !important; text-align: left !important; }
.how-it-works-section { padding: 24px 0 32px !important; }
.how-it-works-video-wrap { margin: 0 16px !important; max-width: none !important; }
.how-it-works-video-wrap:fullscreen { width: 100vw; height: 100vh; height: 100dvh; max-width: none; margin: 0 !important; border-radius: 0; display: flex; align-items: center; justify-content: center; background: #000; }
.how-it-works-video-wrap:-webkit-full-screen { width: 100vw; height: 100vh; max-width: none; margin: 0 !important; border-radius: 0; display: flex; align-items: center; justify-content: center; background: #000; }
.how-it-works-video-wrap:fullscreen .how-it-works-video { width: 100% !important; height: 100% !important; max-height: none; object-fit: contain; }
.how-it-works-video-wrap:-webkit-full-screen .how-it-works-video { width: 100% !important; height: 100% !important; max-height: none; object-fit: contain; }
.build-cta-wrap { padding: 0 16px !important; margin-top: 24px !important; }
.btn-build-diet { width: 100%; max-width: 320px; box-sizing: border-box; font-size: 20px !important; padding: 14px 24px !important; }
.site-footer { padding: 28px 16px !important; }
.footer-inner { flex-direction: column !important; align-items: center !important; gap: 12px !important; text-align: center; }
.footer-logo-img { height: 64px !important; }

.dm-why { display: flex; flex-direction: column; gap: 10px; }
.dm-why-card { display: flex; align-items: center; gap: 14px; height: 104px; box-sizing: border-box; padding: 0 16px; background: #E0F2FF; border-radius: 20px; }
.dm-why-ic { flex: 0 0 52px; height: 52px; border-radius: 50%; background: #143C6F; display: flex; align-items: center; justify-content: center; }
.dm-why-card b { display: block; font-size: 17px; font-weight: 700; color: #143C6F; line-height: 1.2; margin-bottom: 4px; }
.dm-why-card span { display: block; font-size: 14px; line-height: 1.35; color: #3C6293; font-weight: 600; }

.dm-car { display: flex; align-items: stretch; gap: 12px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 2px 16px 4px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.dm-car::-webkit-scrollbar { display: none; }
.dm-card { flex: 0 0 80%; max-width: 340px; scroll-snap-align: center; border: 1.5px solid #A6CCE8; border-radius: 20px; overflow: hidden; background: #fff; display: flex; flex-direction: column; }
.dm-card-head { background: #143C6F; color: #fff; height: 112px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; }
.dm-card-head p { margin: 0; font-family: 'Marcellus', serif; font-size: 20px; text-align: center; }
.dm-row { flex: 1; min-height: 62px; padding: 8px 16px; border-top: 1px solid #E5EEF7; display: flex; flex-direction: column; justify-content: center; }
.dm-row:nth-child(even) { background: #F5FAFF; }
.dm-row small { font-size: 12px; font-weight: 700; color: #3C6293; margin-bottom: 1px; }
.dm-row span { font-size: 15px; font-weight: 700; line-height: 1.25; color: #211915; }
.dm-dots { display: flex; justify-content: center; gap: 8px; margin: 12px 0 8px; }
.dm-dots i { width: 8px; height: 8px; border-radius: 50%; background: #A6CCE8; display: block; transition: width 0.2s; }
.dm-dots i.on { background: #143C6F; width: 22px; border-radius: 4px; }

`

// TODO: replace the short lines below with your real card wording — these
// five were written as stand-ins because the original cards are images.
const WHY_CARDS: { title: string; body: string; icon: React.ReactNode }[] = [
  { title: 'Three tailored diet options', body: 'Conventional, grain-free, or meat-based.',
    icon: <><path d="M8 6h13M8 12h13M8 18h13" /><path d="M3 6h.01M3 12h.01M3 18h.01" /></> },
  { title: 'Beyond the label', body: 'Recipes that go past what a bag claims.',
    icon: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></> },
  { title: '100+ human-grade ingredients', body: "Pick real foods you'd eat yourself.",
    icon: <><path d="M3 9h18l-2 11H5L3 9z" /><path d="M8 9l4-6 4 6" /></> },
  { title: 'Science-based formulation', body: 'Meets AAFCO minimum nutrient levels.',
    icon: <><path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-10V3" /></> },
  { title: 'Full ingredient control', body: 'You choose it. FurTuner balances it.',
    icon: <><path d="M4 8h10M18 8h2M4 16h2M10 16h10" /><circle cx="16" cy="8" r="2" /><circle cx="8" cy="16" r="2" /></> },
]

// ══════════════════════════════════════════════
// SUPPORT FORM
// Matches DogDietCalculator's visual style (same input/label/pill look).
// Submits silently in the background via a POST to a Google Apps Script
// Web App (SUPPORT_FORM_ENDPOINT below) — no email app opens, the message
// just lands in the help@furtuner.com inbox directly via Google Workspace.
// ══════════════════════════════════════════════
const SUPPORT_REASONS = [
  'General Question',
  'Recipe or Diet Issue',
  'Order or Billing',
  'Technical Problem',
  'Feedback',
]

function supportInputCls(error: boolean) {
  return `w-full h-[64px] px-4 rounded-[10px] text-[21px] font-bold text-[#211915] bg-[#E0F2FF] outline-none transition-all ${
    error ? 'shadow-[0_0_0_2px_#B02424]' : 'focus:shadow-[0_0_0_2px_#3C6293]'
  }`
}

function SupportField({
  label, error, children,
}: {
  label: string; error?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-[23px] font-bold text-[#3C6293]" style={{ marginBottom: '9px' }}>{label}</label>
      {children}
      {error && <p className="mt-1.5 text-[15px] text-[#AD0B39] font-bold">{error}</p>}
    </div>
  )
}

// TODO: replace with your real Google Apps Script Web App URL.
// Deploy the included apps-script-support-form.gs as a Web App (Execute
// as: Me, Who has access: Anyone) from a Google account on the furtuner.com
// Workspace, then paste the resulting /exec URL here. Until this is a real
// endpoint, submissions will fail.
const SUPPORT_FORM_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyE44EYzSQtFX8ko6H7oFgR4Gui-ekF2HI3mIeUL2BNzXDpA-Yba04JpDBxLOPvC6zC/exec'

function SupportForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Please enter your name.'
    if (!email.trim()) next.email = 'Please enter your email.'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = 'Please enter a valid email.'
    if (!reason) next.reason = 'Please select a reason.'
    if (!message.trim()) next.message = 'Please enter a message.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setStatus('sending')
    try {
      // Content-Type is deliberately 'text/plain' (not 'application/json'):
      // Apps Script Web Apps don't handle CORS preflight requests, and a
      // 'text/plain' body is treated as a "simple request" by the browser
      // so no preflight is triggered. The body itself is still JSON —
      // Apps Script parses e.postData.contents with JSON.parse regardless
      // of the declared content type.
      const res = await fetch(SUPPORT_FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ name, email, reason, message }),
      })
      if (!res.ok) throw new Error('Submission failed')
      setStatus('sent')
      setName(''); setEmail(''); setReason(''); setMessage('')
    } catch {
      setStatus('error')
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ maxWidth: '640px', margin: '0 auto', textAlign: 'left' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '26px' }}>
        <SupportField label="Name *" error={errors.name}>
          <input
            className={supportInputCls(!!errors.name)}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Jamie Rivera"
          />
        </SupportField>

        <SupportField label="Email *" error={errors.email}>
          <input
            type="email"
            className={supportInputCls(!!errors.email)}
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="e.g. jamie@email.com"
          />
        </SupportField>

        <SupportField label="Reason for Contact *" error={errors.reason}>
          <div style={{ position: 'relative' }}>
            <select
              value={reason}
              onChange={e => { setReason(e.target.value); setErrors(er => ({ ...er, reason: '' })) }}
              className={`${supportInputCls(!!errors.reason)} appearance-none cursor-pointer`}
              style={{ paddingRight: '48px' }}
            >
              <option value="" style={{ fontWeight: 700, fontSize: '21px', color: '#3C6293' }}>
                — Select a reason —
              </option>
              {SUPPORT_REASONS.map(r => (
                <option key={r} value={r} style={{ fontWeight: 700, fontSize: '21px', color: '#211915' }}>
                  {r}
                </option>
              ))}
            </select>
            <svg
              width="18" height="18" viewBox="0 0 24 24" fill="none"
              style={{ position: 'absolute', right: '20px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
            >
              <path d="M6 9l6 6 6-6" stroke="#3C6293" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </SupportField>

        <SupportField label="Message *" error={errors.message}>
          <textarea
            className={`${supportInputCls(!!errors.message)} h-[160px] pt-4`}
            style={{ resize: 'vertical' }}
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="How can we help?"
          />
        </SupportField>

        <button
          type="submit"
          disabled={status === 'sending'}
          className="h-[64px] rounded-[10px] text-[21px] font-bold text-white transition-all"
          style={{ background: '#F0932B', opacity: status === 'sending' ? 0.7 : 1, cursor: status === 'sending' ? 'not-allowed' : 'pointer' }}
        >
          {status === 'sending' ? 'Sending…' : 'Send Message'}
        </button>

        {status === 'sent' && (
          <p style={{ fontSize: '15px', color: '#1B7A3D', fontWeight: 700, margin: 0 }}>
            Message sent! We'll get back to you soon.
          </p>
        )}
        {status === 'error' && (
          <p style={{ fontSize: '15px', color: '#AD0B39', fontWeight: 700, margin: 0 }}>
            Something went wrong sending your message. Please try again, or email us directly at help@furtuner.com.
          </p>
        )}
      </div>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────
// SUPPORT DEEP LINK
// The nav links call e.preventDefault(), so the address bar never changed when
// someone opened Support -- there was nothing to link to (e.g. from the diet
// report email). These two helpers make https://furtuner.com/?page=support
// open the Support screen directly, and keep the address bar in step with it.
// ("#support" is accepted too, since that's what the nav link's href says.)
// Only the `page` parameter is ever touched -- furtuner_payment, testmode etc. and
// the rest of the address are left exactly as they were.
// ─────────────────────────────────────────────────────────────────────────
type View = 'home' | 'faq' | 'about' | 'calculator' | 'support'

// Which screen the address asks for when the site first loads.
function viewFromUrl(search: string, hash: string): View {
  // Must stay first: Stripe sends customers back with ?furtuner_payment=success and
  // the calculator has to mount immediately to unlock their results.
  if (search.includes('furtuner_payment=success')) return 'calculator'
  if (new URLSearchParams(search).get('page') === 'support' || hash === '#support') return 'support'
  return 'home'
}

// The address the bar SHOULD show for this screen, or null if it's already right.
function urlForView(view: View, href: string): string | null {
  const url = new URL(href)
  const hasSupportParam = url.searchParams.get('page') === 'support'
  if (view === 'support') {
    if (hasSupportParam && url.hash !== '#support') return null
    url.searchParams.set('page', 'support')
    if (url.hash === '#support') url.hash = ''
    return url.toString()
  }
  if (hasSupportParam) {
    url.searchParams.delete('page')
    return url.toString()
  }
  return null
}

function App() {
  const [activeDiet, setActiveDiet] = useState<string | null>(null)
  const isMobileTest = useMobileTestView()
  // Mobile test view only: swipeable diet-plan cards + their position dots.
  const dietCarRef = useRef<HTMLDivElement>(null)
  const [dietSlide, setDietSlide] = useState(0)
  const onDietScroll = () => {
    const el = dietCarRef.current
    const first = el?.firstElementChild as HTMLElement | null | undefined
    if (!el || !first) return
    const w = first.offsetWidth + 12
    setDietSlide(Math.min(DIET_PLANS.length - 1, Math.max(0, Math.round(el.scrollLeft / w))))
  }
  // Custom caption overlay for the 'How FurTuner Works' video — see the
  // cuechange listener below for why we don't use native ::cue styling.
  const howItWorksVideoRef = useRef<HTMLVideoElement>(null)
  const howItWorksWrapRef = useRef<HTMLDivElement>(null)
  const [currentCaption, setCurrentCaption] = useState('')
  // Mobile test view: remembers where on the home page the video was started, so
  // when it ends (or fullscreen is closed) the visitor lands back on that spot.
  const savedScrollRef = useRef<number | null>(null)
  const fsSwapRef = useRef(false)

  useEffect(() => {
    const videoEl = howItWorksVideoRef.current
    const wrapEl = howItWorksWrapRef.current
    if (!videoEl || !wrapEl) return

    // The native fullscreen button on <video controls> fullscreens ONLY the
    // <video> element — our caption overlay is a sibling div, so it gets
    // left behind and disappears. When that happens, immediately swap to
    // fullscreening the wrapper div instead, which contains both the video
    // and the caption overlay together.
    const onFullscreenChange = () => {
      if (document.fullscreenElement === videoEl) {
        fsSwapRef.current = true
        document.exitFullscreen().then(() => {
          wrapEl.requestFullscreen().catch(() => {}).then(() => { fsSwapRef.current = false })
        }).catch(() => { fsSwapRef.current = false })
      }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  useEffect(() => {
    const videoEl = howItWorksVideoRef.current
    if (!videoEl) return

    let track: TextTrack | undefined
    const attachListener = () => {
      track = videoEl.textTracks[0]
      if (!track) return
      track.mode = 'hidden'
      const onCueChange = () => {
        const active = track!.activeCues
        setCurrentCaption(active && active.length > 0 ? (active[0] as VTTCue).text : '')
      }
      track.addEventListener('cuechange', onCueChange)
      return () => track!.removeEventListener('cuechange', onCueChange)
    }

    // textTracks may already be available, or may need a tick after the
    // <track> element's own load event fires.
    let cleanup = attachListener()
    if (!cleanup) {
      const onLoaded = () => { cleanup = attachListener() }
      videoEl.addEventListener('loadedmetadata', onLoaded)
      return () => videoEl.removeEventListener('loadedmetadata', onLoaded)
    }
    return cleanup
  }, [])
  // ── Mobile test view: tap play → video goes fullscreen; when it ends, fullscreen
  // closes and the page returns to where the video was started. Works in portrait
  // and landscape (the browser rotates the fullscreen view with the phone).
  const enterVideoFullscreen = () => {
    if (!isMobileTest) return
    const videoEl = howItWorksVideoRef.current as any
    const wrapEl = howItWorksWrapRef.current as any
    if (!videoEl || !wrapEl) return
    const doc = document as any
    if (document.fullscreenElement || doc.webkitFullscreenElement) return
    savedScrollRef.current = window.scrollY
    if (wrapEl.requestFullscreen) {
      wrapEl.requestFullscreen().catch(() => { savedScrollRef.current = null })
    } else if (wrapEl.webkitRequestFullscreen) {
      wrapEl.webkitRequestFullscreen()
    } else if (videoEl.webkitEnterFullscreen) {
      // iPhone Safari only allows the <video> itself to go fullscreen, so the custom
      // caption overlay can't come along — switch on the browser's own captions instead.
      const track = videoEl.textTracks && videoEl.textTracks[0]
      if (track) track.mode = 'showing'
      videoEl.webkitEnterFullscreen()
    }
  }

  const exitVideoFullscreen = () => {
    if (!isMobileTest) return
    const videoEl = howItWorksVideoRef.current as any
    const doc = document as any
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else if (doc.webkitFullscreenElement && doc.webkitExitFullscreen) doc.webkitExitFullscreen()
    else if (videoEl && videoEl.webkitDisplayingFullscreen && videoEl.webkitExitFullscreen) videoEl.webkitExitFullscreen()
  }

  useEffect(() => {
    if (!isMobileTest) return
    const videoEl = howItWorksVideoRef.current as any
    const restore = () => {
      const doc = document as any
      if (document.fullscreenElement || doc.webkitFullscreenElement || fsSwapRef.current) return
      const y = savedScrollRef.current
      if (y == null) return
      savedScrollRef.current = null
      requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }))
      const track = videoEl && videoEl.textTracks && videoEl.textTracks[0]
      if (track) track.mode = 'hidden'
    }
    document.addEventListener('fullscreenchange', restore)
    document.addEventListener('webkitfullscreenchange', restore)
    if (videoEl) videoEl.addEventListener('webkitendfullscreen', restore)
    return () => {
      document.removeEventListener('fullscreenchange', restore)
      document.removeEventListener('webkitfullscreenchange', restore)
      if (videoEl) videoEl.removeEventListener('webkitendfullscreen', restore)
    }
  }, [isMobileTest])

  // "Why Choose FurTuner" cards: Set A displays statically at rest. Hovering
  // an individual card shows a flip overlay on top of it (Set A front,
  // Set B back).
  const [whyHoveredCard, setWhyHoveredCard] = useState<number | null>(null)
  // Defaults to 'home' — except when the page is loading because Stripe just
  // redirected the customer back here after a successful payment
  // (?furtuner_payment=success). In that case we need DogDietCalculator to mount
  // immediately so its own effect can read that query param, restore the
  // saved wizard state, and unlock the Results page — none of that runs if
  // the app is sitting on the Home view instead.
  const [view, setView] = useState<View>(() => {
    if (typeof window !== 'undefined') {
      return viewFromUrl(window.location.search, window.location.hash)
    }
    return 'home'
  })

  // Keep the address bar in step with the Support screen. replaceState (not
  // pushState) so no extra history entries are created -- Back button behaves
  // exactly as before.
  useEffect(() => {
    const next = urlForView(view, window.location.href)
    if (next) window.history.replaceState(window.history.state, '', next)
  }, [view])
  // Bumped every time "Build Your Diet" is opened, and passed as the
  // calculator's React `key` — this guarantees a completely fresh component
  // instance (no leftover pet type, diet type, profile, or ingredient
  // selections from a previous visit) every single time, regardless of any
  // edge case in how the previous instance unmounted.
  const [calculatorInstance, setCalculatorInstance] = useState(0)
  // Mobile nav: whether the hamburger-toggled dropdown panel is open.
  // Reset to closed on every view change so it doesn't stay open behind
  // whatever screen the user just navigated to.
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const jumpToTop = () => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const goHome = () => {
    setView('home')
    setMobileMenuOpen(false)
    jumpToTop()
  }

  const goFAQ = () => {
    setView('faq')
    setMobileMenuOpen(false)
    jumpToTop()
  }

  const goAbout = () => {
    setView('about')
    setMobileMenuOpen(false)
    jumpToTop()
  }

  const goSupport = () => {
    setView('support')
    setMobileMenuOpen(false)
    jumpToTop()
  }

  const goCalculator = () => {
    setCalculatorInstance(n => n + 1)
    setView('calculator')
    setMobileMenuOpen(false)
    jumpToTop()
  }

  return (
    <>
      <Analytics />
      {isMobileTest && <style>{HOME_MOBILE_CSS}</style>}
      {/* NAVBAR */}
      <header className="navbar">
        <div className="nav-logo">
          <a
            href="#home"
            onClick={(e) => {
              e.preventDefault()
              goHome()
            }}
          >
            <img src="/images/logo.svg" alt="FurTuner" className="nav-logo-img" />
          </a>
        </div>
        <button
          type="button"
          className={`nav-hamburger ${mobileMenuOpen ? 'nav-hamburger--open' : ''}`}
          aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={mobileMenuOpen}
          onClick={() => setMobileMenuOpen(open => !open)}
        >
          <span className="nav-hamburger-bar" />
          <span className="nav-hamburger-bar" />
          <span className="nav-hamburger-bar" />
        </button>
        <nav className={`nav-links ${mobileMenuOpen ? 'nav-links--open' : ''}`}>
          <a
            href="#support"
            className={`nav-link nav-link--support ${view === 'support' ? 'nav-link--active' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              goSupport()
            }}
          >
            SUPPORT
          </a>
          <a
            href="#faq"
            className={`nav-link nav-link--faq ${view === 'faq' ? 'nav-link--active' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              goFAQ()
            }}
          >
            FAQ
          </a>
          <a
            href="#about"
            className={`nav-link nav-link--about ${view === 'about' ? 'nav-link--active' : ''}`}
            onClick={(e) => {
              e.preventDefault()
              goAbout()
            }}
            style={{ color: '#DE7100', textTransform: 'none', fontWeight: 700 }}
          >
            ABOUT FurTuner
          </a>
        </nav>
      </header>

      {view === 'home' && (
        <>
        <section className="hero">
        <div className="hero-left">
          <div className="hero-badge-row">
            <span className="hero-badge">SCIENCE-BASED PET NUTRITION</span>
            <img src="/images/hero-pet.svg" alt="" className="hero-badge-icon" aria-hidden="true" />
          </div>
          <h1 className="hero-headline">
            Homemade Pet Food. Balanced for Them. Built by You.
          </h1>
          <div className="hero-subtitle-group">
            <p className="hero-subtitle">
              Choose the real-food ingredients you want to feed your dog or cat, and{' '}
              <strong>FurTuner turns them into a personalized, complete and balanced recipe</strong>{' '}
              with the right amount of each ingredient.
            </p>
            <p className="hero-subtitle hero-subtitle--accent">
              <strong>Real foods you choose. No vitamin or
              mineral premix required.</strong>
            </p>
            <p className="hero-subtitle">
              Each recipe is formulated to meet the{' '}
              <strong>minimum nutrient requirements established by AAFCO (Association of American Feed Control Officials).</strong>
            </p>
          </div>
        </div>
        <div className="hero-right">
          <img src="/images/hero-image.png" alt="Happy dog and cat" className="hero-img" />
        </div>
      </section>

      {/* BACKGROUND / PRICE SCROLL SECTION */}
      <section className="hero-bg-section">
        <img src="/images/hero-bg-section.svg" className="hero-bg-full" alt="" />
      </section>

      {/* WHY CHOOSE FURTUNER */}
      <section className="why-section">
        <h2 className="section-title">Why Choose FurTuner?</h2>
        {isMobileTest ? (
          <div className="dm-why">
            {WHY_CARDS.map(c => (
              <div key={c.title} className="dm-why-card">
                <div className="dm-why-ic">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{c.icon}</svg>
                </div>
                <div>
                  <b>{c.title}</b>
                  <span>{c.body}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
        <div className="why-carousel">
          {/* Set A — displays statically at rest. */}
          <div className="why-set why-set-a">
            <div className="why-grid">
              <div className="why-row1">
                <div className="why-card why-card-1">
                  <img className="why-full-img" src="/images/seta-card1.svg" alt="Three tailored diet options" />
                </div>
                <div className="why-card why-card-2">
                  <img className="why-full-img" src="/images/seta-card2.svg" alt="Beyond the label" />
                </div>
              </div>
              <div className="why-row2">
                <div className="why-card why-card-3">
                  <img className="why-full-img" src="/images/seta-card3.svg" alt="100+ human-grade ingredients" />
                </div>
                <div className="why-card why-card-4">
                  <img className="why-full-img" src="/images/seta-card4.svg" alt="Science-based formulation" />
                </div>
                <div className="why-card why-card-5">
                  <img className="why-full-img" src="/images/seta-card5.svg" alt="Full ingredient control" />
                </div>
              </div>
            </div>
          </div>

          <div className="why-set why-set-b">
            <div className="why-grid">
              <div className="why-row1">
                <div className="why-card why-card-1">
                  <img className="why-full-img" src="/images/setb-card1.svg" alt="" />
                </div>
                <div className="why-card why-card-2">
                  <img className="why-full-img" src="/images/setb-card2.svg" alt="" />
                </div>
              </div>
              <div className="why-row2">
                <div className="why-card why-card-3">
                  <img className="why-full-img" src="/images/setb-card3.svg" alt="" />
                </div>
                <div className="why-card why-card-4">
                  <img className="why-full-img" src="/images/setb-card4.svg" alt="" />
                </div>
                <div className="why-card why-card-5">
                  <img className="why-full-img" src="/images/setb-card5.svg" alt="" />
                </div>
              </div>
            </div>
          </div>

          {/* Hover overlay — invisible hit-area per card, sits on top of the
              ambient layers above. Hovering flips it in (Set A front, Set B
              back); moving away flips it back out, revealing the ambient
              crossfade underneath again. */}
          <div className="why-set why-hover-layer">
            <div className="why-grid">
              <div className="why-row1">
                {[
                  { n: 1, alt: 'Three tailored diet options' },
                  { n: 2, alt: 'Beyond the label' },
                ].map(({ n, alt }) => (
                  <div
                    className={`why-card why-card-${n} why-hover-card ${whyHoveredCard === n ? 'is-active' : ''}`}
                    key={n}
                    onMouseEnter={() => setWhyHoveredCard(n)}
                    onMouseLeave={() => setWhyHoveredCard(null)}
                  >
                    <div className="why-flip-inner">
                      <img className="why-full-img why-flip-front" src={`/images/seta-card${n}.svg`} alt={alt} />
                      <img className="why-full-img why-flip-back" src={`/images/setb-card${n}.svg`} alt="" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="why-row2">
                {[
                  { n: 3, alt: '100+ human-grade ingredients' },
                  { n: 4, alt: 'Science-based formulation' },
                  { n: 5, alt: 'Full ingredient control' },
                ].map(({ n, alt }) => (
                  <div
                    className={`why-card why-card-${n} why-hover-card ${whyHoveredCard === n ? 'is-active' : ''}`}
                    key={n}
                    onMouseEnter={() => setWhyHoveredCard(n)}
                    onMouseLeave={() => setWhyHoveredCard(null)}
                  >
                    <div className="why-flip-inner">
                      <img className="why-full-img why-flip-front" src={`/images/seta-card${n}.svg`} alt={alt} />
                      <img className="why-full-img why-flip-back" src={`/images/setb-card${n}.svg`} alt="" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        )}
      </section>

      {/* EXPERT SECTION */}
      <section className="expert-section">
        <div className="expert-inner">
          <img src="/images/professor.svg" alt="Professor Amer AbuGhazaleh" className="expert-avatar" />
          <p className="expert-text">
            <strong>Expert-developed diets</strong> – Created by <strong>Amer AbuGhazaleh</strong>,
            Professor and Director of the Canine and Feline Nutrition Program at Southern Illinois
            University Carbondale, with over 20 years of expertise in pet nutrition, diet
            formulation, product development, and professional consultation.
          </p>
        </div>
      </section>

      {/* THREE TAILORED DIET PLANS */}
      <section id="plans" className="plans-section">
        <h2 className="section-title">Three Tailored Diet Plans for Dogs &amp; Cats</h2>

        {/* Mobile: each diet card is followed immediately by its own 2-column
            (Feature / Value) table — no hover, no shared toggle state, all
            three stacked and always visible. The 4-wide side-by-side grid
            below is unusable at phone widths (hover doesn't exist on touch,
            and the columns get too narrow to read), so this is a fully
            separate render path built from the same data rather than a CSS
            reflow of the desktop markup. Uses inline styles only, since this
            file's page.css isn't available to edit alongside it. */}
        {isMobileTest && (
          <>
            <div className="dm-car" ref={dietCarRef} onScroll={onDietScroll}>
              {DIET_PLANS.map(diet => (
                <div key={diet.id} className="dm-card">
                  <div className="dm-card-head">
                    <img src={diet.icon} alt={diet.alt} style={{ width: "48px", height: "48px", filter: "brightness(0) invert(1)" }} />
                    <p>{diet.label}</p>
                  </div>
                  {COMPARISON_FEATURES.map((feature, i) => (
                    <div key={feature} className="dm-row">
                      <small>{feature}</small>
                      <span>{diet.values[i]}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div className="dm-dots" aria-hidden="true">
              {DIET_PLANS.map((d, i) => <i key={d.id} className={i === dietSlide ? 'on' : ''} />)}
            </div>
          </>
        )}

        {!isMobileTest && (
        <>
        <div className="plan-cards">
          <div
            className={`plan-card ${activeDiet === '1' ? 'diet-active' : ''}`}
            onMouseEnter={() => setActiveDiet('1')}
            onMouseLeave={() => setActiveDiet(null)}
          >
            <img src="/images/diet-conventional.svg" alt="Conventional diet icon" className="plan-icon" />
            <p className="plan-label">Conventional Diet</p>
          </div>
          <div
            className={`plan-card ${activeDiet === '2' ? 'diet-active' : ''}`}
            onMouseEnter={() => setActiveDiet('2')}
            onMouseLeave={() => setActiveDiet(null)}
          >
            <img src="/images/diet-grain.svg" alt="Grain-Free diet icon" className="plan-icon" />
            <p className="plan-label">Grain-Free Diet</p>
          </div>
          <div
            className={`plan-card ${activeDiet === '3' ? 'diet-active' : ''}`}
            onMouseEnter={() => setActiveDiet('3')}
            onMouseLeave={() => setActiveDiet(null)}
          >
            <img src="/images/diet-meat.svg" alt="Meat-Based diet icon" className="plan-icon" />
            <p className="plan-label">Meat-Based Diet</p>
          </div>
        </div>

        <div className="comparison-wrap">
          <div className="cmp-column cmp-column--feature">
            <div className="cmp-col-head">Feature</div>
            <div className="cmp-col-cell">Protein Content (%)</div>
            <div className="cmp-col-cell cmp-stripe">Carbohydrate Level</div>
            <div className="cmp-col-cell">Cereal Grains</div>
            <div className="cmp-col-cell cmp-stripe">Vegetables</div>
            <div className="cmp-col-cell">Human-Grade Ingredients</div>
            <div className="cmp-col-cell cmp-stripe">Nutritional Balance</div>
            <div className="cmp-col-cell">Vitamin/Mineral Supplements</div>
          </div>

          <div
            className={`cmp-column ${activeDiet === '1' ? 'diet-active' : ''}`}
            onMouseEnter={() => setActiveDiet('1')}
            onMouseLeave={() => setActiveDiet(null)}
          >
            <div className="cmp-col-head">Conventional Diet</div>
            <div className="cmp-col-cell"><span>&gt;30% (Dog)<br />&gt;45% (Cat)</span></div>
            <div className="cmp-col-cell cmp-stripe">Moderate</div>
            <div className="cmp-col-cell">Included</div>
            <div className="cmp-col-cell cmp-stripe">Included</div>
            <div className="cmp-col-cell">100% Human-Grade</div>
            <div className="cmp-col-cell cmp-stripe">Meets AAFCO standards</div>
            <div className="cmp-col-cell">No synthetic vitamin/mineral premix required</div>
          </div>

          <div
            className={`cmp-column ${activeDiet === '2' ? 'diet-active' : ''}`}
            onMouseEnter={() => setActiveDiet('2')}
            onMouseLeave={() => setActiveDiet(null)}
          >
            <div className="cmp-col-head">Grain-Free Diet</div>
            <div className="cmp-col-cell"><span>&gt;30% (Dog)<br />&gt;45% (Cat)</span></div>
            <div className="cmp-col-cell cmp-stripe">Moderate</div>
            <div className="cmp-col-cell">Not Included</div>
            <div className="cmp-col-cell cmp-stripe">Included</div>
            <div className="cmp-col-cell">100% Human-Grade</div>
            <div className="cmp-col-cell cmp-stripe">Meets AAFCO standards</div>
            <div className="cmp-col-cell">No synthetic vitamin/mineral premix required</div>
          </div>

          <div
            className={`cmp-column ${activeDiet === '3' ? 'diet-active' : ''}`}
            onMouseEnter={() => setActiveDiet('3')}
            onMouseLeave={() => setActiveDiet(null)}
          >
            <div className="cmp-col-head">Meat-Based Diet</div>
            <div className="cmp-col-cell"><span>&gt;50% (Dog)<br />&gt;60% (Cat)</span></div>
            <div className="cmp-col-cell cmp-stripe">Very Low</div>
            <div className="cmp-col-cell">Not Included</div>
            <div className="cmp-col-cell cmp-stripe">Included (minimal amounts)</div>
            <div className="cmp-col-cell">100% Human-Grade</div>
            <div className="cmp-col-cell cmp-stripe">Meets AAFCO standards</div>
            <div className="cmp-col-cell">No synthetic vitamin/mineral premix required</div>
          </div>
        </div>
        </>
        )}

        {/* HOW FURTUNER WORKS — explainer video, shown after the diet comparison table, right before Build Your Diet */}
        <div className="how-it-works-section">
          <h2 className="section-title">
            How <span style={{ color: '#F0932B' }}>Fur</span><span style={{ color: 'var(--navy-mid)' }}>Tuner</span> Works?
          </h2>
          <div className="how-it-works-video-wrap" ref={howItWorksWrapRef}>
            <video
              ref={howItWorksVideoRef}
              className="how-it-works-video"
              controls
              playsInline
              onPlay={enterVideoFullscreen}
              onEnded={exitVideoFullscreen}
              preload="metadata"
              poster="/images/how-furtuner-works-poster.jpg"
            >
              <source src="/images/how-furtuner-works.mp4" type="video/mp4" />
              <track
                src="/images/how-furtuner-works.vtt"
                kind="captions"
                srcLang="en"
                label="English"
                default
              />
              Your browser doesn't support embedded video. You can view it directly:{' '}
              <a href="/images/how-furtuner-works.mp4">download the video</a>.
            </video>
            {currentCaption && (
              <div className="how-it-works-caption-overlay">{currentCaption}</div>
            )}
          </div>
        </div>

        <div className="build-cta-wrap">
          <a
            href="#calculator"
            className="btn-build-diet"
            onClick={(e) => {
              e.preventDefault()
              goCalculator()
            }}
          >
            Build Your Diet
          </a>
        </div>
      </section>
        </>
      )}

      {view === 'about' && (
        <main className="faq-page" style={{ textAlign: 'center' }}>
          <button className="faq-back-link" onClick={goHome}>
            <span>&larr;</span> Back to Home
          </button>
          <h2
            style={{
              fontFamily: "'Marcellus', serif",
              fontWeight: 700,
              fontSize: 'clamp(28px, 3.5vw, 40px)',
              marginBottom: '28px',
              textAlign: 'center',
            }}
          >
            <span style={{ color: '#DE7100' }}>About</span>{' '}
            <span style={{ color: '#143C6F' }}>FurTuner</span>
          </h2>
          <div style={{ maxWidth: '820px', margin: '0 auto', fontSize: '18px', lineHeight: 1.7, color: '#143C6F', textAlign: 'center' }}>
            <p style={{ marginBottom: '20px' }}>
              <strong>FurTuner</strong> was developed by Dr. Amer AbuGhazaleh, Professor of Animal
              Science, Food and Nutrition at Southern Illinois University Carbondale (SIUC) and founder
              and Director of SIU&rsquo;s Canine &amp; Feline Nutrition Certificate Program. With more
              than two decades of experience in animal nutrition, research, teaching, and diet
              formulation, Dr. AbuGhazaleh created <strong>FurTuner</strong> to bring science,
              flexibility, and personalization to home-prepared pet nutrition.
            </p>
            <p>
              What makes <strong>FurTuner</strong> different is choice. Instead of following a fixed
              recipe, users can select the ingredients they want to feed their dog or cat, and{' '}
              <strong>FurTuner</strong> determines the appropriate amounts needed to create a
              nutritionally balanced diet based on established canine and feline nutrient
              recommendations, without the need for a separate nutritional supplement. The result is
              greater freedom, transparency, and control over what goes into your pet&rsquo;s bowl,
              without sacrificing nutritional balance.
            </p>
          </div>
        </main>
      )}

      {view === 'faq' && (
        <main className="faq-page" style={{ textAlign: 'center' }}>
          <button className="faq-back-link" onClick={goHome}>
            <span>&larr;</span> Back to Home
          </button>
          <FAQSection visible={true} />
        </main>
      )}

      {view === 'support' && (
        <main className="faq-page" style={{ textAlign: 'center' }}>
          <button className="faq-back-link" onClick={goHome}>
            <span>&larr;</span> Back to Home
          </button>
          <h2
            style={{
              fontFamily: "'Marcellus', serif",
              fontWeight: 700,
              fontSize: 'clamp(28px, 3.5vw, 40px)',
              marginBottom: '16px',
              textAlign: 'center',
              color: '#143C6F',
            }}
          >
            Support
          </h2>
          <p style={{ maxWidth: '640px', margin: '0 auto 40px', fontSize: '18px', lineHeight: 1.6, color: '#3C6293', textAlign: 'center' }}>
            Have a question or ran into an issue? Fill out the form below and we'll get back to you.
          </p>
          <SupportForm />
        </main>
      )}

      {view === 'calculator' && (
        <main className="calculator-page">
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <button className="faq-back-link" onClick={goHome}>
              <span>&larr;</span> Back to Home
            </button>
          </div>
          <DogDietCalculator key={calculatorInstance} visible={true} onGoHome={goHome} />
        </main>
      )}

      {/* FOOTER — home page only */}
      {view === 'home' && (
        <footer className="site-footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <img src="/images/logo.svg" alt="FurTuner" className="footer-logo-img" />
            </div>
            <p className="footer-copy">&copy; 2026 FurTuner &nbsp;·&nbsp; Science-Based Pet Nutrition</p>
          </div>
        </footer>
      )}
    </>
  )
}

export default App
