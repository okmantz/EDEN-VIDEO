// Video templates: a ready-made edit where you only drop in your clips and change a few words.
//
// A template is plain data (slots for clips, text fields, a look, transitions, effects, sounds). `buildTemplate` turns it
// plus the person's files into a normal project, so everything stays editable in the full editor afterwards.
import { uid } from './util.js';
import { TEXT_PRESETS, mergeText, TEXT_DEFAULT } from './textrender.js';
import { RATIOS, videoClip, genClip, textClip, audioClip, fxClip, end, projectDuration } from './model.js';
import { effectDefaults } from './effects.js';
import { GENERATORS } from './generators.js';
import { MUSIC } from './synth.js';
import { builtinMedia } from './audio.js';
import { addBrandOverlays, addEndCard } from './autoedit.js';
import { FONTS } from './textrender.js';
import { S, CARD, T, PAL } from './tpl-kit.js';
import { MORE_TEMPLATES } from './templates-more.js';
import { PRO_TEMPLATES } from './templates-pro.js';
import { TEMPLATE_STOCK } from './stock-catalog.js';

export const CATEGORIES = ['All', 'Social', 'Business', 'Finance', 'Lifestyle', 'Luxury', 'Cinematic', 'Energy', 'Events'];

/* ----- tiny constructors live in tpl-kit.js ----- */

