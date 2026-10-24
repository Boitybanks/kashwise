import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, BadgeCheck, Check, ChevronLeft, ChevronRight, Clock3, MapPin, Pause, Play, ShieldCheck, Wallet } from 'lucide-react'
import { ButtonLink } from '../components/ui'
import { CategoryIcon } from '../components/CategoryIcon'
import { DemoButtons } from '../components/DemoButtons'
import { breakdown, formatRand, FEE_RATE_PERCENT } from '../lib/money'

const scenes = [
  { src: '/images/photographer.webp', alt: 'Illustrative photographer preparing for a portrait session', title: 'An eye for the moment.', line: 'A skill worth sharing.', category: 'Photography' },
  { src: '/images/tutor.webp', alt: 'Illustrative tutor helping an adult student with a lesson', title: 'Make something click.', line: 'One lesson at a time.', category: 'Tutoring' },
  { src: '/images/stylist.webp', alt: 'Illustrative hair stylist working with a client in a salon', title: 'Your own kind of talent.', line: 'Someone’s next great find.', category: 'Hair & beauty' },
]
const categories = [
  { slug: 'photography', name: 'Photography', detail: 'Capture something good' },
  { slug: 'tutoring', name: 'Tutoring', detail: 'Share what you know' },
  { slug: 'hair-beauty', name: 'Hair & beauty', detail: 'Bring your own flair' },
  { slug: 'tech-support', name: 'Tech support', detail: 'Make the digital simple' },
  { slug: 'catering', name: 'Food & catering', detail: 'A taste of your talent' },
  { slug: 'cleaning', name: 'Cleaning', detail: 'Make a fresh start' },
  { slug: 'gardening', name: 'Gardening', detail: 'Room to grow' },
  { slug: 'repairs', name: 'Repairs', detail: 'Back in working order' },
]
const journeys = {
  worker: [
    ['Bring your skills.', 'Create a free profile with your skills and area. Browse the work that fits your day.'],
    ['Find your next gig.', 'See the task, timing and exactly what you’ll receive before applying. The customer reviews your profile and chooses a worker.'],
    ['Do good work. Build your name.', 'Mark the job done. Once the customer confirms, it becomes a verified work record on your shareable portfolio.'],
  ],
  customer: [
    ['Tell us what needs doing.', 'Add the task, area, timing and your price. See what the worker will receive before you publish.'],
    ['Choose your person.', 'Compare applicants’ skills, completed work and reviews. You decide who gets the job.'],
    ['Confirm a job well done.', 'The worker marks it done; you confirm and leave a review. Your feedback helps their next opportunity.'],
  ],
}

function WorkerStories() {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [focused, setFocused] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (paused || hovering || focused || reducedMotion) return
    const timer = window.setInterval(() => setActive((index) => (index + 1) % scenes.length), 6500)
    return () => window.clearInterval(timer)
  }, [paused, hovering, focused, reducedMotion])
  const move = (direction: number) => { setActive((index) => (index + direction + scenes.length) % scenes.length); setPaused(true) }
  return (
    <section className="worker-stories" aria-label="Skills in action" aria-roledescription="carousel"
      onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}>
      {scenes.map((scene, index) => (
        <div key={scene.src} className={`story-frame ${active === index ? 'is-active' : ''}`} aria-hidden={active !== index}>
          <img src={scene.src} alt={scene.alt} width="1536" height="1024" fetchPriority={index === 0 ? 'high' : 'auto'} loading={index === 0 ? 'eager' : 'lazy'} />
          <div className="story-shade" />
          <div className="story-caption"><span className="story-category">{scene.category}</span><p>{scene.title}<br /><span>{scene.line}</span></p></div>
        </div>
      ))}
      <div className="story-location">THE SKILLS EDIT — SOUTH AFRICA</div>
      <div className="story-controls">
        <span className="tabular-nums text-xs tracking-[.18em]">0{active + 1} <span className="text-white/60">/ 03</span></span>
        <div className="flex gap-2">
          <button type="button" onClick={() => move(-1)} aria-label="Previous worker image"><ChevronLeft size={17} /></button>
          <button type="button" onClick={() => setPaused(!paused)} aria-label={paused || reducedMotion ? 'Play worker slideshow' : 'Pause worker slideshow'} disabled={reducedMotion} title={reducedMotion ? 'Automatic motion disabled by your device preference' : undefined}>{paused || reducedMotion ? <Play size={15} /> : <Pause size={15} />}</button>
          <button type="button" onClick={() => move(1)} aria-label="Next worker image"><ChevronRight size={17} /></button>
        </div>
      </div>
    </section>
  )
}

