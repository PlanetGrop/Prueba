const paths = {
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9Z"/>',
  link: '<path d="m10 13 4-4m-5 6-1.5 1.5a3.5 3.5 0 0 1-5-5L7 8a3.5 3.5 0 0 1 5 0m0 8a3.5 3.5 0 0 0 5 0l3.5-3.5a3.5 3.5 0 0 0-5-5L14 9"/>',
  shield: '<path d="M12 3 4 6v5c0 5 8 10 8 10s8-5 8-10V6Zm-4 9 3 3 5-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  refresh: '<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
  sheet: '<path d="M6 2h9l4 4v16H5V3a1 1 0 0 1 1-1Zm9 0v5h4"/><path d="M8 11h8v7H8Zm0 3.5h8M12 11v7"/>',
  key: '<circle cx="8" cy="8" r="5"/><path d="m12 12 9 9m-6-6 3-3m0 6 3-3"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v3"/>',
  building: '<path d="M4 21V3h12v18m0-13h4v13M2 21h20M8 7h4m-4 4h4m-4 4h4m-3 6v-3h2v3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="m3 3 18 18M10 5c7-1 12 7 12 7s-1 3-4 5M6 6a20 20 0 0 0-4 6s4 7 10 7c2 0 3-.5 4-1m-7-9a4 4 0 0 0 5 5"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/>',
  logout: '<path d="M9 4H4v16h5m5-12 4 4-4 4m-5-4h12"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.key}</svg>`;
document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
const $ = id => document.getElementById(id);
const state = { entries: [], mode: 'demo', authenticated: false, view: 'all', service: '', favorites: new Set(), revealed: new Set(), revealTimers: new Map(), loading: false, syncedAt: null, lastActivity: Date.now(), epoch: 0 };
const dialog = $('connection-dialog');
const exportDialog = $('export-dialog');
const initials = text => text.trim().split(/\s+/).slice(0, 2).map(s => s[0] || '').join('').toUpperCase() || '—';
const fold = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function action(name, label, handler, className = 'icon-button') {
  const button = element('button', className);
  button.innerHTML = icon(name);
  button.title = label;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', handler);
  return button;
}
let toastTimer;
function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.add('hidden'), 3200);
}
function notice(message) {
  $('notice').textContent = message;
  $('notice').classList.toggle('hidden', !message);
  $('login-error').textContent = message;
  $('login-error').classList.toggle('hidden', !message);
}
function hidePasswords(render = true) {
  for (const timer of state.revealTimers.values()) clearTimeout(timer);
  state.revealTimers.clear();
  state.revealed.clear();
  if (render) renderRows();
}
async function copy(value, label) {
  if (!value) return toast('Esta cuenta no tiene ese dato en la hoja.');
  try { await navigator.clipboard.writeText(value); toast(`${label} copiado. El portapapeles puede conservarlo; bórralo después de usarlo.`); }
  catch { toast('El navegador bloqueó el portapapeles. Usa HTTPS o permite el acceso.'); }
}
function reveal(id) {
  if (state.revealed.has(id)) {
    state.revealed.delete(id);
    clearTimeout(state.revealTimers.get(id));
    state.revealTimers.delete(id);
  } else {
    state.revealed.add(id);
    state.revealTimers.set(id, setTimeout(() => { state.revealed.delete(id); state.revealTimers.delete(id); renderRows(); }, 20000));
  }
  renderRows();
}
function filterEntries() {
  const query = fold($('search').value);
  return state.entries.filter(entry =>
    (state.view !== 'favorites' || state.favorites.has(entry.id)) &&
    (!state.service || entry.service === state.service) &&
    (!$('department').value || entry.category === $('department').value) &&
    fold([entry.service, entry.username, entry.collaborator, entry.category, entry.notes].join(' ')).includes(query)
  );
}
function renderRows() {
  const entries = filterEntries();
  const body = $('accounts-body');
  body.replaceChildren();
  for (const entry of entries) {
    const row = element('tr');
    const favoriteCell = element('td');
    const favorite = action('star', `${state.favorites.has(entry.id) ? 'Quitar de' : 'Añadir a'} favoritos: ${entry.service}`, () => {
      if (state.favorites.has(entry.id)) state.favorites.delete(entry.id); else state.favorites.add(entry.id);
      renderRows();
    }, `favorite-toggle${state.favorites.has(entry.id) ? ' selected' : ''}`);
    favorite.setAttribute('aria-pressed', String(state.favorites.has(entry.id)));
    favoriteCell.append(favorite);
    const accountCell = element('td');
    const account = element('div', 'account-cell');
    const serviceKey = fold(entry.service).split(/\s/)[0];
    const logo = element('div', `service-logo ${['google','apple','sirett','servidor','mochahost'].find(key => serviceKey.startsWith(key)) || ''}`, entry.service.charAt(0).toUpperCase());
    if (serviceKey === 'servidor') logo.innerHTML = icon('building');
    const accountDetails = element('div');
    accountDetails.append(element('span', 'account-name', entry.service), element('span', 'account-email', entry.username || 'Sin usuario indicado'));
    account.append(logo, accountDetails); accountCell.append(account);
    const personCell = element('td');
    const person = element('div', 'person-cell');
    person.append(element('span', 'person-avatar', initials(entry.collaborator || '')), element('span', '', entry.collaborator || 'Sin colaborador'));
    personCell.append(person);
    const departmentCell = element('td');
    const tag = element('span', 'department-tag', entry.category);
    tag.dataset.color = String([...new Set(state.entries.map(e => e.category))].indexOf(entry.category) % 3);
    departmentCell.append(tag);
    const passwordCell = element('td');
    const password = element('div', 'password-wrap');
    const isRevealed = state.revealed.has(entry.id);
    password.append(element('span', `password-text${isRevealed ? ' revealed' : ''}`, !entry.password ? 'Sin contraseña' : isRevealed ? entry.password : '••••••••'));
    if (entry.password) password.append(action(isRevealed ? 'eye-off' : 'eye', `${isRevealed ? 'Ocultar' : 'Mostrar'} contraseña de ${entry.service} de ${entry.collaborator || entry.username}`, () => reveal(entry.id)));
    passwordCell.append(password);
    const actionsCell = element('td');
    const actions = element('div', 'row-actions');
    actions.append(action('copy', `Copiar usuario de ${entry.service} de ${entry.collaborator || entry.username}`, () => copy(entry.username, 'Usuario')), action('key', `Copiar contraseña de ${entry.service} de ${entry.collaborator || entry.username}`, () => copy(entry.password, 'Contraseña')));
    actionsCell.append(actions);
    row.append(favoriteCell, accountCell, personCell, departmentCell, passwordCell, actionsCell);
    body.append(row);
  }
  $('empty').classList.toggle('hidden', entries.length > 0 || (state.mode === 'google' && !state.authenticated));
  $('result-count').textContent = entries.length;
  $('footer-count').textContent = `${entries.length} de ${state.entries.length} cuentas`;
  $('favorite-count').textContent = state.favorites.size;
  $('list-title').textContent = state.view === 'favorites' ? 'Tus favoritos' : 'Tus credenciales';
}
function renderFilters() {
  const selected = $('department').value;
  $('department').replaceChildren(new Option('Todos los departamentos', ''));
  [...new Set(state.entries.map(e => e.category))].sort().forEach(name => $('department').add(new Option(name, name)));
  $('department').value = selected;
  if ($('department').selectedIndex < 0) $('department').value = '';
  const services = [...new Set(state.entries.map(e => e.service))];
  if (!services.includes(state.service)) state.service = '';
  $('services').replaceChildren();
  for (const name of ['', ...services]) {
    const button = element('button', `service-chip${state.service === name ? ' active' : ''}`, name || 'Todos los servicios');
    button.setAttribute('aria-pressed', String(state.service === name));
    button.addEventListener('click', () => { state.service = name; hidePasswords(false); renderFilters(); renderRows(); });
    $('services').append(button);
  }
}
function renderSummary() {
  $('total-count').textContent = state.entries.length;
  $('nav-count').textContent = state.entries.length;
  $('people-count').textContent = new Set(state.entries.map(e => e.collaborator).filter(Boolean)).size;
  $('department-count').textContent = new Set(state.entries.map(e => e.category)).size;
  $('sync-time').textContent = state.syncedAt ? new Date(state.syncedAt).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—';
  $('sync-detail').textContent = state.mode === 'demo' ? 'Lectura de datos ficticios' : state.syncedAt ? 'Consulta automática cada 60 s' : 'Conecta tu cuenta de Google';
}
function renderConnection() {
  const real = state.mode === 'google';
  const locked = real && !state.authenticated;
  document.body.classList.toggle('locked', locked);
  $('login-screen').classList.toggle('hidden', !locked);
  $('export-windows').classList.toggle('hidden', state.localTools === false);
  $('connection-title').textContent = real ? state.authenticated ? 'Tu hoja está conectada' : 'Conecta tu hoja de cálculo' : 'Vista de demostración';
  $('connection-description').textContent = real ? 'Lectura privada de Google Sheets. Los cambios se consultan cada 60 segundos.' : 'Explora la interfaz con datos ficticios antes de conectar tu hoja.';
  $('connection-badge').className = `badge${real && state.authenticated ? '' : ' demo'}`;
  $('connection-badge').replaceChildren(element('span'), document.createTextNode(real ? state.authenticated ? 'Conectado' : 'Sin sesión' : 'Demo'));
  $('connect').textContent = real && state.authenticated ? 'Ver conexión ↗' : 'Conectar Google Sheets ↗';
  $('profile-name').textContent = state.email || (real ? 'Acceso privado' : 'Modo de demostración');
  $('profile-detail').textContent = state.authenticated ? 'Cuenta autorizada' : real ? 'Inicia sesión' : 'Datos ficticios';
  $('logout').classList.toggle('hidden', !state.authenticated);
  $('footer-status').textContent = real ? state.authenticated ? 'Conectado a Google Sheets' : 'Inicia sesión para ver tus cuentas' : 'Datos de demostración';
  $('setup-message').classList.toggle('hidden', real);
  $('google-login').classList.toggle('hidden', !real || state.authenticated);
  $('sync').disabled = real && !state.authenticated;
}
async function loadCredentials(manual = false) {
  if (state.loading || (state.mode === 'google' && !state.authenticated)) return;
  state.loading = true;
  const epoch = state.epoch;
  $('sync').disabled = true;
  $('sync').lastElementChild.textContent = 'Consultando…';
  try {
    const response = await fetch('/api/credentials', { cache: 'no-store' });
    const data = await response.json();
    if (epoch !== state.epoch) return;
    if (!response.ok) {
      if (response.status === 401) { state.authenticated = false; renderConnection(); }
      throw new Error(data.error || 'No se pudo consultar la hoja.');
    }
    hidePasswords(false);
    state.entries = data.credentials;
    state.syncedAt = data.syncedAt;
    const ids = new Set(state.entries.map(e => e.id));
    state.favorites = new Set([...state.favorites].filter(id => ids.has(id)));
    notice('');
    if (manual) toast(state.mode === 'demo' ? 'Datos de demostración actualizados.' : 'Hoja sincronizada.');
  } catch (error) {
    if (epoch !== state.epoch) return;
    // Clear previous secrets if access fails or is revoked; never leave stale credentials visible.
    hidePasswords(false); state.entries = []; state.syncedAt = null;
    notice(error.message);
  } finally {
    state.loading = false;
    $('sync').disabled = state.mode === 'google' && !state.authenticated;
    $('sync').lastElementChild.textContent = 'Sincronizar';
    renderFilters(); renderRows(); renderSummary();
  }
}
function resetFilters() {
  $('search').value = ''; $('department').value = ''; state.service = '';
  hidePasswords(false); renderFilters(); renderRows();
}
async function logout(message = 'Sesión cerrada.') {
  state.epoch++;
  state.authenticated = false; hidePasswords(false); state.entries = []; state.syncedAt = null; state.favorites.clear();
  renderConnection(); renderFilters(); renderRows(); renderSummary();
  try {
    const response = await fetch('/auth/logout', { method: 'POST' });
    if (!response.ok) throw new Error();
    toast(message);
  } catch { notice('No se pudo cerrar la sesión en el servidor. Cierra el navegador o inténtalo de nuevo.'); }
}
$('connect').addEventListener('click', () => dialog.showModal());
$('connection-nav').addEventListener('click', () => dialog.showModal());
$('export-windows').addEventListener('click', async () => {
  hidePasswords();
  exportDialog.showModal();
  $('export-code').value = '';
  $('copy-export').disabled = true;
  $('select-export').disabled = true;
  $('export-status').textContent = 'Preparando el proyecto…';
  try {
    const response = await fetch('/api/project-export/windows', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    const data = await response.json();
    if (!data.script) throw new Error();
    $('export-code').value = data.script;
    $('copy-export').disabled = false;
    $('select-export').disabled = false;
    $('export-status').textContent = 'Listo. Copia el bloque entero; incluye el proyecto completo.';
  } catch { $('export-status').textContent = 'No se pudo preparar el bloque. Cierra esta ventana e inténtalo de nuevo.'; }
});
$('select-export').addEventListener('click', () => {
  $('export-code').focus(); $('export-code').select();
  $('export-status').textContent = 'Texto seleccionado. Presiona Ctrl+C y pégalo en PowerShell.';
});
$('copy-export').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('export-code').value);
    $('export-status').textContent = 'Bloque copiado. Abre PowerShell, pégalo y pulsa Enter.';
  } catch {
    $('export-code').focus(); $('export-code').select();
    $('export-status').textContent = 'El navegador bloqueó la copia automática. El bloque está seleccionado: presiona Ctrl+C.';
  }
});
dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close(); } });
$('sync').addEventListener('click', () => loadCredentials(true));
$('search').addEventListener('input', () => { hidePasswords(false); renderRows(); });
$('department').addEventListener('change', () => { hidePasswords(false); renderRows(); });
$('clear-filters').addEventListener('click', resetFilters);
$('empty-reset').addEventListener('click', resetFilters);
$('logout').addEventListener('click', () => logout());
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  state.view = button.dataset.view;
  document.querySelectorAll('[data-view]').forEach(b => b.classList.toggle('active', b === button));
  $('page-title').textContent = state.view === 'favorites' ? 'Tus favoritos.' : 'Todas tus cuentas.';
  $('breadcrumb-view').textContent = state.view === 'favorites' ? 'Favoritos' : 'Todas las cuentas';
  hidePasswords(false); renderRows();
}));
document.addEventListener('keydown', event => {
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !dialog.open && !exportDialog.open) { event.preventDefault(); $('search').focus(); }
});
document.addEventListener('visibilitychange', () => {
  hidePasswords();
  if (!document.hidden) {
    if (state.authenticated && Date.now() - state.lastActivity > 5 * 60 * 1000) logout('Sesión cerrada por inactividad.');
    else loadCredentials();
  }
});
window.addEventListener('blur', () => hidePasswords());
for (const type of ['pointerdown', 'keydown', 'input']) document.addEventListener(type, () => { state.lastActivity = Date.now(); }, { passive: true });
setInterval(() => { if (state.authenticated && Date.now() - state.lastActivity > 5 * 60 * 1000) logout('Sesión cerrada por inactividad.'); }, 15000);
setInterval(() => { if (!document.hidden && state.mode === 'google' && state.authenticated) loadCredentials(); }, 60000);

async function init() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) throw new Error();
    Object.assign(state, await response.json());
    renderConnection(); renderSummary();
    await loadCredentials();
    const auth = new URLSearchParams(location.search).get('auth');
    if (auth) {
      history.replaceState(null, '', '/');
      notice(auth === 'denied' ? 'Esta cuenta de Google no tiene acceso. Usa la cuenta autorizada.' : auth === 'setup' ? 'Falta configurar el acceso de Google en el servidor.' : 'No se pudo iniciar sesión. Inténtalo de nuevo.');
    } else if (state.configurationIncomplete) notice('La configuración de Google está incompleta. Solo se muestran datos ficticios.');
  } catch { notice('No se pudo conectar con el servidor. Recarga la página para volver a intentarlo.'); }
}
init();