export const TEMPLATES = [
  /* the polished, genre-specific edits come first (see templates-pro.js) */
  ...PRO_TEMPLATES,

  /* ================================================================= SOCIAL */
  { id: 'quick-cuts', name: 'Quick Cuts', cat: 'Social', ratio: '9:16', blurb: 'Fast, beat-synced cuts with punchy flashes.', badge: 'Popular',
    pal: PAL('#FF3D71', '#0B0B12', '#FFD24A'), music: 'trap', musicVol: 0.6, look: 'vivid', sync: true, gen: 'energy',
    trans: { type: 'whip', dur: 0.2 }, sfx: { id: 'whoosh', vol: 0.5 }, fxLayers: [{ type: 'flash', at: 'cuts', dur: 0.16, amt: 0.7 }],
    cover: { gen: 'speedlines', title: 'QUICK\nCUTS' },
    slots: [S('Hook', 'Your strongest, most eye-catching shot', 1.2, { gen: 'speedlines', fx: [['shake', 0.35]] }), S('Shot 2', 'Anything with movement', 1, { fx: [['shake', 0.3]] }), S('Shot 3', 'A close-up', 1),
      S('Shot 4', 'Another angle', 1, { fx: [['shake', 0.3]] }), S('Shot 5', 'The payoff', 1), S('Final shot', 'A strong ending', 1.6, { gen: 'energy' })],
    inputs: [{ id: 'title', label: 'Title', value: 'WAIT FOR IT', max: 24 }, { id: 'cta', label: 'End line', value: 'FOLLOW FOR MORE', max: 28 }],
    layers: [T('{title}', { slot: 0, off: 0.1, style: 'Bold Impact', size: 0.115, y: -0.05, o: { stroke: { color: '$primary' } }, in: 'pop' }),
      T('{cta}', { slot: 5, off: 0.2, style: 'Tag', size: 0.05, y: 0.26, o: { bg: { color: '$primary' }, color: '#ffffff' }, in: 'slideup' })] },

  { id: 'photo-dump', name: 'Photo Dump', cat: 'Social', ratio: '9:16', blurb: 'A burst of your best photos, cut to the beat.',
    pal: PAL('#FFB020', '#14110A', '#FF5C8A'), music: 'pop', musicVol: 0.55, look: 'polaroid', sync: true, gen: 'liquidpastel',
    trans: { type: 'pushleft', dur: 0.22 }, cover: { gen: 'dreambokeh', title: 'PHOTO\nDUMP' },
    slots: Array.from({ length: 8 }, (_, i) => S(`Photo ${i + 1}`, i === 0 ? 'Your favorite photo' : 'A photo or a short clip', 1.02, { tilt: i % 2 ? 2 : -2 })),
    inputs: [{ id: 'title', label: 'Title', value: 'photo dump', max: 22 }, { id: 'date', label: 'Small text', value: 'this month', max: 22 }],
    layers: [T('{title}', { slot: 0, off: 0.1, dur: 1.0, style: 'Retro Script', size: 0.085, y: -0.34, in: 'pop', o: { stroke: { color: '$primary' }, color: '$accent' } }),
      T('{date}', { slot: 0, off: 0.3, dur: 0.75, style: 'Tag', size: 0.04, y: -0.18, o: { bg: { color: '$accent' }, color: '#111111' }, in: 'slideup' })] },

  { id: 'top-3', name: 'Top 3 List', cat: 'Social', ratio: '9:16', blurb: 'A countdown with giant numbers and your own picks.',
    pal: PAL('#22D3EE', '#08131A', '#FFD24A'), music: 'techhouse', musicVol: 0.45, look: 'clean', gen: 'gradmesh', trans: { type: 'slideup', dur: 0.35 }, sfx: { id: 'pop', vol: 0.6 },
    cover: { gen: 'gradmesh', title: 'TOP\n3' },
    slots: [CARD('Title card', 2.2, 'gradmesh'), S('Number 3', 'Third place', 3), S('Number 2', 'Second place', 3), S('Number 1', 'The winner', 3.4)],
    inputs: [{ id: 'title', label: 'Title', value: 'MY TOP 3', max: 22 }, { id: 'sub', label: 'Subtitle', value: 'ranked', max: 24 }, { id: 'i3', label: 'Number 3', value: 'Third pick', max: 26 }, { id: 'i2', label: 'Number 2', value: 'Second pick', max: 26 }, { id: 'i1', label: 'Number 1', value: 'The best one', max: 26 }],
    layers: [T('{title}', { slot: 0, off: 0.2, style: 'Bold Impact', size: 0.13, y: -0.04, o: { stroke: { color: '$primary' } }, in: 'pop' }), T('{sub}', { slot: 0, off: 0.5, style: 'Tag', size: 0.045, y: 0.1, o: { bg: { color: '$accent' }, color: '#111' }, in: 'slideup' }),
      T('3', { slot: 1, off: 0.1, style: 'Bold Impact', size: 0.34, x: -0.26, y: -0.3, o: { stroke: { color: '$primary' }, shadow: { on: true } }, in: 'pop' }), T('{i3}', { slot: 1, off: 0.3, style: 'Podcast Box', size: 0.055, y: 0.3, in: 'slideup' }),
      T('2', { slot: 2, off: 0.1, style: 'Bold Impact', size: 0.34, x: -0.26, y: -0.3, o: { stroke: { color: '$primary' } }, in: 'pop' }), T('{i2}', { slot: 2, off: 0.3, style: 'Podcast Box', size: 0.055, y: 0.3, in: 'slideup' }),
      T('1', { slot: 3, off: 0.1, style: 'Bold Impact', size: 0.34, x: -0.26, y: -0.3, o: { color: '$accent', stroke: { color: '$primary' } }, in: 'pop' }), T('{i1}', { slot: 3, off: 0.3, style: 'Podcast Box', size: 0.055, y: 0.3, in: 'slideup' })] },

  { id: 'event-recap', name: 'Event Recap', cat: 'Social', ratio: '9:16', blurb: 'Highlights from a party, trip or meetup, with confetti.',
    pal: PAL('#A393FF', '#120F24', '#FFD24A'), music: 'pop', musicVol: 0.55, look: 'vivid', sync: true, gen: 'confettipop', trans: { type: 'zoomin', dur: 0.25 },
    fxLayers: [{ type: 'confetti', t: 0, dur: 2.6, amt: 0.8 }], sfx: { id: 'pop', vol: 0.5 }, cover: { gen: 'confettipop', title: 'EVENT\nRECAP' },
    slots: [S('Opening', 'Where it all began', 1.6), S('Moment 2', 'The crowd or the group', 1.6), S('Moment 3', 'A fun moment', 1.6), S('Moment 4', 'A candid shot', 1.6), S('Moment 5', 'The big moment', 1.6), S('Closing', 'How it ended', 2)],
    inputs: [{ id: 'title', label: 'Title', value: 'WHAT A NIGHT', max: 22 }, { id: 'when', label: 'Date and place', value: 'Saturday · Downtown', max: 30 }, { id: 'cta', label: 'End line', value: 'See you next time', max: 30 }],
    layers: [T('{title}', { slot: 0, off: 0.1, style: 'Comic', size: 0.095, y: -0.1, o: { color: '$accent', maxW: 0.85 }, in: 'pop' }), T('{when}', { slot: 0, off: 0.3, style: 'Tag', size: 0.042, y: 0.1, o: { bg: { color: '$primary' }, color: '#fff' }, in: 'slideup' }),
      T('{cta}', { slot: 5, off: 0.2, style: 'Handwritten', size: 0.1, y: 0.18, in: 'pop' })] },

  { id: 'before-after', name: 'Before & After', cat: 'Social', ratio: '9:16', blurb: 'A clean reveal from the old to the new.',
    pal: PAL('#6FF2C6', '#0B1210', '#FFD24A'), music: 'pop', musicVol: 0.5, look: 'clean', gen: 'gradmesh', trans: { type: 'wipeleft', dur: 0.6 }, sfx: { id: 'whoosh', vol: 0.7 }, fxLayers: [{ type: 'flash', at: 'cuts', dur: 0.2, amt: 0.6 }],
    cover: { gen: 'holofloor', title: 'BEFORE\n& AFTER' },
    slots: [S('Before', 'How it started', 3.2), S('After', 'The result', 3.6)],
    inputs: [{ id: 'title', label: 'Title', value: 'THE GLOW UP', max: 24 }, { id: 'a', label: 'First label', value: 'BEFORE', max: 14 }, { id: 'b', label: 'Second label', value: 'AFTER', max: 14 }],
    layers: [T('{title}', { slot: 0, span: 1, off: 0.2, style: 'Bold Impact', size: 0.1, y: -0.34, o: { stroke: { color: '$primary' } }, in: 'slidedown' }),
      T('{a}', { slot: 0, off: 0.3, style: 'Warning', size: 0.06, y: 0.3, in: 'pop' }), T('{b}', { slot: 1, off: 0.3, style: 'Tag', size: 0.06, y: 0.3, o: { bg: { color: '$primary' }, color: '#0b0f14' }, in: 'pop' })] },

  { id: 'quote-card', name: 'Quote Card', cat: 'Social', ratio: '4:5', blurb: 'A beautiful quote over your photo or an animated scene.',
    pal: PAL('#F5C451', '#14110A', '#FFFFFF', '#FFF8E6'), music: 'ambient', musicVol: 0.4, look: 'soft', gen: 'marble', cover: { gen: 'marble', title: '“Quote”' },
    slots: [S('Background', 'A photo or a calm video (optional)', 8, { kb: true, dim: 0.35 })],
    inputs: [{ id: 'quote', label: 'Quote', value: 'Make it simple, but significant.', max: 90 }, { id: 'author', label: 'Author', value: '— Your name', max: 30 }],
    layers: [T('{quote}', { slot: 0, off: 0.5, dur: 7, style: 'Elegant', size: 0.062, y: -0.04, o: { color: '$text', maxW: 0.8 }, in: 'fade', inDur: 1 }), T('{author}', { slot: 0, off: 1.6, dur: 6, style: 'Tag', size: 0.032, y: 0.24, o: { bg: { color: '$primary' }, color: '#111' }, in: 'slideup' })] },

  /* ================================================================= BUSINESS */
  { id: 'product-showcase', name: 'Product Showcase', cat: 'Business', ratio: '9:16', blurb: 'Show off a product with three feature callouts and a call to action.', badge: 'New',
    pal: PAL('#4D9BFF', '#0B1624', '#22D3EE'), music: 'corporate', musicVol: 0.35, look: 'clean', gen: 'corpwaves', trans: { type: 'pushleft', dur: 0.4 }, cover: { gen: 'corpwaves', title: 'PRODUCT\nSHOWCASE' },
    slots: [S('Hero shot', 'Your product, looking its best', 2.6, { kb: true }), S('Feature 1', 'A close-up detail', 2.4, { kb: true }), S('Feature 2', 'The product in use', 2.4, { kb: true }), S('Feature 3', 'Another benefit', 2.4, { kb: true }), S('Call to action', 'A final, clean shot', 3, { kb: true })],
    inputs: [{ id: 'title', label: 'Headline', value: 'Meet your new favorite', max: 36 }, { id: 'f1', label: 'Feature 1', value: 'Built to last', max: 28 }, { id: 'f2', label: 'Feature 2', value: 'Ready in seconds', max: 28 }, { id: 'f3', label: 'Feature 3', value: 'Loved by thousands', max: 28 }, { id: 'cta', label: 'Call to action', value: 'Shop now · Link in bio', max: 34 }],
    layers: [T('{title}', { slot: 0, off: 0.3, style: 'Clean Pro', size: 0.07, y: -0.2, brandFont: true, o: { weight: 800, maxW: 0.8 }, in: 'slideup' }),
      T('{f1}', { slot: 1, off: 0.3, style: 'Tag', size: 0.048, y: 0.28, o: { bg: { color: '$primary' }, color: '#fff' }, in: 'slideup' }), T('{f2}', { slot: 2, off: 0.3, style: 'Tag', size: 0.048, y: 0.28, o: { bg: { color: '$primary' }, color: '#fff' }, in: 'slideup' }),
      T('{f3}', { slot: 3, off: 0.3, style: 'Tag', size: 0.048, y: 0.28, o: { bg: { color: '$primary' }, color: '#fff' }, in: 'slideup' }),
      T('{cta}', { slot: 4, off: 0.3, style: 'Podcast Box', size: 0.052, y: 0.2, o: { bg: { color: '$secondary', a: 0.9 } }, in: 'pop' })] },

  { id: 'talking-head', name: 'Talking Head Pro', cat: 'Business', ratio: '9:16', blurb: 'A polished lower third and sign-off over your recording.',
    pal: PAL('#6FF2C6', '#101418', '#FFD24A'), music: 'ambient', musicVol: 0.1, keepAudio: true, duck: true, look: 'clean', gen: 'gradmesh', cover: { gen: 'gradmesh', title: 'TALKING\nHEAD' },
    slots: [S('Your video', 'The full recording. Use Edit for me for captions.', 20, { full: true })],
    inputs: [{ id: 'name', label: 'Your name', value: 'Alex Morgan', max: 28 }, { id: 'role', label: 'Role or topic', value: 'Founder · Growth', max: 34 }, { id: 'cta', label: 'Sign-off', value: 'Follow for more', max: 30 }],
    layers: [T('{name}', { slot: 0, off: 1, dur: 4, style: 'Podcast Box', size: 0.052, y: 0.2, brandFont: true, o: { bg: { color: '$secondary', a: 0.9 }, align: 'left' }, in: 'slideright' }),
      T('{role}', { slot: 0, off: 1.3, dur: 3.7, style: 'Tag', size: 0.034, y: 0.26, o: { bg: { color: '$primary' }, color: '#0b0f14' }, in: 'slideright' }),
      T('{cta}', { slot: 0, from: 'end', off: -4, dur: 3.6, style: 'Tag', size: 0.048, y: 0.22, o: { bg: { color: '$primary' }, color: '#0b0f14' }, in: 'pop' })] },

  { id: 'announcement', name: 'Big Announcement', cat: 'Business', ratio: '9:16', blurb: 'Launch news with three bold points and a clear next step.',
    pal: PAL('#FF5C8A', '#150A12', '#FFD24A'), music: 'techhouse', musicVol: 0.45, look: 'vivid', gen: 'gradmesh', trans: { type: 'slideleft', dur: 0.3 }, sfx: { id: 'impact', vol: 0.55 }, cover: { gen: 'lasers', title: 'BIG\nNEWS' },
    slots: [CARD('Headline', 2.4, 'gradmesh'), S('Point 1', 'A clip that shows it', 2.6), S('Point 2', 'Another proof point', 2.6), S('Point 3', 'The best part', 2.6), CARD('Call to action', 2.4, 'lasers')],
    inputs: [{ id: 'tag', label: 'Badge', value: 'BIG NEWS', max: 16 }, { id: 'title', label: 'Headline', value: 'We just launched', max: 30 }, { id: 'p1', label: 'Point 1', value: 'Twice as fast', max: 28 }, { id: 'p2', label: 'Point 2', value: 'Half the price', max: 28 }, { id: 'p3', label: 'Point 3', value: 'Available today', max: 28 }, { id: 'cta', label: 'Call to action', value: 'Link in bio', max: 26 }],
    layers: [T('{tag}', { slot: 0, off: 0.2, style: 'Warning', size: 0.05, y: -0.22, in: 'pop' }), T('{title}', { slot: 0, off: 0.5, style: 'Bold Impact', size: 0.09, y: 0.03, o: { stroke: { color: '$primary' }, maxW: 0.8 }, in: 'pop' }),
      T('{p1}', { slot: 1, off: 0.3, style: 'Podcast Box', size: 0.056, y: 0.28, in: 'slideup' }), T('{p2}', { slot: 2, off: 0.3, style: 'Podcast Box', size: 0.056, y: 0.28, in: 'slideup' }), T('{p3}', { slot: 3, off: 0.3, style: 'Podcast Box', size: 0.056, y: 0.28, in: 'slideup' }),
      T('{cta}', { slot: 4, off: 0.3, style: 'Tag', size: 0.08, y: 0.02, o: { bg: { color: '$accent' }, color: '#111' }, in: 'pop' })] },

  { id: 'channel-intro', name: 'Channel Intro', cat: 'Business', ratio: '16:9', blurb: 'A snappy 6-second intro with your channel name.',
    pal: PAL('#22F0C8', '#06101A', '#A393FF'), music: 'synthwave', musicVol: 0.55, look: 'cyber', gen: 'warptunnel', sfx: { id: 'riseup', vol: 0.6, at: 'start' }, cover: { gen: 'warptunnel', title: 'CHANNEL\nINTRO' },
    slots: [S('Opening clip', 'Optional: a short clip behind the name', 6, { gen: 'warptunnel', dim: 0.4 })],
    inputs: [{ id: 'name', label: 'Channel name', value: 'YOUR CHANNEL', max: 24 }, { id: 'tag', label: 'Tagline', value: 'New videos every week', max: 34 }],
    layers: [T('{name}', { slot: 0, off: 1.2, dur: 4.6, style: 'Neon', size: 0.12, y: -0.04, brandFont: true, o: { glow: { color: '$primary' } }, in: 'zoom' }), T('{tag}', { slot: 0, off: 2.2, dur: 3.6, style: 'Minimal', size: 0.04, y: 0.12, in: 'slideup' })] },

  /* ================================================================= LIFESTYLE */
  { id: 'day-in-my-life', name: 'Day in My Life', cat: 'Lifestyle', ratio: '9:16', blurb: 'Warm, easy vlog moments with handwritten labels.',
    pal: PAL('#FFB020', '#1A120A', '#FFF3C4'), music: 'lofi', musicVol: 0.45, look: 'warm', gen: 'cafeglow', trans: { type: 'fade', dur: 0.5 }, cover: { gen: 'goldenclouds', title: 'A DAY IN\nMY LIFE' },
    slots: [S('Morning', 'Waking up, coffee, getting ready', 2.4, { kb: true }), S('Out and about', 'Commute or a walk', 2.4, { kb: true }), S('Work or study', 'What you spend the day on', 2.4, { kb: true }), S('Treat', 'Lunch, coffee or a snack', 2.4, { kb: true }), S('Evening', 'Winding down', 2.8, { kb: true })],
    inputs: [{ id: 'title', label: 'Title', value: 'a day in my life', max: 26 }, { id: 'l1', label: 'Label 1', value: 'morning', max: 18 }, { id: 'l2', label: 'Label 2', value: 'out & about', max: 18 }, { id: 'l3', label: 'Label 3', value: 'work', max: 18 }, { id: 'l4', label: 'Label 4', value: 'treat time', max: 18 }, { id: 'l5', label: 'Label 5', value: 'unwind', max: 18 }],
    layers: [T('{title}', { slot: 0, off: 0.2, dur: 2, style: 'Handwritten', size: 0.11, y: -0.22, in: 'fade', inDur: 0.6 }), ...[1, 2, 3, 4, 5].map((n) => T(`{l${n}}`, { slot: n - 1, off: n === 1 ? 1.2 : 0.3, style: 'Handwritten', size: 0.085, y: 0.28, x: 0, in: 'slideup' }))] },

  { id: 'recipe-steps', name: 'Recipe Steps', cat: 'Lifestyle', ratio: '9:16', blurb: 'A cozy cooking video with numbered steps.',
    pal: PAL('#FF7A2F', '#1A0F08', '#FFE3A8'), music: 'ukulele', musicVol: 0.4, look: 'warm', gen: 'cafeglow', trans: { type: 'pushup', dur: 0.35 }, sfx: { id: 'pop', vol: 0.5 }, cover: { gen: 'steam', title: 'RECIPE\nSTEPS' },
    slots: [CARD('Title card', 2.2, 'cafeglow'), S('Step 1', 'Prep the ingredients', 3), S('Step 2', 'Cook or mix', 3), S('Step 3', 'Put it together', 3), S('The result', 'The finished dish', 3.2)],
    inputs: [{ id: 'title', label: 'Dish name', value: 'Creamy Garlic Pasta', max: 30 }, { id: 's1', label: 'Step 1', value: 'Chop the garlic', max: 30 }, { id: 's2', label: 'Step 2', value: 'Simmer the sauce', max: 30 }, { id: 's3', label: 'Step 3', value: 'Toss and serve', max: 30 }, { id: 'end', label: 'Last line', value: 'Enjoy!', max: 20 }],
    layers: [T('{title}', { slot: 0, off: 0.2, style: 'Elegant', size: 0.085, y: -0.02, o: { maxW: 0.8 }, in: 'pop' }),
      ...[1, 2, 3].map((n) => T(`{s${n}}`, { slot: n, off: 0.3, style: 'Podcast Box', size: 0.05, y: 0.28, in: 'slideup' })),
      ...[1, 2, 3].map((n) => T(`STEP ${n}`, { slot: n, off: 0.2, style: 'Tag', size: 0.038, y: -0.34, o: { bg: { color: '$primary' }, color: '#fff' }, in: 'pop' })),
      T('{end}', { slot: 4, off: 0.6, style: 'Handwritten', size: 0.12, y: 0.22, in: 'pop' })] },

  { id: 'love-story', name: 'Love Story', cat: 'Lifestyle', ratio: '9:16', blurb: 'Soft, dreamy memories set to piano.',
    pal: PAL('#FF8FB1', '#1F0E16', '#FFE3EC'), music: 'piano', musicVol: 0.55, look: 'pastel', gen: 'petals', trans: { type: 'fade', dur: 0.9 }, fxLayers: [{ type: 'sparkle', t: 0, dur: 'total', amt: 0.35 }], cover: { gen: 'hearts', title: 'LOVE\nSTORY' },
    slots: [S('Where it began', 'A photo or clip', 2.8, { kb: true, fx: [['dreamy', 0.4]] }), S('Together', 'A moment you love', 2.8, { kb: true, fx: [['dreamy', 0.4]] }), S('Laughing', 'A happy one', 2.8, { kb: true, fx: [['dreamy', 0.4]] }), S('Adventure', 'Somewhere you went', 2.8, { kb: true, fx: [['dreamy', 0.4]] }), S('Close-up', 'A quiet moment', 2.8, { kb: true, fx: [['dreamy', 0.4]] }), CARD('Closing card', 3, 'hearts')],
    inputs: [{ id: 'title', label: 'Title', value: 'Our Story', max: 24 }, { id: 'date', label: 'Date', value: 'since 2019', max: 24 }, { id: 'names', label: 'Closing line', value: 'Forever, starting today', max: 34 }],
    layers: [T('{title}', { slot: 0, off: 0.5, dur: 2.2, style: 'Elegant', size: 0.1, y: -0.2, in: 'fade', inDur: 0.9 }), T('{date}', { slot: 0, off: 1.0, dur: 1.7, style: 'Minimal', size: 0.04, y: -0.1, in: 'fade', inDur: 0.9 }),
      T('{names}', { slot: 5, off: 0.4, style: 'Elegant', size: 0.07, y: -0.02, o: { maxW: 0.8 }, in: 'fade', inDur: 1 })] },

  /* ================================================================= CINEMATIC */
  { id: 'travel-film', name: 'Travel Film', cat: 'Cinematic', ratio: '16:9', blurb: 'Widescreen, teal-and-orange, with an elegant title.', badge: 'New',
    pal: PAL('#F5C451', '#0A0F14', '#5FD0FF', '#F4EFE6'), music: 'cinematic', musicVol: 0.6, look: 'tealorange', gen: 'mountains', trans: { type: 'crosszoom', dur: 0.7 }, fxLayers: [{ type: 'letterbox', t: 0, dur: 'total', amt: 1 }], cover: { gen: 'mountains', title: 'TRAVEL\nFILM' },
    slots: [S('Opening', 'A wide establishing shot', 3, { kb: true }), S('Scene 2', 'Landscape or street', 2.6, { kb: true }), S('Scene 3', 'A detail', 2.6, { kb: true }), S('Scene 4', 'People or action', 2.6, { kb: true }), S('Scene 5', 'Golden hour', 2.6, { kb: true }), S('Closing', 'A last look', 3.4, { kb: true })],
    inputs: [{ id: 'title', label: 'Place', value: 'LISBON', max: 22 }, { id: 'sub', label: 'Subtitle', value: 'Summer 2026', max: 28 }],
    layers: [T('{title}', { slot: 0, off: 0.8, dur: 2.2, style: 'Cinematic', size: 0.1, y: 0, o: { spacing: 0.28 }, in: 'fade', inDur: 0.9, out: 'fade' }), T('{sub}', { slot: 0, off: 1.4, dur: 1.6, style: 'Minimal', size: 0.034, y: 0.09, o: { spacing: 0.2 }, in: 'fade', inDur: 0.8 })] },

  { id: 'movie-trailer', name: 'Movie Trailer', cat: 'Cinematic', ratio: '16:9', blurb: 'Dark, dramatic, with title cards and a big finish.',
    pal: PAL('#E5484D', '#08080A', '#F4EFE6', '#F4EFE6'), music: 'trailer', musicVol: 0.65, look: 'drama', gen: 'filmgate', trans: { type: 'fadeblack', dur: 0.35 }, fxLayers: [{ type: 'letterbox', t: 0, dur: 'total', amt: 1 }], sfx: { id: 'impact', vol: 0.7 }, cover: { gen: 'lensflare', title: 'COMING\nSOON' },
    slots: [CARD('Opening card', 2.4, 'filmgate'), S('Scene 1', 'Set the scene', 1.9), S('Scene 2', 'Raise the stakes', 1.6), S('Scene 3', 'The turn', 1.5), S('Scene 4', 'The action', 1.3), S('Scene 5', 'The cliffhanger', 1.3), CARD('Title card', 3.2, 'lensflare')],
    inputs: [{ id: 'tag', label: 'Opening line', value: 'THIS SUMMER', max: 26 }, { id: 't1', label: 'Line 1', value: 'ONE STORY', max: 22 }, { id: 't2', label: 'Line 2', value: 'ONE CHANCE', max: 22 }, { id: 't3', label: 'Line 3', value: 'NO TURNING BACK', max: 22 }, { id: 'title', label: 'Title', value: 'YOUR TITLE', max: 24 }],
    layers: [T('{tag}', { slot: 0, off: 0.4, style: 'Cinematic', size: 0.06, y: 0, o: { spacing: 0.3 }, in: 'fade', inDur: 0.9 }), T('{t1}', { slot: 2, off: 0.2, style: 'Cinematic', size: 0.07, y: 0.18, o: { spacing: 0.25 }, in: 'fade' }), T('{t2}', { slot: 3, off: 0.2, style: 'Cinematic', size: 0.07, y: 0.18, o: { spacing: 0.25 }, in: 'fade' }), T('{t3}', { slot: 4, off: 0.1, style: 'Cinematic', size: 0.07, y: 0.18, o: { spacing: 0.25, color: '$primary' }, in: 'fade' }),
      T('{title}', { slot: 6, off: 0.4, style: 'Cinematic', size: 0.13, y: 0, o: { spacing: 0.3, color: '$text' }, brandFont: false, in: 'zoom', inDur: 0.9 })] },

  /* ================================================================= ENERGY */
  { id: 'fitness-pump', name: 'Fitness Pump', cat: 'Energy', ratio: '9:16', blurb: 'High-energy training cuts with heavy hits.',
    pal: PAL('#FF3B30', '#0B0B0B', '#FFD400'), music: 'trap', musicVol: 0.65, look: 'drama', sync: true, gen: 'fire', trans: { type: 'glitch', dur: 0.18 }, sfx: { id: 'impact', vol: 0.55 }, fxLayers: [{ type: 'flash', at: 'cuts', dur: 0.14, amt: 0.6 }], cover: { gen: 'fire', title: 'NO\nEXCUSES' },
    slots: [S('Warm-up', 'Getting started', 1.2, { fx: [['shake', 0.3]] }), S('Rep 1', 'The work', 1.2, { fx: [['shake', 0.3]] }), S('Rep 2', 'More work', 1.2, { fx: [['shake', 0.3]] }), S('Push', 'The hard part', 1.2, { fx: [['shake', 0.3]] }), S('Finish', 'Done', 1.2, { fx: [['shake', 0.3]] }), CARD('Final card', 2, 'fire')],
    inputs: [{ id: 'w1', label: 'Word 1', value: 'NO', max: 12 }, { id: 'w2', label: 'Word 2', value: 'EXCUSES', max: 14 }, { id: 'end', label: 'Final line', value: 'STAY HARD', max: 16 }],
    layers: [T('{w1}', { slot: 1, off: 0.1, style: 'Bold Impact', size: 0.22, y: -0.05, o: { color: '$accent', stroke: { color: '#000000' } }, in: 'pop' }), T('{w2}', { slot: 2, off: 0.1, style: 'Bold Impact', size: 0.17, y: -0.05, o: { color: '$text', stroke: { color: '$primary' } }, in: 'pop' }),
      T('{end}', { slot: 5, off: 0.2, style: 'Bold Impact', size: 0.16, y: 0, o: { color: '$accent', stroke: { color: '$primary' } }, in: 'zoom' })] },

  { id: 'gaming-highlight', name: 'Gaming Highlight', cat: 'Energy', ratio: '16:9', blurb: 'Glitchy neon cuts for your best plays.',
    pal: PAL('#22F0C8', '#07060F', '#FF3D71'), music: 'synthwave', musicVol: 0.55, look: 'cyber', gen: 'synthwave', trans: { type: 'glitch', dur: 0.3 }, sfx: { id: 'glitch', vol: 0.5 }, cover: { gen: 'synthwave', title: 'CLUTCH' },
    slots: [S('Setup', 'Before the play', 2.2, { fx: [['rgbsplit', 0.4]] }), S('The play', 'The moment', 2.4, { fx: [['rgbsplit', 0.35]] }), S('Reaction', 'Replay or reaction', 2.2, { fx: [['crt', 0.4]] }), S('Finish', 'The result screen', 2.8, { fx: [['crt', 0.4]] })],
    inputs: [{ id: 'title', label: 'Big word', value: 'CLUTCH', max: 14 }, { id: 'game', label: 'Game and rank', value: 'Ranked · Diamond', max: 30 }],
    layers: [T('{title}', { slot: 1, off: 0.2, dur: 1.8, style: 'Neon', size: 0.18, y: -0.05, o: { glow: { color: '$primary' } }, in: 'zoom' }), T('{game}', { slot: 0, off: 0.4, style: 'Tag', size: 0.04, y: -0.34, o: { bg: { color: '$accent' }, color: '#fff' }, in: 'slideright' })] },
  ...MORE_TEMPLATES,
];