export default function Landing() {
  const [journey, setJourney] = useState<'worker' | 'customer'>('worker')
  const [amount, setAmount] = useState(500)
  const example = breakdown(amount * 100)
  return (
    <div className="landing-page">
      <section className="landing-hero page-width">
        <div className="hero-copy">
          <p className="eyebrow"><span className="size-1.5 rounded-full bg-brand-600" /> EARN IT. PROVE IT. GROW IT.</p>
          <h1>Your thing.<br /><span>Someone’s next find.</span></h1>
        </div>
        <div className="hero-intro">
          <p className="hero-description">The photos you take. The lessons you teach. The looks you create. Turn your skills into extra income—or find the right person for what you need.</p>
          <div className="hero-actions"><ButtonLink to="/discover" size="lg">Find work <ArrowUpRight size={19} aria-hidden /></ButtonLink><ButtonLink to="/signup?role=customer&next=%2Fgigs%2Fnew" variant="secondary" size="lg">Post a task <ArrowRight size={18} aria-hidden /></ButtonLink></div>
          <div className="hero-assurances"><span><Check size={15} aria-hidden /> Free to join</span><span><Check size={15} aria-hidden /> You choose the work</span></div>
        </div>
      </section>
      <section className="skills-gallery page-width" aria-label="Explore a world of skills">
        <WorkerStories />
        <Link to="/discover?category=tutoring" className="skill-editorial skill-editorial-tutor"><img src="/images/tutor.webp" alt="Illustrative tutor and student sharing a lesson" width="1536" height="1024" /><div><span>01 / SHARE WHAT YOU KNOW</span><h2>A little guidance.<br />A big difference.</h2><p>Explore tutoring <ArrowUpRight size={18} aria-hidden /></p></div></Link>
        <Link to="/discover?category=hair-beauty" className="skill-editorial skill-editorial-beauty"><img src="/images/stylist.webp" alt="Illustrative stylist creating a natural hairstyle" width="1536" height="1024" /><div><span>02 / DO YOUR THING</span><h2>Talent looks<br />good on you.</h2><p>Explore hair & beauty <ArrowUpRight size={18} aria-hidden /></p></div></Link>
      </section>
      <div className="trust-rail"><div className="page-width"><span><MapPin aria-hidden /> Work close to home</span><span><Wallet aria-hidden /> See exactly what you’ll receive</span><span><BadgeCheck aria-hidden /> Every gig builds your reputation</span></div></div>
      <section className="page-width landing-section" aria-labelledby="categories-title">
        <div className="section-heading"><div><p className="eyebrow">FIND YOUR CORNER</p><h2 id="categories-title">Many skills. <em>More possibilities.</em></h2></div><Link to="/discover" className="text-link">Explore all work <ArrowUpRight size={18} aria-hidden /></Link></div>
        <div className="category-grid">{categories.map((category) => <Link className="category-tile" key={category.slug} to={`/discover?category=${category.slug}`}><CategoryIcon category={category.slug} className="size-7" /><h3>{category.name}</h3><p>{category.detail}</p><ArrowUpRight className="category-arrow" size={17} aria-hidden /></Link>)}</div>
      </section>
      <section id="how-it-works" className="how-section">
        <div className="page-width landing-section">
          <div className="section-heading"><div><p className="eyebrow">LESS BACK-AND-FORTH. MORE GETTING ON WITH IT.</p><h2>Make your next move.</h2></div><div className="journey-toggle" role="group" aria-label="Choose your journey"><button type="button" aria-pressed={journey === 'worker'} onClick={() => setJourney('worker')}>I want to earn</button><button type="button" aria-pressed={journey === 'customer'} onClick={() => setJourney('customer')}>I need a hand</button></div></div>
          <ol className="journey-grid">{journeys[journey].map(([title, body], index) => <li key={title}><span className="step-number">0{index + 1}</span><h3>{title}</h3><p>{body}</p></li>)}</ol>
          <div className="how-bottom"><ButtonLink to={journey === 'worker' ? '/signup?role=worker' : '/signup?role=customer&next=%2Fgigs%2Fnew'}>{journey === 'worker' ? 'Start building your profile' : 'Let’s post your task'} <ArrowRight size={17} aria-hidden /></ButtonLink><p>Payments are simulated in this preview. No real money moves.</p></div>
        </div>
      </section>
      <section className="page-width landing-section portfolio-section">
        <div className="portfolio-visual">
          <img src="/images/photographer.webp" alt="Illustrative photographer preparing for a session" loading="lazy" width="1536" height="1024" />
          <div className="work-receipt"><div className="flex items-center justify-between gap-3"><span className="receipt-label"><BadgeCheck size={17} aria-hidden /> WORK THAT COUNTS</span><span className="text-[10px] text-muted">EXAMPLE</span></div><h3>Portraits delivered.<br />Reputation growing.</h3><div className="receipt-line"><span>Work completed</span><Check size={16} aria-hidden /></div><div className="receipt-line"><span>Confirmed by customer</span><Check size={16} aria-hidden /></div><div className="receipt-line"><span>Added to your ProofScript</span><BadgeCheck size={17} aria-hidden /></div></div>
        </div>
        <div className="portfolio-copy"><p className="eyebrow">MORE THAN A ONCE-OFF GIG</p><h2>Build a name.<br /><em>Not just an income.</em></h2><p>The lesson that clicked. The portraits they loved. The laptop you brought back to life. It all counts.</p><p>Every client-confirmed job grows your ProofScript—your work transcript of skills, reviews and work photos. Your evidence builds with each completed job, ready to share with your next customer.</p><Link to="/workers" className="text-link">Explore a ProofScript <ArrowUpRight size={19} aria-hidden /></Link><div className="verification-note"><ShieldCheck size={21} aria-hidden /><span>“Verified” means the job was confirmed by its customer. It doesn’t mean an identity or background check.</span></div></div>
      </section>
      <section className="page-width fee-section">
        <div><p className="eyebrow">STRAIGHTFORWARD FROM THE START</p><h2>Your skills.<br />Clear, fair pay.</h2><p>Free to join. The customer pays the agreed price with nothing added. KashWise’s 10% fee is the only deduction from the worker’s pay — no VAT is taken — and workers can cash out at a shop without a bank account. Each side sees its own number.</p><Link to="/trust" className="text-link">How trust & safety works <ArrowUpRight size={17} aria-hidden /></Link></div>
        <div className="fee-example"><div className="flex items-center justify-between"><span className="text-sm font-semibold">Try the numbers</span><span className="example-badge">ILLUSTRATIVE EXAMPLE</span></div><div className="fee-choices" role="group" aria-label="Example job price">{[200, 500, 1000].map((value) => <button key={value} type="button" aria-pressed={amount === value} onClick={() => setAmount(value)}>R{value.toLocaleString('en-ZA')}</button>)}</div><dl><div><dt>Customer pays</dt><dd>{formatRand(example.price)}</dd></div><div><dt>KashWise fee <span>({FEE_RATE_PERCENT}%)</span></dt><dd>{formatRand(example.fee)}</dd></div><div className="fee-total"><dt>Worker receives</dt><dd>{formatRand(example.workerNet)}</dd></div></dl><p><ShieldCheck size={15} aria-hidden /> Payment simulation · no charges or transfers</p></div>
      </section>
      <section className="page-width final-invite"><div><p className="eyebrow">BIG POTENTIAL. RIGHT AROUND THE CORNER.</p><h2>Your next opportunity<br />could be next door.</h2></div><div><ButtonLink to="/discover" size="lg" variant="sun">Find your next gig <ArrowUpRight size={19} aria-hidden /></ButtonLink><Link to="/signup?role=customer&next=%2Fgigs%2Fnew" className="text-link">Need something done? Post a task <ArrowRight size={16} aria-hidden /></Link></div></section>
      <section className="page-width demo-entry" aria-label="Try the demonstration"><div><p className="font-semibold">Take KashWise for a spin.</p><p className="mt-1 text-sm text-muted">Explore either side with a labelled demo account. No payment details needed.</p></div><DemoButtons /></section>
      <div className="page-width landing-footnote"><span><Clock3 size={13} aria-hidden /> Work on your terms. Earnings depend on available gigs and completed work.</span><span>Campaign images are AI-created illustrations of local work.</span></div>
    </div>
  )
}
