/* global document */
import { chromium } from '@playwright/test'
import { readFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { renderSVG } from 'uqr'

const ROOT = process.cwd()
const OUT_DIR = join(ROOT, 'output')
const ARTIFACT_DIR = 'C:\\Users\\mrsbo\\.gemini\\antigravity-cli\\brain\\3dd703fe-3a76-414d-94b7-726fd9184887'

mkdirSync(OUT_DIR, { recursive: true })

function dataUri(relPath, mime) {
  const full = join(ROOT, relPath)
  if (!existsSync(full)) return ''
  return `data:${mime};base64,${readFileSync(full).toString('base64')}`
}

const heroImg = dataUri('public/images/photographer.webp', 'image/webp')

const qrSvg = renderSVG('https://kashwise1.netlify.app', {
  ecc: 'M',
  border: 1,
  whiteColor: 'transparent',
  blackColor: '#042f2e',
})
const qrDataUri = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString('base64')}`

const SA_FLAG_SVG = `<svg width="20" height="14" viewBox="0 0 30 20" style="border-radius:3px;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,0.4)">
  <rect width="30" height="20" fill="#007749"/>
  <path d="M0,0 L30,0 L30,6.5 L15,6.5 L8,0 Z" fill="#E03C31"/>
  <path d="M0,20 L30,20 L30,13.5 L15,13.5 L8,20 Z" fill="#001489"/>
  <path d="M8,0 L16,7.5 L30,7.5 L30,12.5 L16,12.5 L8,20 L5,20 L13,10 L5,0 Z" fill="#FFFFFF"/>
  <path d="M0,2 L9.5,10 L0,18 Z" fill="#000000"/>
  <path d="M0,2 L1.8,0.5 L11.8,10 L1.8,19.5 L0,18 L8.5,10 Z" fill="#FFB81C"/>
  <path d="M6.5,0 L14.5,8 L30,8 L30,12 L14.5,12 L6.5,20 L3.5,20 L12,10 L3.5,0 Z" fill="#007749"/>