/* ================================================================= helpers */
export const templateById = (id) => TEMPLATES.find((t) => t.id === id);
/** Stock-footage searches that suit this template (used by "Fill with stock"), or null. */
export const templateStockQueries = (tpl) => tpl.stockQ || TEMPLATE_STOCK[tpl.id] || null;
const beat = (tpl) => { const m = MUSIC.find((x) => x.id === tpl.music); return m ? 60 / m.bpm : 0.5; };
const slotDur = (tpl, sl) => (tpl.sync ? Math.max(beat(tpl), Math.round(sl.dur / beat(tpl)) * beat(tpl)) : sl.dur);
/** Planned length in seconds, as shown on the card (a clip shorter than its slot shortens the video). */
export const templateDuration = (tpl) => tpl.slots.reduce((a, sl) => a + slotDur(tpl, sl), 0);
export const templateClipSlots = (tpl) => tpl.slots.filter((s) => !s.card).length;

export const brandPalette = (b) => PAL(b.primary, b.secondary, b.accent || b.primary, b.text);

const fontW = (id) => FONTS.find((f) => f.id === id)?.w || 800;
const fillText = (s, vals) => String(s).replace(/\{(\w+)\}/g, (_, k) => (vals[k] ?? '')).trim();
/** Resolve '$primary'-style color tokens anywhere inside a style patch. */
function tint(obj, pal) {
  if (typeof obj === 'string') return obj[0] === '$' ? (pal[obj.slice(1)] || '#ffffff') : obj;
  if (Array.isArray(obj)) return obj.map((x) => tint(x, pal));
  if (obj && typeof obj === 'object') { const o = {}; for (const [k, v] of Object.entries(obj)) o[k] = tint(v, pal); return o; }
  return obj;
}
const sizeK = (aspect) => Math.sqrt(aspect / 0.5625);       // text sizes are relative to height; keep them the same share of the width on wide canvases

