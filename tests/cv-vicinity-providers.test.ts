import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  extractSkillsFromCvText,
  extractTextFromCvFile,
  formatCleanBio,
  mergeCompletedJobSkills,
  parseCvText,
  suggestJobsFromCv,
} from '../src/lib/cv-parser'
import { buildIbanksGoalRoadmap } from '../src/lib/earn-goal'
import { createLocalDb, seedUser } from './helpers/local-db'

describe('CV upload & profile auto-update', () => {
  it('extracts skills, headline and bio from CV text while stripping contact details', () => {
    const cvText = `
      CURRICULUM VITAE
      Thabo Mokoena
      ID Number: 9202205800084
      Phone: 071 234 5678
      Email: thabo@example.com
      Address: 14 Vilakazi Street, Orlando West, Soweto

      Personal Profile
      Hardworking painter and handyman with 6 years of experience in house painting, plumbing repairs and garden maintenance around Soweto.
      I bring my own tools and always leave the site neat.
    `
    const draft = parseCvText(
      cvText,
      ['moving'],
      [{ slug: 'soweto', name: 'Soweto', city: 'Johannesburg' }],
    )
    expect(draft.display_name).toBe('Thabo Mokoena')
    expect(draft.area_slug).toBe('soweto')
    expect(draft.skills).toEqual(expect.arrayContaining(['moving', 'painting', 'repairs', 'gardening']))
    expect(draft.added_skills).toEqual(expect.arrayContaining(['painting', 'repairs', 'gardening']))
    expect(draft.headline).toContain('6 years of experience')
    expect(draft.bio).not.toContain('071')
    expect(draft.bio).not.toContain('thabo@example.com')
    expect(draft.bio).not.toContain('Vilakazi')
    expect(draft.bio).not.toContain('9202205800084')
  })

  it('extracts text and skills from an uploaded PDF CV', async () => {
    const doc = await PDFDocument.create()
    const font = await doc.embedFont(StandardFonts.Helvetica)
    const page = doc.addPage([595, 842])
    page.drawText('Nomsa Dlamini', { x: 50, y: 780, size: 16, font })
    page.drawText('Experienced domestic cleaner, hair stylist and catering cook with 5 years experience.', {
      x: 50,
      y: 750,
      size: 11,
      font,
    })
    const pdfBytes = await doc.save({ useObjectStreams: false })
    const file = new File([pdfBytes as unknown as BlobPart], 'nomsa-cv.pdf', { type: 'application/pdf' })
    const extracted = await extractTextFromCvFile(file)
    const skills = extractSkillsFromCvText(extracted)
    expect(skills).toEqual(expect.arrayContaining(['cleaning', 'hair-beauty', 'catering']))
  })

  it('appends new skills from completed jobs without losing existing skills', () => {
    expect(mergeCompletedJobSkills(['painting'], ['painting', 'repairs', 'gardening'])).toEqual([
      'painting',
      'repairs',
      'gardening',
    ])
  })

  it('stitches wrapped CV lines into a clean About Me bio without mid-sentence periods or form-field noise', () => {
    const messyCv = `
      CURRICULUM VITAE OF BOITUMELO MBHELE
      Surname: Mbhele
      First Names: Boitumelo
      Marital Status: Single
      Gender: Male
      Nationality: South African
      Criminal Record: None
      Driver's Licence: Code 10

      ABOUT ME
      Hardworking and reliable technician with 5 years of experience in
      house painting, plumbing repairs and laptop tech support
      around Soweto and Johannesburg.
      I pride myself on arriving early and leaving every client satisfied.

      EDUCATION
      Highest Grade Passed: Grade 12
      Subjects Passed: English, isiZulu, Mathematics
      REFERENCES
      Mr S Khumalo - 082 111 2222
    `
    const draft = parseCvText(messyCv, [], [{ slug: 'soweto', name: 'Soweto', city: 'Johannesburg' }])
    expect(draft.display_name).toBe('BOITUMELO MBHELE')
    expect(draft.bio).toContain('Hardworking and reliable technician with 5 years of experience in house painting, plumbing repairs and laptop tech support around Soweto and Johannesburg.')
    expect(draft.bio).not.toContain('experience in. House')
    expect(draft.bio).not.toContain('Marital Status')
    expect(draft.bio).not.toContain('Subjects Passed')
    expect(draft.bio).not.toContain('082 111 2222')
    expect(draft.suggested_jobs.map((j) => j.category)).toEqual(
      expect.arrayContaining(['painting', 'repairs', 'tech-support', 'moving']),
    )
  })

  it('heals a legacy mangled bio that had mid-sentence periods or PDF artifacts', () => {
    const mangled =
      'Experienced painter and handyman with 6 years of experience in. House painting and plumbing repairs around. Soweto. FlateDecode endstream Marital Status: Single.'
    const healed = formatCleanBio(mangled, { skills: ['painting', 'repairs'], areaName: 'Soweto' })
    expect(healed).toContain('experience in house painting and plumbing repairs around Soweto.')
    expect(healed).not.toContain('FlateDecode')
    expect(healed).not.toContain('Marital Status')
  })

  it('suggests concrete jobs from extracted CV and builds an iBanks roadmap to meet an earning goal', () => {
    const cvJobs = suggestJobsFromCv(
      'Experienced house painter, plumbing handyman and garden landscaper.',
      ['painting', 'repairs', 'gardening'],
    )
    expect(cvJobs.length).toBe(3)
    expect(cvJobs[0].typical_net_cents).toBeGreaterThan(0)

    const roadmap = buildIbanksGoalRoadmap({
      targetCents: 150_000,
      settledCents: 20_000,
      bookedCents: 0,
      suggestions: [
        {
          id: 'g1',
          title: 'Paint a 2-bedroom flat',
          category: 'painting',
          area_slug: 'soweto',
          scheduled_date: '2026-11-28',
          time_window: 'morning',
          payout_cents: 60_000,
          fee_cents: 6_000,
          worker_net_cents: 54_000,
          distance_km: 1.5,
          is_demo: false,
          poster_eligible: true,
          application_status: null,
          reasons: ['Matches your painting skill'],
          schedule_note: 'Confirm timing with client.',
        },
      ],
      cvSuggestedJobs: cvJobs,
      selectedSkills: ['painting'],
      allWorkerSkills: ['painting', 'repairs', 'gardening'],
    })

    expect(roadmap.unselected_cv_skills).toEqual(['repairs', 'gardening'])
    expect(roadmap.steps).toHaveLength(1)
    expect(roadmap.steps[0].cumulative_cents).toBe(74_000)
    expect(roadmap.remaining_after_all_cents).toBe(76_000)
    expect(roadmap.cv_mix_to_close_gap.length).toBeGreaterThan(0)
    const mixSum = roadmap.cv_mix_to_close_gap.reduce((acc, m) => acc + m.total_net_cents, 0)
    expect(mixSum).toBeGreaterThanOrEqual(roadmap.remaining_after_all_cents)
  })
})

