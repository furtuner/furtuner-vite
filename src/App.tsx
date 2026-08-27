import { useState, useEffect } from 'react'
import DogDietCalculator from './components/DogDietCalculator'
import FAQSection from './components/FAQSection'
import './page.css'

function App() {
  const [activeDiet, setActiveDiet] = useState<string | null>(null)
  // Defaults to 'home' — except when the page is loading because Stripe just
  // redirected the customer back here after a successful payment
  // (?paw_payment=success). In that case we need DogDietCalculator to mount
  // immediately so its own effect can read that query param, restore the
  // saved wizard state, and unlock the Results page — none of that runs if
  // the app is sitting on the Home view instead.
  const [view, setView] = useState<'home' | 'faq' | 'about' | 'calculator'>(() => {
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

  // Continuous scroll-linked navbar sizing — the logo shrinks in exact, real-time
  // proportion to how far the page has scrolled (0 to 150px), via a CSS variable
  // read by page.css. No on/off state, no fixed-duration transition fighting the
  // scroll — it just tracks scroll position directly, so it can't feel "stuck" or
  // bouncy the way a threshold + animated transition can.
  useEffect(() => {
    const SHRINK_DISTANCE = 150
    let ticking = false
    const apply = () => {
      const progress = Math.min(1, Math.max(0, window.scrollY / SHRINK_DISTANCE))
      document.documentElement.style.setProperty('--nav-shrink', String(progress))
      ticking = false
    }
    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(apply)
    }
    apply()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const jumpToTop = () => {
    window.scrollTo({ top: 0, behavior: 'auto' })
    document.documentElement.style.setProperty('--nav-shrink', '0')
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
          <a href="#support" className="nav-link nav-link--support">SUPPORT</a>
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
            Create Complete and Balanced Homemade Diets with Our Dog &amp; Cat Diet Formulator
          </h1>
          <p className="hero-subtitle">
            FurTuner is an advanced diet formulation platform for dogs and cats that creates
            personalized, AAFCO-compliant recipes using real food ingredients without synthetic
            vitamin or mineral supplements.
          </p>
        </div>
        <div className="hero-right">
          <img src="/images/hero-image.png" alt="Happy dog and cat" className="hero-img" />
        </div>
      </section>

      {/* BACKGROUND / PRICE SCROLL SECTION */}
      <section className="hero-bg-section">
        <div className="hero-bg-crop" aria-hidden="true">
          <img src="/images/all-bg.svg" className="hero-bg-full" alt="" />
        </div>
        <img src="/images/objects-left.svg" alt="" className="obj obj-left" aria-hidden="true" />
        <img src="/images/objects-right.svg" alt="" className="obj obj-right" aria-hidden="true" />
        <img src="/images/objects-center.svg" alt="" className="obj obj-center" aria-hidden="true" />
      </section>

      {/* WHY CHOOSE FURTUNER */}
      <section className="why-section">
        <h2 className="section-title">Why Choose FurTuner?</h2>
        <div className="why-carousel">
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
            &larr; Back to Home
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
        <main className="faq-page">
          <button className="faq-back-link" onClick={goHome}>
            &larr; Back to Home
          </button>
          <FAQSection visible={true} />
        </main>
      )}

      {view === 'calculator' && (
        <main className="calculator-page">
          <button className="faq-back-link" onClick={goHome}>
            &larr; Back to Home
          </button>
          <DogDietCalculator key={calculatorInstance} visible={true} onGoHome={goHome} />
        </main>
      )}

      {/* FOOTER */}
      <footer className="site-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <img src="/images/logo.svg" alt="FurTuner" className="footer-logo-img" />
          </div>
          <p className="footer-copy">&copy; 2026 FurTuner &nbsp;·&nbsp; Science-Based Pet Nutrition</p>
        </div>
      </footer>
    </>
  )
}

export default App