/** Pick the most active stretch of a clip when it is longer than its slot (loudest part when there is sound). */
function pickWindow(bank, m, dur) {
  const avail = m.duration;
  if (avail <= dur + 0.6) return 0;
  const r = bank.has(m.id) ? bank.rmsDb(m.id, 0.1) : null;
  if (!r || !r.db?.length) return Math.min(avail - dur, avail * 0.08);
  const n = Math.max(1, Math.round(dur / r.win));
  let sum = 0, best = -Infinity, at = 0;
  for (let i = 0; i < r.db.length; i++) {
    sum += r.db[i]; if (i >= n) sum -= r.db[i - n];
    if (i >= n - 1 && sum > best) { best = sum; at = i - n + 1; }
  }
  return Math.max(0, Math.min(avail - dur, at * r.win - 0.15));
}

/**
 * Pure layout step: turns a template (plus optional media per slot) into clips, with no store or app involved.
 * Used by buildTemplate for the real edit and by the preview renderer for the live cards.
 * @returns {{main:object[], texts:object[], fxs:object[], cutTimes:number[], starts:number[], durs:number[], total:number}}
 */
export function layoutTemplate(tpl, { R, pal, vals, brand = null, useBrand = false, media = [], pick = () => 0, genFor = null }) {
  const aspect = R.w / R.h, K = sizeK(aspect);
  const starts = [], durs = [], cutTimes = [], main = [], texts = [], fxs = [];
  const fxOf = (sl) => (sl.fx || []).map(([id, amt]) => ({ ...effectDefaults(id), amt }));
  let t = 0;
  tpl.slots.forEach((sl, i) => {
    const m = media[i];
    let dur = slotDur(tpl, sl), c;
    if (m && m.kind === 'video') {
      if (sl.full) dur = Math.min(m.duration, 120);
      else dur = Math.max(0.6, Math.min(dur, m.duration));
      c = videoClip(m, t); c.dur = dur; c.in = sl.full ? 0 : pick(m, dur);
      if (tpl.keepAudio) { c.mute = false; c.vol = 1; } else { c.mute = true; c.vol = 0; }
    } else if (m) {
      c = videoClip(m, t); c.dur = dur; c.in = 0;
    } else {
      const g = GENERATORS.find((x) => x.id === (genFor ? genFor(sl, i) : (sl.gen || tpl.gen))) || GENERATORS[0];
      c = genClip(g, t, dur); c.bgblur = false;
      if (sl.genAt) c.in = sl.genAt;
    }
    c.start = t; c.name = sl.label;
    if (c.kind !== 'gen' && sl.tilt) c.tf.r = sl.tilt;
    if (tpl.look && tpl.look !== 'none' && c.kind !== 'gen') c.look = { id: sl.look || tpl.look, amt: 0.9 };
    c.fxs = c.kind === 'gen' ? [] : fxOf(sl);
    if (sl.dim && c.kind !== 'gen') c.adj = { ...c.adj, exp: -sl.dim };
    // a slow push-in keeps photos and calm shots alive
    if (c.kind === 'image' || sl.kb) {
      c.kf = { s: [{ t: 0, v: 1, e: 'inout' }, { t: +dur.toFixed(3), v: 1.1, e: 'inout' }], x: [{ t: 0, v: i % 2 ? 0.012 : -0.012, e: 'inout' }, { t: +dur.toFixed(3), v: i % 2 ? -0.012 : 0.012, e: 'inout' }] };
    }
    const tr = sl.trans === undefined ? tpl.trans : sl.trans;
    if (i > 0 && tr) { c.transIn = { type: tr.type, dur: Math.min(tr.dur, dur * 0.8, (durs[i - 1] || dur) * 0.8) }; cutTimes.push(t); }
    starts.push(t); durs.push(dur); main.push(c);
    t += dur;
  });
  const total = durs.reduce((a, b) => a + b, 0);

  for (const L of tpl.layers || []) {
    const content = fillText(L.text, vals); if (!content) continue;
    const i = Math.min(L.slot ?? 0, tpl.slots.length - 1);
    const base = TEXT_PRESETS.find((x) => x.name === L.style)?.text || {};
    let patch = mergeText(mergeText(TEXT_DEFAULT(), base), tint(L.o || {}, pal));
    patch = { ...patch, content, size: (L.size ?? patch.size) * K };
    if (L.brandFont && useBrand && brand?.font) { patch.font = brand.font; patch.weight = fontW(brand.font); }
    let t0 = L.from === 'end' ? total + (L.off ?? 0) : starts[i] + (L.off ?? 0.2);
    t0 = Math.max(0, t0);
    const span = L.span != null ? starts[Math.min(L.span, starts.length - 1)] + durs[Math.min(L.span, durs.length - 1)] : starts[i] + durs[i];
    const dur = Math.max(0.45, Math.min(L.dur ?? (span - t0 - 0.05), total - t0));
    const c = textClip(t0, dur, patch);
    c.name = content.slice(0, 24);
    c.tf.y = L.y ?? 0.18; c.tf.x = L.x ?? 0;
    c.animIn = { id: L.in || 'pop', dur: L.inDur || 0.35 };
    c.animOut = { id: L.out || 'fade', dur: 0.25 };
    if (L.scroll) c.kf = { y: [{ t: 0, v: L.scroll[0], e: 'linear' }, { t: +dur.toFixed(3), v: L.scroll[1], e: 'linear' }] };
    if (L.loop) c.animLoop = { id: L.loop, amt: 1 };
    texts.push(c);
  }
  for (const F of tpl.fxLayers || []) {
    const mk = (s, d) => fxs.push(fxClip(F.type, s, d, { ...effectDefaults(F.type), amt: F.amt ?? 0.7 }));
    if (F.at === 'cuts') cutTimes.forEach((ct) => mk(Math.max(0, ct - F.dur / 2), F.dur));
    else { const s = F.t ?? 0; mk(s, F.dur === 'total' ? total - s : Math.min(F.dur, total - s)); }
  }
  return { main, texts, fxs, cutTimes, starts, durs, total };
}

