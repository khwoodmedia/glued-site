/* ---------- 1. DATA from CSV + full story files ---------- */
const CSV_URL = encodeURI(
  'archives page/magazine_artist_archive_enhanced.csv'
);
const STORIES_URL = encodeURI('archives page/stories.json');

let ARTISTS = [];
let STORY_LIBRARY = [];

/** Proper CSV parse so quoted fields with commas stay intact. */
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (next === '\n') i++;
    } else {
      field += c;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** Title/role values in the CSV are comma-separated. */
function parseRoles(raw) {
  if (!raw || !String(raw).trim()) return [];
  return String(raw)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Roles that should not become filter chips. */
const DROPPED_ROLES = [
  'community advocate',
  'community organizer',
  'content creator',
  'creative',
  'creative director',
  'designer',
  'educator',
  'entrepreneur',
  'interviewer',
  'stylist'
];

/** Force these names into categories even if CSV roles don't map cleanly. */
const NAME_CATEGORY_OVERRIDES = {
  'Ariel Mei': ['Fashion'],
  Falilou: ['Fashion'],
  'Avery Rose Haro': ['Fashion'],
  Major: ['Fashion'],
  'Rich Paul': ['Sports']
};

/** Extra story links for names missing them in the CSV. */
const NAME_STORY_OVERRIDES = {
  'Rich Paul': [
    {
      issue: 4,
      title: 'All Star Weekend 2025: Splitting the Pie, a Recipe That Never Fails'
    }
  ]
};

/**
 * Map raw CSV roles into filter categories.
 * Singers/rappers/etc. → Musician. Producer stays its own category.
 * Fashion designer → Fashion. Football/basketball player → Sports.
 */
function categorizeRole(raw) {
  const t = raw.trim().toLowerCase();
  if (!t) return null;

  if (DROPPED_ROLES.indexOf(t) !== -1) return null;

  // Producer first so "music producer" / "record producer" are not Musician
  if (
    t === 'producer' ||
    t === 'music producer' ||
    t === 'record producer' ||
    /\bproducer\b/.test(t)
  ) {
    return 'Producer';
  }

  if (t === 'fashion designer' || t === 'fashion') {
    return 'Fashion';
  }

  if (t === 'football player' || t === 'basketball player') {
    return 'Sports';
  }

  const musicianTerms = [
    'singer',
    'rapper',
    'songwriter',
    'musician',
    'dj',
    'flutist',
    'harpist',
    'violinist',
    'keyboardist',
    'pianist',
    'turntablist',
    'multi-instrumentalist',
    'choir',
    'vocal ensemble',
    'music duo',
    'musical collective',
    'live band',
    'performer',
    'performers',
    'young performer',
    'hip-hop ambassador',
    'musical director'
  ];
  if (musicianTerms.some((term) => t === term || t.includes(term))) {
    return 'Musician';
  }

  // Unmapped leftover roles are omitted from chips
  return null;
}

function categoriesFromRoles(roles) {
  const cats = [];
  roles.forEach((role) => {
    const cat = categorizeRole(role);
    if (cat && cats.indexOf(cat) === -1) cats.push(cat);
  });
  return cats;
}

function mergeStoryOverrides(artist, name) {
  const extras = NAME_STORY_OVERRIDES[name];
  if (!extras) return;

  extras.forEach((story) => {
    const exists = artist.stories.some(
      (s) =>
        s.title === story.title ||
        (s.issue === story.issue &&
          normKey(s.title).indexOf(normKey(story.title).slice(0, 12)) !== -1)
    );
    if (!exists) {
      artist.stories.push({ issue: story.issue, title: story.title });
    }
    if (story.issue != null && artist.issues.indexOf(story.issue) === -1) {
      artist.issues.push(story.issue);
      artist.issues.sort((a, b) => a - b);
    }
  });

  if (artist.stories.length && artist.headline === '[Story headline goes here]') {
    artist.headline = artist.stories[0].title;
  }
}

function applyNameOverrides(artists) {
  const names = new Set([
    ...Object.keys(NAME_CATEGORY_OVERRIDES),
    ...Object.keys(NAME_STORY_OVERRIDES)
  ]);

  names.forEach((name) => {
    const extras = NAME_CATEGORY_OVERRIDES[name] || [];
    let artist = artists.find((a) => a.name.toLowerCase() === name.toLowerCase());

    if (!artist) {
      artist = {
        id: artists.length + 1,
        name,
        instagram: '',
        roles: [],
        categories: extras.slice(),
        stories: [],
        issues: [],
        kind: 'FEATURE',
        issue: '[00]',
        date: '[Month YYYY]',
        headline: '[Story headline goes here]',
        byline: '[ Role ]',
        quote: '',
        paragraphs: [],
        photo: '',
        url: '#'
      };
      artists.push(artist);
    } else {
      extras.forEach((cat) => {
        if (artist.categories.indexOf(cat) === -1) artist.categories.push(cat);
      });
    }

    mergeStoryOverrides(artist, name);
  });
}

/** Stories in the CSV are separated by " | ". Issue is the leading "N:" when present. */
function parseStories(raw) {
  if (!raw || !String(raw).trim()) return [];

  return String(raw)
    .split(' | ')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(\d+):\s*(.*)$/);
      if (match) {
        return { issue: Number(match[1]), title: match[2] };
      }
      return { issue: null, title: part };
    });
}