describe('SQL: auto-append skill on completed job & client saved service providers', () => {
  it('appends the completed job category to worker skills and lets clients save & request providers', async () => {
    const l = await createLocalDb()
    const clientId = '11111111-1111-4111-8111-111111111111'
    const workerId = '22222222-2222-4222-8222-222222222222'
    await seedUser(l, { id: clientId, name: 'Client One', role: 'customer' })
    await seedUser(l, { id: workerId, name: 'Worker One', role: 'worker' })

    // Worker starts with only 'painting'
    await l.as(workerId, `update public.profiles set skills = array['painting'] where id = $1::uuid`, [workerId])

    // Client adds Worker One to their saved service providers
    await l.as(clientId, `select public.save_client_provider($1::uuid, $2)`, [workerId, 'Regular handyman'])
    const saved = await l.as<{ worker_id: string; label: string }>(
      clientId,
      `select worker_id, label from public.client_saved_providers`,
    )
    expect(saved).toEqual([{ worker_id: workerId, label: 'Regular handyman' }])

    // Client requests a 'gardening' service directly from Worker One
    const envelope = JSON.stringify({ v: 1, kid: 'test', alg: 'test', kem: '', iv: '', ct: '' })
    const [{ id: gigId }] = await l.as<{ id: string }>(
      clientId,
      `select public.request_provider_service(
        null, $1::uuid, 'Clean up backyard garden', 'gardening',
        'Mow the lawn, trim the hedges and clear weeds in the backyard.',
        'soweto', ((now() at time zone 'Africa/Johannesburg')::date + 1), 'morning', 50000, $2::jsonb
      ) as id`,
      [workerId, envelope],
    )
    expect(gigId).toBeTruthy()

    // Complete the job via start -> mark_done -> confirm_completion
    const codes = await l.as<{ step: string; code: string }>(
      clientId,
      `select step, code from public.gig_handshakes where gig_id = $1::uuid`,
      [gigId],
    )
    const startCode = codes.find((c) => c.step === 'start')!.code
    const finishCode = codes.find((c) => c.step === 'finish')!.code

    await l.as(workerId, `select public.start_gig($1::uuid, $2)`, [gigId, startCode])
    await l.as(workerId, `select public.mark_gig_done($1::uuid, $2)`, [gigId, finishCode])
    await l.as(clientId, `select public.confirm_completion($1::uuid)`, [gigId])

    // Worker's profile now automatically has 'gardening' appended to their skills!
    const [updatedWorker] = await l.as<{ skills: string[] }>(
      workerId,
      `select skills from public.profiles where id = $1::uuid`,
      [workerId],
    )
    expect(updatedWorker.skills).toEqual(['painting', 'gardening'])

    // Client can remove the saved provider
    await l.as(clientId, `select public.remove_client_provider($1::uuid)`, [workerId])
    const afterRemove = await l.as(clientId, `select * from public.client_saved_providers`)
    expect(afterRemove).toEqual([])
  }, 30_000)
})