</svg>`

function buildPosterHtml({ width, height, isPortrait }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Instrument+Serif:ital@0;1&display=swap');

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      width: ${width}px;
      height: ${height}px;
      overflow: hidden;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #03090c;
      color: #f8fafc;
      -webkit-font-smoothing: antialiased;
    }

    .canvas {
      position: relative;
      width: 100%;
      height: 100%;
      padding: ${isPortrait ? '52px 52px 44px' : '48px 54px 44px'};
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      background:
        radial-gradient(circle at 88% 12%, rgba(245, 158, 11, 0.24) 0%, transparent 42%),
        radial-gradient(circle at 14% 22%, rgba(20, 184, 166, 0.26) 0%, transparent 48%),
        radial-gradient(circle at 80% 82%, rgba(13, 148, 136, 0.25) 0%, transparent 52%),
        linear-gradient(145deg, #031516 0%, #051c20 48%, #02080c 100%);
    }

    .grid-overlay {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(45, 212, 191, 0.045) 1px, transparent 1px),
        linear-gradient(90deg, rgba(45, 212, 191, 0.045) 1px, transparent 1px);
      background-size: 40px 40px;
      mask-image: radial-gradient(ellipse at center, rgba(0,0,0,0.85) 20%, transparent 80%);
      pointer-events: none;
    }

    .glow-border {
      position: absolute;
      inset: 16px;
      border-radius: 30px;
      border: 1.5px solid rgba(45, 212, 191, 0.18);
      pointer-events: none;
    }

    /* Top Header */
    .top-bar {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .brand-name {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: -0.055em;
      color: #ffffff;
    }

    .brand-name span {
      color: #2dd4bf;
    }

    .aoty-pill {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 10px 22px;
      border-radius: 999px;
      background: linear-gradient(135deg, rgba(245, 158, 11, 0.22) 0%, rgba(251, 191, 36, 0.1) 100%);
      border: 1.5px solid rgba(251, 191, 36, 0.55);
      box-shadow: 0 8px 28px rgba(245, 158, 11, 0.18);
    }

    .aoty-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #fbbf24;
      box-shadow: 0 0 12px #fbbf24;
    }

    .aoty-text {
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #fde68a;
    }

    /* Main Content Layout */
    .main-grid {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: ${isPortrait ? '1fr' : '1.05fr 0.95fr'};
      gap: ${isPortrait ? '24px' : '32px'};
      align-items: center;
      margin: auto 0;
    }

    .eyebrow-tag {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      padding: 7px 14px;
      border-radius: 9px;
      background: rgba(20, 184, 166, 0.14);
      border: 1px solid rgba(45, 212, 191, 0.32);
      color: #5eead4;
      font-size: 12.5px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 14px;
    }

    .headline {
      font-size: ${isPortrait ? '54px' : '52px'};
      font-weight: 800;
      line-height: 1.04;
      letter-spacing: -0.04em;
      color: #ffffff;
    }

    .headline em {
      font-family: 'Instrument Serif', Georgia, serif;
      font-style: italic;
      font-weight: 400;
      color: #2dd4bf;
      font-size: ${isPortrait ? '62px' : '60px'};
    }

    .headline .gold {
      background: linear-gradient(90deg, #fde047 0%, #f59e0b 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }

    .subheadline {
      margin-top: 14px;
      font-size: ${isPortrait ? '18px' : '17.5px'};
      line-height: 1.48;
      color: #cbd5e1;
      max-width: 600px;
      font-weight: 500;
    }

    /* Feature Pillars */
    .pillars {
      margin-top: ${isPortrait ? '20px' : '22px'};
      display: grid;
      grid-template-columns: ${isPortrait ? 'repeat(2, 1fr)' : '1fr'};
      gap: 11px;
    }

    .pillar {
      display: flex;
      align-items: flex-start;
      gap: 13px;
      padding: 13px 16px;
      border-radius: 16px;
      background: rgba(15, 29, 34, 0.82);
      border: 1px solid rgba(45, 212, 191, 0.24);
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.28);
    }

    .pillar-icon {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: linear-gradient(135deg, rgba(20, 184, 166, 0.28), rgba(13, 148, 136, 0.1));
      border: 1px solid rgba(45, 212, 191, 0.42);
      display: grid;
      place-items: center;
      color: #2dd4bf;
      flex-shrink: 0;
    }

    .pillar-title {
      font-size: 15.5px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.01em;
    }

    .pillar-title span {
      color: #fbbf24;
    }

    .pillar-desc {
      margin-top: 2px;
      font-size: 13px;
      line-height: 1.38;
      color: #94a3b8;
    }

    /* Right / Phone Showcase */
    .showcase {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .phones-stage {
      position: relative;
      width: 100%;
      height: ${isPortrait ? '380px' : '540px'};
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .hero-card {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: 26px;
      overflow: hidden;
      border: 1.5px solid rgba(45, 212, 191, 0.35);
      background: #06161a;
      box-shadow: 0 28px 60px rgba(0, 0, 0, 0.65);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 20px;
    }

    .hero-photo {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center 25%;
      opacity: 0.28;
      filter: contrast(1.08) saturate(1.1);
    }

    .hero-gradient {
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(4, 20, 24, 0.45) 0%, rgba(4, 20, 24, 0.85) 55%, #041317 100%);
    }

    .floating-badge {
      position: relative;
      z-index: 3;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 11px 16px;
      border-radius: 15px;
      background: rgba(6, 28, 33, 0.92);
      border: 1px solid rgba(251, 191, 36, 0.45);
    }

    .floating-badge-title {
      font-size: 12.5px;
      font-weight: 800;
      color: #fde68a;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }

    .floating-badge-sub {
      font-size: 11.5px;
      color: #e2e8f0;
      font-weight: 600;
      margin-top: 1px;
    }

    /* 3 Custom High-Craft Dark UI Phone Mockups */
    .screens-row {
      position: relative;
      z-index: 2;
      display: grid;
      grid-template-columns: 0.92fr 1.08fr 0.92fr;
      align-items: end;
      gap: 12px;
      margin-top: auto;
    }

    .ui-phone {
      border-radius: 18px;
      background: #0a1419;
      border: 1.5px solid rgba(45, 212, 191, 0.32);
      box-shadow: 0 18px 36px rgba(0, 0, 0, 0.7);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      height: ${isPortrait ? '265px' : '370px'};
      overflow: hidden;
    }

    .ui-phone.featured {
      height: ${isPortrait ? '292px' : '408px'};
      border: 2px solid #fbbf24;
      background: linear-gradient(180deg, #0d1d22 0%, #081216 100%);
      box-shadow: 0 22px 48px rgba(245, 158, 11, 0.25);
    }

    .ui-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 9.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #2dd4bf;
    }

    .ui-pill-gold {
      background: rgba(245, 158, 11, 0.2);
      border: 1px solid rgba(251, 191, 36, 0.5);
      color: #fde68a;
      padding: 2px 6px;
      border-radius: 99px;
      font-size: 8.5px;
      font-weight: 800;
    }

    .ui-title {
      font-size: 13px;
      font-weight: 800;
      color: #ffffff;
      line-height: 1.2;
    }

    .ui-card {
      background: rgba(18, 35, 42, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 11px;
      padding: 8px 9px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .ui-card-title {
      font-size: 10.5px;
      font-weight: 700;
      color: #f8fafc;
    }

    .ui-card-sub {
      font-size: 9px;
      color: #94a3b8;
      line-height: 1.3;
    }

    .ui-price {
      font-size: 13px;
      font-weight: 800;
      color: #2dd4bf;
    }

    .ui-chip-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .ui-chip {
      font-size: 8.5px;
      font-weight: 700;
      padding: 2.5px 6px;
      border-radius: 6px;
      background: rgba(20, 184, 166, 0.16);
      color: #5eead4;
      border: 1px solid rgba(45, 212, 191, 0.25);
    }

    .ui-chip.gold {
      background: rgba(245, 158, 11, 0.18);
      color: #fde68a;
      border-color: rgba(251, 191, 36, 0.35);
    }

    .ui-bar {
      height: 5px;
      border-radius: 99px;
      background: rgba(255, 255, 255, 0.08);
      overflow: hidden;
    }

    .ui-bar > span {
      display: block;
      height: 100%;
      border-radius: 99px;
      background: linear-gradient(90deg, #14b8a6, #fbbf24);
    }

    .ui-btn {
      margin-top: auto;
      background: linear-gradient(135deg, #14b8a6, #0d9488);
      color: #ffffff;
      font-size: 9.5px;
      font-weight: 800;
      text-align: center;
      padding: 6px 8px;
      border-radius: 8px;
    }

    .ui-btn.gold {
      background: linear-gradient(135deg, #fde047, #f59e0b);
      color: #041317;
    }

    /* Bottom Vote CTA Bar */
    .vote-bar {
      position: relative;
      z-index: 2;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 18px 24px;
      border-radius: 22px;
      background: linear-gradient(135deg, rgba(13, 148, 136, 0.24) 0%, rgba(6, 78, 59, 0.48) 55%, rgba(245, 158, 11, 0.2) 100%);
      border: 1.5px solid rgba(251, 191, 36, 0.55);
      box-shadow: 0 20px 45px rgba(0, 0, 0, 0.45);
    }

    .vote-cta-left {
      display: flex;
      align-items: center;
      gap: 18px;
    }

    .vote-button {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 15px 24px;
      border-radius: 15px;
      background: linear-gradient(135deg, #fde047 0%, #f59e0b 100%);
      color: #041317;
      font-size: 19px;
      font-weight: 900;
      letter-spacing: -0.02em;
      box-shadow: 0 10px 25px rgba(245, 158, 11, 0.35);
      white-space: nowrap;
    }

    .vote-info h3 {
      font-size: 19px;
      font-weight: 800;
      color: #ffffff;
      letter-spacing: -0.02em;
    }

    .vote-info p {
      margin-top: 3px;
      font-size: 13.5px;
      color: #cbd5e1;
      font-weight: 500;
    }

    .vote-info strong {
      color: #5eead4;
      font-weight: 800;
    }

    .qr-box {
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(255, 255, 255, 0.97);
      padding: 7px 14px 7px 7px;
      border-radius: 15px;
      color: #042f2e;
      flex-shrink: 0;
    }

    .qr-box img {
      width: 66px;
      height: 66px;
      display: block;
    }

    .qr-meta {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .qr-meta .scan {
      font-size: 10.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #0d9488;
    }

    .qr-meta .domain {
      font-size: 13.5px;
      font-weight: 900;
      color: #042f2e;
    }

    .qr-meta .founder {
      font-size: 10.5px;
      font-weight: 700;
      color: #475569;
    }
  </style>
</head>
<body>
  <div class="canvas">
    <div class="grid-overlay"></div>
    <div class="glow-border"></div>

    <!-- Header -->
    <header class="top-bar">
      <div class="brand">
        <svg width="50" height="50" viewBox="0 0 32 32">
          <defs>
            <linearGradient id="kw-bg" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#14b8a6" />
              <stop offset="55%" stop-color="#0d9488" />
              <stop offset="100%" stop-color="#064e3b" />
            </linearGradient>
            <linearGradient id="kw-gold" x1="17" y1="6" x2="27" y2="23" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#fde047" />
              <stop offset="100%" stop-color="#f59e0b" />
            </linearGradient>
          </defs>
          <rect width="32" height="32" rx="8.5" fill="url(#kw-bg)" />
          <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="7.75" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="1.5" />
          <path d="M7.5 7.5v17M7.5 16.5 15.2 8.2M11 13l5.5 11.5" fill="none" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M17.5 18.8 20.4 21.8 26.2 14.2" fill="none" stroke="url(#kw-gold)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          <circle cx="23.8" cy="8.2" r="2.7" fill="url(#kw-gold)" />
        </svg>
        <div class="brand-name">Kash<span>Wise</span></div>
      </div>

      <div class="aoty-pill">
        <span class="aoty-dot"></span>
        <span class="aoty-text">🏆 FNB App of the Year · Vote Now</span>
      </div>
    </header>

    <!-- Main Showcase -->
    <div class="main-grid">
      <div class="copy-col">
        <div class="eyebrow-tag">${SA_FLAG_SVG} Built for Mzansi’s Hustle &amp; Skills</div>
        <h1 class="headline">
          Earn it. <em>Prove it.</em><br />
          <span class="gold">Grow it.</span>
        </h1>
        <p class="subheadline">
          Turning everyday local gigs into verified career capital, post-quantum signed CVs, iBanks earnings intelligence, and instant Mzansi cash-outs.
        </p>

        <div class="pillars">
          <div class="pillar">
            <div class="pillar-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <div>
              <div class="pillar-title">Flexible Vicinity &amp; <span>CV / Voice Match</span></div>
              <div class="pillar-desc">Upload your CV or speak in your language to build your profile, match gigs in your area first, and expand vicinity step-by-step.</div>
            </div>
          </div>

          <div class="pillar">
            <div class="pillar-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
            </div>
            <div>
              <div class="pillar-title"><span>ProofScript™</span> Verified CV &amp; Auto-Skills</div>
              <div class="pillar-desc">Every client-confirmed job automatically appends proven skills to your profile and builds a verifiable PDF CV &amp; Proof of Income.</div>
            </div>
          </div>

          <div class="pillar">
            <div class="pillar-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <div>
              <div class="pillar-title"><span>iBanks</span> Money &amp; Spaza / eWallet Cash-Outs</div>
              <div class="pillar-desc">Withdraw earnings at any local spaza shop (Flash, Kazang, OTT, 1Voucher), via FNB eWallet, or Ozow Instant Payout.</div>
            </div>
          </div>

          ${isPortrait ? `
          <div class="pillar">
            <div class="pillar-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div>
              <div class="pillar-title">Retain Your <span>Service Providers</span></div>
              <div class="pillar-desc">Clients save their trusted service providers on their roster and request services in one tap while addresses stay private.</div>
            </div>
          </div>
          ` : ''}
        </div>
      </div>

      <div class="showcase">
        <div class="phones-stage">
          <div class="hero-card">
            <img class="hero-photo" src="${heroImg}" alt="" />
            <div class="hero-gradient"></div>

            <div class="floating-badge">
              <div>
                <div class="floating-badge-title">★ Hyperlocal Work Marketplace · Powered by iBanks</div>
                <div class="floating-badge-sub">Every completed gig builds your verified CV &amp; financial proof</div>
              </div>
              ${SA_FLAG_SVG}
            </div>

            <div class="screens-row">
              <!-- Phone 1: Find Work & Vicinity -->
              <div class="ui-phone">
                <div class="ui-top">
                  <span>Find Work</span>
                  <span class="ui-pill-gold">In Soweto</span>
                </div>
                <div class="ui-title">Gigs in your area first</div>
                <div class="ui-chip-row">
                  <span class="ui-chip">In Soweto (4)</span>
                  <span class="ui-chip">+10 km</span>
                  <span class="ui-chip">+25 km</span>
                </div>
                <div class="ui-card">
                  <div class="ui-card-title">Repaint spaza shop front</div>
                  <div class="ui-card-sub">Soweto · Morning · Address encrypted</div>
                  <div class="ui-price">R765 <span style="font-size:8.5px;color:#94a3b8;font-weight:600">you receive</span></div>
                </div>
                ${!isPortrait ? `
                <div class="ui-card">
                  <div class="ui-card-title">Fix kitchen mixer tap</div>
                  <div class="ui-card-sub">Orlando West · Afternoon</div>
                  <div class="ui-price">R450 <span style="font-size:8.5px;color:#94a3b8;font-weight:600">you receive</span></div>
                </div>
                ` : ''}
                <div class="ui-btn">Expand vicinity (+10 km) →</div>
              </div>

              <!-- Phone 2 (Featured): ProofScript Verified CV -->
              <div class="ui-phone featured">
                <div class="ui-top">
                  <span>ProofScript™ CV</span>
                  <span class="ui-pill-gold">✓ Verified</span>
                </div>
                <div class="ui-title">Sipho Dlamini</div>
                <div class="ui-card-sub" style="margin-top:-4px">Painting · Repairs · Gardening · Soweto</div>
                <div class="ui-card" style="border-color:rgba(251,191,36,0.35)">
                  <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:800;color:#fde68a">
                    <span>14 Confirmed Jobs</span>
                    <span>4.9 ★ Rating</span>
                  </div>
                  <div class="ui-card-sub">Skills auto-appended from CV &amp; completed jobs</div>
                </div>
                <div class="ui-card">
                  <div class="ui-card-title">Proven Skills</div>
                  <div style="font-size:8.5px;color:#cbd5e1;display:flex;justify-content:space-between"><span>Painting</span><span>8 gigs</span></div>
                  <div class="ui-bar"><span style="width:88%"></span></div>
                  <div style="font-size:8.5px;color:#cbd5e1;display:flex;justify-content:space-between;margin-top:2px"><span>Repairs &amp; Handyman</span><span>6 gigs</span></div>
                  <div class="ui-bar"><span style="width:68%"></span></div>
                </div>
                ${!isPortrait ? `
                <div class="ui-chip-row">
                  <span class="ui-chip gold">ML-DSA-65 Signed</span>
                  <span class="ui-chip">CV Uploaded ✓</span>
                </div>
                ` : ''}
                <div class="ui-btn gold">Download Verified CV (PDF)</div>
              </div>

              <!-- Phone 3: iBanks Money & Mzansi Cash-Out -->
              <div class="ui-phone">
                <div class="ui-top">
                  <span>iBanks Wallet</span>
                  <span class="ui-pill-gold">Mzansi Pay</span>
                </div>
                <div class="ui-title">R2 450 <span style="font-size:9px;color:#94a3b8;font-weight:600">available</span></div>
                <div class="ui-card">
                  <div class="ui-card-title">Cash Out — Your Terms</div>
                  <div class="ui-chip-row" style="margin-top:2px">
                    <span class="ui-chip gold">🏪 Spaza Voucher</span>
                    <span class="ui-chip">📱 FNB eWallet</span>
                    <span class="ui-chip">⚡ Ozow Instant</span>
                  </div>
                  <div class="ui-card-sub" style="margin-top:2px">Flash · Kazang · OTT · 1Voucher · Boxer · Shoprite</div>
                </div>
                ${!isPortrait ? `
                <div class="ui-card">
                  <div class="ui-card-title">iBanks 7-Day Outlook</div>
                  <div class="ui-price" style="font-size:11.5px">R1 200 – R1 850</div>
                  <div class="ui-card-sub">Signed Proof of Income ready</div>
                </div>
                ` : ''}
                <div class="ui-btn">Send Spaza Cash Voucher</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom Vote Call to Action -->
    <footer class="vote-bar">
      <div class="vote-cta-left">
        <div class="vote-button">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m9 12 2 2 4-4"/><path d="M5 7c0-1.1.9-2 2-2h10a2 2 0 0 1 2 2v12H5V7Z"/><path d="M22 19H2"/></svg>
          <span>VOTE FOR KASHWISE</span>
        </div>
        <div class="vote-info">
          <h3>Vote for KashWise at the FNB App of the Year Awards!</h3>
          <p>Explore live at <strong>kashwise1.netlify.app</strong> · Created by <strong>Boitumelo Mbhele (Banks)</strong></p>
        </div>
      </div>

      <div class="qr-box">
        <img src="${qrDataUri}" alt="QR Code" />
        <div class="qr-meta">
          <span class="scan">Scan to Try &amp; Vote</span>
          <span class="domain">kashwise1.netlify.app</span>
          <span class="founder">#FNBAppOfTheYear</span>
        </div>
      </div>
    </footer>
  </div>
</body>
</html>`
}

async function main() {
  const browser = await chromium.launch()

  const variants = [
    {
      name: 'KashWise-FNB-AOTY-Vote-Poster.png',
      width: 1200,
      height: 1200,
      isPortrait: false,
    },
    {
      name: 'KashWise-FNB-AOTY-Vote-Poster-Portrait.png',
      width: 1080,
      height: 1350,
      isPortrait: true,
    },
  ]

  for (const v of variants) {
    const context = await browser.newContext({
      viewport: { width: v.width, height: v.height },
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    await page.setContent(buildPosterHtml(v), { waitUntil: 'networkidle' })
    await page.evaluate(() => document.fonts?.ready)
    const outPath = join(OUT_DIR, v.name)
    await page.screenshot({ path: outPath, type: 'png' })
    if (existsSync(ARTIFACT_DIR)) {
      copyFileSync(outPath, join(ARTIFACT_DIR, v.name))
    }
    console.log('Generated:', outPath)
    await context.close()
  }

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
