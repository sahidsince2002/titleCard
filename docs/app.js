// ============================================================
//  app.js  –  People Search Dashboard
//  Backend: Spring Boot  |  DB: PostgreSQL  |  Method: JPA
//  Endpoint: GET /api/users/search?name={query}
//  Expected response: [{ id: number, name: string }, ...]
// ============================================================

// ── CONFIG ──────────────────────────────────────────────────
const API_BASE_URL = 'http://localhost:8080';     // ← change to your Spring Boot server URL
const SEARCH_ENDPOINT = '/api/v1/title/search';      // ← adjust to match your controller mapping
const DEBOUNCE_MS = 280;                          // ms to wait after last keystroke
const MIN_QUERY_LEN = 1;                          // minimum chars before firing request
// ────────────────────────────────────────────────────────────

// Colour palette for avatars (cycles by id)
const AVATAR_COLORS = [
  '#4f8eff', '#a78bfa', '#34d399', '#f59e0b',
  '#f87171', '#38bdf8', '#fb7185', '#a3e635',
];

// ── DOM Refs ─────────────────────────────────────────────────
const searchInput     = document.getElementById('searchInput');
const suggestionsList = document.getElementById('suggestionsList');
const clearBtn        = document.getElementById('clearBtn');
const searchStatus    = document.getElementById('searchStatus');
const peopleGrid      = document.getElementById('peopleGrid');
const emptyState      = document.getElementById('emptyState');
const resultsTitle    = document.getElementById('resultsTitle');
const resultsCount    = document.getElementById('resultsCount');
const statTotal       = document.getElementById('statTotal');
const statResults     = document.getElementById('statResults');
const statQuery       = document.getElementById('statQuery');

// ── State ─────────────────────────────────────────────────────
let debounceTimer     = null;
let focusedIndex      = -1;
let currentResults    = [];
let abortController   = null;   // for cancelling in-flight requests

// ── Utility helpers ───────────────────────────────────────────

/**
 * Get initials from a full name (up to 2 letters).
 */
function getInitials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');
}

/**
 * Pick a deterministic avatar colour based on id.
 */
function avatarColor(id) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

/**
 * Highlight matched substring(s) in a display name.
 * Wraps each matching segment in <mark> tags.
 */
function highlightMatch(name, query) {
  if (!query) return name;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return name.replace(regex, '<mark>$1</mark>');
}

/**
 * Simple debounce implementation.
 */
function debounce(fn, delay) {
  return (...args) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => fn(...args), delay);
  };
}

// ── API Call ──────────────────────────────────────────────────

/**
 * Fetch people from the Spring Boot backend.
 * Maps to: GET /api/users/search?name={query}
 * Which calls: jpaRepository.findByNameContainingIgnoreCase(name)
 */