function normKey(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\$/g, 's')
    .replace(/[^a-z0-9]+/g, '');
}

/** Match a CSV story title to a full story from ArchivesStories. */
function matchFullStory(csvStory) {
  const key = normKey(csvStory.title);
  if (!key || !STORY_LIBRARY.length) return null;

  let hit = STORY_LIBRARY.find((s) => s.key === key);
  if (hit) return hit;

  hit = STORY_LIBRARY.find((s) => key.indexOf(s.key) !== -1 || s.key.indexOf(key) !== -1);
  if (hit) return hit;

  if (csvStory.issue != null) {
    hit = STORY_LIBRARY.find(
      (s) =>
        s.issue === csvStory.issue &&
        (key.indexOf(s.stubKey) !== -1 ||
          s.stubKey.indexOf(key.slice(0, 6)) !== -1 ||
          key.indexOf(s.stubKey.slice(0, 6)) !== -1)
    );
    if (hit) return hit;
  }

  return null;
}

function attachFullStories(artists) {
  artists.forEach((artist) => {
    artist.fullStories = [];
    artist.stories.forEach((csvStory) => {
      const full = matchFullStory(csvStory);
      if (full) {
        artist.fullStories.push({
          issue: csvStory.issue != null ? csvStory.issue : full.issue,
          title: full.title || csvStory.title,
          paragraphs: full.paragraphs.slice()
        });
      } else {
        artist.fullStories.push({
          issue: csvStory.issue,
          title: csvStory.title,
          paragraphs: []
        });
      }
    });

    if (artist.fullStories.length) {
      artist.headline = artist.fullStories[0].title;
      const blocks = [];
      artist.fullStories.forEach((story, idx) => {
        if (artist.fullStories.length > 1 || idx === 0) {
          blocks.push({
            type: 'section',
            text:
              (story.issue != null ? 'Issue ' + story.issue + ' · ' : '') +
              story.title
          });
        }
        if (story.paragraphs.length) {
          story.paragraphs.forEach((p) => blocks.push({ type: 'p', text: p }));
        } else {
          blocks.push({ type: 'p', text: '[Full story coming soon.]' });
        }
      });
      artist.storyBlocks = blocks;
      artist.paragraphs = blocks
        .filter((b) => b.type === 'p')
        .map((b) => b.text);
    }
  });
}

function instagramUrl(handle) {
  if (!handle) return '#';
  if (/^https?:\/\//i.test(handle)) return handle;
  return 'https://www.instagram.com/' + handle.replace(/^@/, '') + '/';
}

const EXCLUDED_NAMES = ['J Dilla'];

function artistsFromCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) return [];

  const artists = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i];
    let name = (cells[0] || '').trim();
    if (!name) continue;
    if (name === 'SplashTheKids') name = 'SplashTheKid';
    if (
      EXCLUDED_NAMES.some((n) => n.toLowerCase() === name.toLowerCase())
    ) {
      continue;
    }

    const instagram = (cells[1] || '').trim();
    const roles = parseRoles(cells[2] || '');
    const categories = categoriesFromRoles(roles);
    const stories = parseStories(cells[3] || '');
    const issues = [];
    stories.forEach((s) => {
      if (s.issue != null && issues.indexOf(s.issue) === -1) issues.push(s.issue);
    });
    issues.sort((a, b) => a - b);

    artists.push({
      id: artists.length + 1,
      name,
      instagram,
      roles,
      categories,
      stories,
      issues,
      kind: 'FEATURE',
      issue: issues.length ? String(issues[0]).padStart(2, '0') : '[00]',
      date: '[Month YYYY]',
      headline: stories[0] ? stories[0].title : '[Story headline goes here]',
      byline: roles.length ? roles.join(', ') : '[ Role ]',
      quote: '',
      paragraphs: stories.map((s) =>
        s.issue != null ? 'Issue ' + s.issue + ' · ' + s.title : s.title
      ),
      photo: '',
      url: instagramUrl(instagram)
    });
  }

  applyNameOverrides(artists);
  return artists;
}