export const templateValues = (tpl, values = {}) => { const v = {}; for (const f of tpl.inputs || []) v[f.id] = (values[f.id] ?? f.value); return v; };

/**
 * Build the template into a new project and open it in the editor.
 * @param app   the running App (uses createProject, lib, bank, store)
 * @param opts  { files: (File|null)[] per slot, values: {id:text}, brand, useBrand, ratio, onStep(label) }
 * @returns {Promise<{missing:number, warnings:string[]}>}
 */
export async function buildTemplate(app, tpl, { files = [], values = {}, brand, useBrand = false, ratio = null, logoMedia = null, onStep = () => {} } = {}) {
  const R = RATIOS.find((r) => r.id === (ratio || tpl.ratio)) || RATIOS[0];
  const pal = useBrand && brand ? brandPalette(brand) : tpl.pal;
  const st = app.store;
  const warnings = [];
  const vals = templateValues(tpl, values);

  onStep('Setting up');
  await app.createProject(R.id, tpl.name);

  /* ---- bring the clips in ---- */
  onStep('Reading your clips');
  const media = [];
  for (let i = 0; i < tpl.slots.length; i++) {
    const f = tpl.slots[i].card ? null : files[i];
    if (!f) { media.push(null); continue; }
    try { media.push(await app.lib.importFile(f)); } catch (e) { warnings.push(`${f.name}: ${e.message}`); media.push(null); }
  }
  const missing = tpl.slots.filter((s, i) => !s.card && !media[i]).length;

  /* ---- timeline, text and effects ---- */
  onStep('Building the timeline');
  const lay = layoutTemplate(tpl, { R, pal, vals, brand, useBrand, media, pick: (m, dur) => pickWindow(app.bank, m, dur) });
  const { total } = lay;
  st.commit((p) => {
    for (const m of media) if (m) p.media[m.id] = m;
    const main = st.mainTrack;
    for (const c of lay.main) main.clips.push(c);
    st.sel.clear();
  });
  onStep('Adding text and effects');
  st.commit(() => {
    for (const c of lay.texts) st.trackFor('text', c.start, c.dur).clips.push(c);
    for (const c of lay.fxs) st.trackFor('fx', c.start, c.dur).clips.push(c);
  });
  const cutTimes = lay.cutTimes;

  /* ---- sound ---- */
  if (tpl.music) {
    onStep('Mixing the music');
    const def = MUSIC.find((x) => x.id === tpl.music);
    if (def) {
      const m = builtinMedia.music(def.id);
      await app.bank.ensureBuiltin(m.id).catch(() => {});
      st.commit((p) => {
        p.media[m.id] = m;
        const c = audioClip(m, 0, { loop: true, duck: !!tpl.duck, vol: tpl.musicVol ?? 0.5, fadeIn: 0.05, fadeOut: 1.4 });
        c.dur = Math.max(1, total);
        st.trackFor('audio', 0, c.dur).clips.push(c);
      });
    }
  }
  if (tpl.sfx) {
    const sf = tpl.sfx; const m = builtinMedia.sfx(sf.id);
    await app.bank.ensureBuiltin(m.id).catch(() => {});
    st.commit((p) => {
      p.media[m.id] = m;
      const at = sf.at === 'start' ? [0.2] : cutTimes;
      for (const ct of at) { const c = audioClip(m, Math.max(0, ct - 0.05), { vol: sf.vol ?? 0.5, fadeOut: 0.12 }); c.dur = Math.min(c.dur, sf.at === 'start' ? 2.2 : 0.6); st.trackFor('audio', c.start, c.dur).clips.push(c); }
    });
  }

  /* ---- brand ---- */
  if (useBrand && brand) {
    onStep('Applying your brand');
    if (brand.outro && (brand.name || brand.handle)) addEndCard(st, brand);
    addBrandOverlays({ store: st, logoMedia }, brand);
  }

  st.flush(); app.timeline.fit(); app.engine.seek(0);
  return { missing, warnings, total };
}

void uid; void end; void projectDuration;