async function fetchPeople(query) {
  // Cancel any pending request
  if (abortController) abortController.abort();
  abortController = new AbortController();

  const url = `${API_BASE_URL}${SEARCH_ENDPOINT}?name=${encodeURIComponent(query)}`;

  try {
    const response = await fetch(url, {
      signal: abortController.signal,
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const data = await response.json();
    // Normalise: accept both array-root or { users: [] } shape
    return Array.isArray(data) ? data : (data.users ?? data.content ?? []);

  } catch (err) {
    if (err.name === 'AbortError') return null;   // cancelled – ignore
    throw err;
  }
}

// ── Suggestions Dropdown ──────────────────────────────────────

function openDropdown() {
  suggestionsList.classList.add('open');
  searchInput.setAttribute('aria-expanded', 'true');
}

function closeDropdown() {
  suggestionsList.classList.remove('open');
  searchInput.setAttribute('aria-expanded', 'false');
  focusedIndex = -1;
}

function showLoadingInDropdown() {
  suggestionsList.innerHTML = `
    <li class="suggestion-loading" role="option" aria-disabled="true">
      <div class="spinner"></div>
      <span>Searching…</span>
    </li>`;
  openDropdown();
}

function showNoResults(query) {
  suggestionsList.innerHTML = `
    <li class="suggestion-empty" role="option" aria-disabled="true">
      No people found for "<strong>${escapeHtml(query)}</strong>"
    </li>`;
  openDropdown();
}

function renderSuggestions(people, query) {
  if (!people.length) {
    showNoResults(query);
    return;
  }

  suggestionsList.innerHTML = people.map((person, idx) => `
    <li
      class="suggestion-item"
      role="option"
      data-index="${idx}"
      data-id="${person.id}"
      data-name="${escapeHtml(person.name)}"
    >
      <div class="suggestion-avatar" style="background:${avatarColor(person.id)}">
        ${getInitials(person.name)}
      </div>
      <span class="suggestion-name">${highlightMatch(escapeHtml(person.name), query)}</span>
      <span class="suggestion-id">#${person.id}</span>
    </li>
  `).join('');

  openDropdown();

  // Attach click handlers
  suggestionsList.querySelectorAll('.suggestion-item').forEach(item => {
    item.addEventListener('mousedown', e => {
      e.preventDefault(); // keep focus on input
      selectSuggestion(Number(item.dataset.index));
    });
  });
}

function selectSuggestion(idx) {
  const person = currentResults[idx];
  if (!person) return;

  // Put name into input
  searchInput.value = person.name;
  clearBtn.classList.add('visible');
  closeDropdown();

  // Show this single person as the result
  renderPeopleCards([person], person.name);
  updateStats(currentResults.length, 1, person.name);
  setStatus(`Selected: ${person.name} (ID ${person.id})`, 'success');
}

// ── Keyboard Navigation ───────────────────────────────────────

searchInput.addEventListener('keydown', e => {
  const items = suggestionsList.querySelectorAll('.suggestion-item');
  if (!items.length) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    focusedIndex = Math.min(focusedIndex + 1, items.length - 1);
    updateFocus(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    focusedIndex = Math.max(focusedIndex - 1, 0);
    updateFocus(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (focusedIndex >= 0) {
      selectSuggestion(focusedIndex);
    } else if (currentResults.length) {
      // Show all results on Enter if no item focused
      renderPeopleCards(currentResults, searchInput.value.trim());
      closeDropdown();
    }
  } else if (e.key === 'Escape') {
    closeDropdown();
  }
});

function updateFocus(items) {
  items.forEach((item, i) => {
    item.classList.toggle('focused', i === focusedIndex);
    if (i === focusedIndex) item.scrollIntoView({ block: 'nearest' });
  });
}

// ── Main Search Logic ─────────────────────────────────────────

const debouncedSearch = debounce(async (query) => {
  if (query.length < MIN_QUERY_LEN) {
    closeDropdown();
    setStatus('');
    return;
  }

  showLoadingInDropdown();
  setStatus('Searching…');

  try {
    const people = await fetchPeople(query);
    if (people === null) return; // request was aborted

    currentResults = people;
    renderSuggestions(people, query);

    // Also render cards in the main grid
    renderPeopleCards(people, query);
    updateStats(people.length, people.length, query);

    const msg = people.length
      ? `Found ${people.length} result${people.length !== 1 ? 's' : ''} for "${query}"`
      : `No results for "${query}"`;
    setStatus(msg, people.length ? 'success' : '');

  } catch (err) {
    closeDropdown();
    setStatus(`Error: ${err.message}`, 'error');
    console.error('[People Search] Fetch error:', err);
  }
}, DEBOUNCE_MS);

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim();
  clearBtn.classList.toggle('visible', query.length > 0);

  if (!query) {
    closeDropdown();
    resetGrid();
    updateStats(null, null, null);
    setStatus('');
    return;
  }
  debouncedSearch(query);
});

// Close dropdown when clicking outside
document.addEventListener('click', e => {
  if (!e.target.closest('#searchWrapper')) closeDropdown();
});

// Re-open if input regains focus and there are results
searchInput.addEventListener('focus', () => {
  if (currentResults.length && searchInput.value.trim()) {
    renderSuggestions(currentResults, searchInput.value.trim());
  }
});

// ── Clear Button ──────────────────────────────────────────────
clearBtn.addEventListener('click', () => {
  searchInput.value = '';
  clearBtn.classList.remove('visible');
  closeDropdown();
  resetGrid();
  updateStats(null, null, null);
  setStatus('');
  currentResults = [];
  searchInput.focus();
});

// ── Keyboard shortcut: ⌘K / Ctrl+K ──────────────────────────
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
});

// ── People Cards ──────────────────────────────────────────────

function renderPeopleCards(people, query) {
  if (!people.length) {
    resetGrid();
    return;
  }

  emptyState && emptyState.remove();
  resultsTitle.textContent = `Results for "${query}"`;
  resultsCount.textContent = `${people.length} found`;

  // Clear previous cards
  peopleGrid.querySelectorAll('.person-card').forEach(c => c.remove());

  people.forEach((person, i) => {
    const card = document.createElement('div');
    card.className = 'person-card';
    card.style.animationDelay = `${i * 35}ms`;
    card.innerHTML = `
      <div class="person-avatar" style="background:${avatarColor(person.id)}">
        ${getInitials(person.name)}
      </div>
      <div class="person-name">${escapeHtml(person.name)}</div>
      <div class="person-id">ID: ${person.id}</div>
    `;
    peopleGrid.appendChild(card);
  });
}

function resetGrid() {
  peopleGrid.innerHTML = '';
  resultsTitle.textContent = 'Recent People';
  resultsCount.textContent = '';

  const empty = document.createElement('div');
  empty.id = 'emptyState';
  empty.className = 'empty-state';
  empty.innerHTML = `
    <div class="empty-icon">
      <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="28" cy="28" r="18"/>
        <path d="M40 40 L56 56" stroke-linecap="round" stroke-width="2"/>
        <path d="M22 28 h12 M28 22 v12" stroke-linecap="round"/>
      </svg>
    </div>
    <p class="empty-text">Search for a person to see results here</p>
    <p class="empty-hint">Suggestions appear as you type</p>
  `;
  peopleGrid.appendChild(empty);
}

// ── Stats ─────────────────────────────────────────────────────
function updateStats(total, results, query) {
  statTotal.textContent   = total   != null ? total   : '—';
  statResults.textContent = results != null ? results : '—';
  statQuery.textContent   = query   ? (query.length > 12 ? query.slice(0, 12) + '…' : query) : '—';
}

// ── Status Bar ────────────────────────────────────────────────
function setStatus(msg, type = '') {
  searchStatus.textContent = msg;
  searchStatus.className = 'search-status' + (type ? ` ${type}` : '');
}

// ── XSS guard ────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Init ──────────────────────────────────────────────────────
console.log('[People Search] Ready. Backend:', API_BASE_URL + SEARCH_ENDPOINT);