function distinctCategories(artists) {
  const seen = new Set();
  artists.forEach((a) => {
    a.categories.forEach((c) => seen.add(c));
  });

  const priority = ['Musician', 'Producer', 'Fashion', 'Sports'];
  const rest = Array.from(seen)
    .filter((c) => priority.indexOf(c) === -1)
    .sort((a, b) => a.localeCompare(b));
  return priority.filter((c) => seen.has(c)).concat(rest);
}

/* ---------- 2. HELPERS ---------- */
const $ = (id) => document.getElementById(id);
const stage = $('stage');
const panel = $('panel');
const scrim = $('scrim');

function rng(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- 3. STATE ---------- */
let activeCategory = null; // null = All
let selectedId = null;
let activeStoryIndex = 0;
let lastTrigger = null;

/* ---------- 4. FILTER CHIPS (by title/role category) ---------- */
function renderChips() {
  const wrap = $('chips');
  wrap.innerHTML = '';
  const categories = distinctCategories(ARTISTS);
  [null, ...categories].forEach((cat) => {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = cat === null ? 'All' : cat;
    b.setAttribute('aria-pressed', String(activeCategory === cat));
    b.addEventListener('click', () => {
      activeCategory = cat;
      renderChips();
      applyFilter();
    });
    wrap.appendChild(b);
  });
}

/* ---------- 5. FLOATING NAMES ---------- */
function renderNames() {
  document.querySelectorAll('.name').forEach((el) => el.remove());

  const rand = rng(42);
  const cols = 7;
  const rows = Math.ceil(ARTISTS.length / cols) || 1;
  ARTISTS.forEach((a, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = (col + 0.1 + rand() * 0.5) / cols * 88 + 1;
    const top = (row + 0.1 + rand() * 0.6) / rows * 86 + 2;
    const b = document.createElement('button');
    b.className = 'name';
    b.dataset.id = a.id;
    b.textContent = a.name;
    b.style.left = left + '%';
    b.style.top = top + '%';
    b.style.fontSize = (13 + Math.floor(rand() * 6)) + 'px';
    b.style.setProperty('--dur', (6 + Math.floor(rand() * 7)) + 's');
    b.style.setProperty('--delay', '-' + Math.floor(rand() * 9) + 's');
    b.addEventListener('click', () => openPanel(a.id, b));
    stage.appendChild(b);
  });
  $('count').textContent = ARTISTS.length + ' names drifting';
  applyFilter();
}

function applyFilter() {
  document.querySelectorAll('.name').forEach((el) => {
    const a = ARTISTS.find((x) => x.id === Number(el.dataset.id));
    const match =
      activeCategory === null ||
      (a && a.categories.indexOf(activeCategory) !== -1);
    el.classList.toggle('is-dim', !match);
  });
}

/* ---------- 6. STORY PANEL ---------- */
function tabLabel(story, index) {
  const title = story.title || 'Story ' + (index + 1);
  const short = title.length > 32 ? title.slice(0, 30) + '…' : title;
  return story.issue != null ? story.issue + ' · ' + short : short;
}

function renderStoryTabs(a) {
  const tabs = $('p-tabs');
  while (tabs.firstChild) tabs.removeChild(tabs.firstChild);

  const stories = a.fullStories || [];
  if (stories.length < 2) {
    tabs.hidden = true;
    return;
  }

  tabs.hidden = false;
  stories.forEach((story, index) => {
    const b = document.createElement('button');
    b.className = 'story-tab';
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(index === activeStoryIndex));
    b.id = 'story-tab-' + index;
    b.textContent = tabLabel(story, index);
    b.title = story.title;
    b.addEventListener('click', () => {
      activeStoryIndex = index;
      showActiveStory(a);
      renderStoryTabs(a);
    });
    tabs.appendChild(b);
  });
}

