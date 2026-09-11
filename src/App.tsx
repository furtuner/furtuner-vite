import { useState, useRef, useEffect } from 'react'
import DogDietCalculator from './components/DogDietCalculator'
import FAQSection from './components/FAQSection'
import './page.css'

// ══════════════════════════════════════════════
// SUPPORT FORM
// Matches DogDietCalculator's visual style (same input/label/pill look).
// Submits silently in the background via a POST to a Formspree endpoint
// (SUPPORT_FORM_ENDPOINT below) — no email app opens, the message just
// lands in the help@furtuner.com inbox directly.
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

// TODO: replace with your real Formspree endpoint, e.g.
// 'https://formspree.io/f/xxxxxxxx' — sign up at formspree.io, create a
// form pointed at help@furtuner.com, and paste the endpoint URL it gives
// you here. Until this is a real endpoint, submissions will fail.
const SUPPORT_FORM_ENDPOINT = 'https://formspree.io/f/YOUR_FORM_ID'

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
      const res = await fetch(SUPPORT_FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
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

        <p style={{ fontSize: '14px', color: '#3C6293', margin: 0 }}>
          Your message goes directly to <strong>help@furtuner.com</strong>.
        </p>

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

function App() {
  const [activeDiet, setActiveDiet] = useState<string | null>(null)
  // Custom caption overlay for the 'How FurTuner Works' video — see the
  // cuechange listener below for why we don't use native ::cue styling.
  const howItWorksVideoRef = useRef<HTMLVideoElement>(null)
  const howItWorksWrapRef = useRef<HTMLDivElement>(null)
  const [currentCaption, setCurrentCaption] = useState('')

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
        document.exitFullscreen().then(() => {
          wrapEl.requestFullscreen().catch(() => {})
        }).catch(() => {})
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
  // "Why Choose FurTuner" cards: Set A displays statically at rest. Hovering
  // an individual card shows a flip overlay on top of it (Set A front,
  // Set B back).
  const [whyHoveredCard, setWhyHoveredCard] = useState<number | null>(null)
  // Defaults to 'home' — except when the page is loading because Stripe just
  // redirected the customer back here after a successful payment
  // (?paw_payment=success). In that case we need DogDietCalculator to mount
  // immediately so its own effect can read that query param, restore the
  // saved wizard state, and unlock the Results page — none of that runs if
  // the app is sitting on the Home view instead.
  const [view, setView] = useState<'home' | 'faq' | 'about' | 'calculator' | 'support'>(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('paw_payment=success')) {
      return 'calculator'
    }
    return 'home'
  })
  // Bumped every time "Build Your Diet" is opened, and passed as the
  // calculator's React `key` — this guarantees a completely fresh component
  // instance (no leftover pet type, diet type, profile, or ingredient
  // selections from a previous visit) every single time, regardless of any
  // edge case in how the previous instance unmounted.
  const [calculatorInstance, setCalculatorInstance] = useState(0)

  const jumpToTop = () => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const goHome = () => {
    setView('home')
    jumpToTop()
  }

  const goFAQ = () => {
    setView('faq')
    jumpToTop()
  }

  const goAbout = () => {
    setView('about')
    jumpToTop()
  }

  const goSupport = () => {
    setView('support')
    jumpToTop()
  }

  const goCalculator = () => {
    setCalculatorInstance(n => n + 1)
    setView('calculator')
    jumpToTop()
  }

  return (
    <>
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
        <nav className="nav-links" style={{ marginLeft: '56px', display: 'flex', alignItems: 'center', gap: '32px' }}>
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