function showActiveStory(a) {
  const stories = a.fullStories || [];
  const story = stories[activeStoryIndex] || stories[0];

  if (!story) {
    $('p-headline').textContent = a.headline || '[Story headline goes here]';
    const wrap = $('p-story');
    while (wrap.firstChild) wrap.removeChild(wrap.firstChild);
    const p = document.createElement('p');
    p.textContent = '[Full story coming soon.]';
    wrap.appendChild(p);
    return;
  }

  $('p-headline').textContent = story.title;
  const wrap = $('p-story');
  while (wrap.firstChild) wrap.removeChild(wrap.firstChild);

  const paras =
    story.paragraphs && story.paragraphs.length
      ? story.paragraphs
      : ['[Full story coming soon.]'];
  paras.forEach((t) => {
    const p = document.createElement('p');
    p.textContent = t;
    wrap.appendChild(p);
  });

  panel.querySelector('.panel-body').scrollTop = 0;
}

function fillPanel(a) {
  const storyCount = (a.fullStories && a.fullStories.length) || a.stories.length;
  $('p-kind').textContent =
    (storyCount === 1 ? '1 STORY' : storyCount + ' STORIES') +
    (a.categories.length ? ' · ' + a.categories.join(', ').toUpperCase() : '');
  $('p-artist').textContent = 'Stories with ' + a.name;
  $('p-meta').textContent = a.byline;
  if (a.instagram) {
    $('p-byline').textContent = a.instagram;
    $('p-byline').hidden = false;
  } else {
    $('p-byline').textContent = '';
    $('p-byline').hidden = true;
  }
  $('p-quote').textContent = a.quote;
  $('p-quote').hidden = !a.quote;
  const link = $('p-link');
  link.textContent = 'INSTAGRAM';
  if (a.instagram) {
    link.href = a.url;
    link.hidden = false;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  } else {
    link.href = '#';
    link.hidden = true;
    link.removeAttribute('target');
    link.removeAttribute('rel');
  }

  activeStoryIndex = 0;
  renderStoryTabs(a);
  showActiveStory(a);
}

function markSelected() {
  document.querySelectorAll('.name').forEach((el) => {
    if (Number(el.dataset.id) === selectedId) {
      el.setAttribute('aria-current', 'true');
    } else {
      el.removeAttribute('aria-current');
    }
  });
}

function openPanel(id, trigger) {
  const a = ARTISTS.find((x) => x.id === id);
  if (!a) return;
  selectedId = id;
  activeStoryIndex = 0;
  if (trigger) lastTrigger = trigger;
  fillPanel(a);
  markSelected();
  scrim.hidden = false;
  panel.hidden = false;
  $('p-close').focus();
}

function closePanel() {
  selectedId = null;
  panel.hidden = true;
  scrim.hidden = true;
  markSelected();
  if (lastTrigger) lastTrigger.focus();
}

function nextName() {
  const idx = ARTISTS.findIndex((x) => x.id === selectedId);
  const next = ARTISTS[(idx + 1) % ARTISTS.length];
  openPanel(next.id, document.querySelector('.name[data-id="' + next.id + '"]'));
}

$('p-close').addEventListener('click', closePanel);
$('p-next').addEventListener('click', nextName);
scrim.addEventListener('click', closePanel);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !panel.hidden) closePanel();
});

/* ---------- 7. GO ---------- */
async function init() {
  const [csvRes, storiesRes] = await Promise.all([
    fetch(CSV_URL),
    fetch(STORIES_URL)
  ]);
  if (!csvRes.ok) throw new Error('Could not load archive CSV (' + csvRes.status + ')');
  if (!storiesRes.ok) {
    throw new Error('Could not load stories (' + storiesRes.status + ')');
  }

  const text = await csvRes.text();
  const storiesData = await storiesRes.json();
  STORY_LIBRARY = storiesData.stories || [];

  ARTISTS = artistsFromCSV(text);
  attachFullStories(ARTISTS);
  renderChips();
  renderNames();
}

init().catch((err) => {
  console.error(err);
  $('count').textContent = 'Could not load archive data';
});
