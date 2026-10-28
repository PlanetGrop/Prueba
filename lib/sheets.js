const aliases = {
  service: ['servicio', 'plataforma', 'aplicacion', 'cuenta', 'service', 'nombre'],
  username: ['correo', 'email', 'usuario', 'user', 'username', 'appleid', 'correoelectronico'],
  password: ['contrasena', 'password', 'clave', 'contrasenaactual'],
  category: ['categoria', 'category', 'grupo', 'tipo'],
  notes: ['notas', 'notes', 'observaciones', 'descripcion'],
  url: ['url', 'enlace', 'sitio', 'web']
};

export function normalizeHeader(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function parseSheet(values) {
  if (!values?.length) return [];
  const first = values[0].map(normalizeHeader);
  if (first.some(h => h.startsWith('departamento') || h.startsWith('colaborador'))) return parseTeamSheet(values);
  const headers = values[0].map(normalizeHeader);
  const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, headers.findIndex(h => names.includes(h))]));
  if (columns.service < 0 || columns.username < 0 || columns.password < 0) {
    throw new Error('La primera fila debe incluir Servicio, Correo (o Usuario) y Contraseña. También se aceptan Plataforma, Email y Clave.');
  }
  return values.slice(1).flatMap((row, index) => {
    const entry = Object.fromEntries(Object.entries(columns).map(([key, column]) => [key, column < 0 ? '' : String(row[column] ?? '')]));
    if (!entry.service.trim() && !entry.username.trim() && !entry.password) return [];
    return [{ ...entry, id: `row-${index + 2}`, service: entry.service.trim() || 'Sin nombre', category: entry.category.trim() || 'General' }];
  });
}

// Supports merged service headers in row 1 and account fields in row 2.
export function parseTeamSheet(values) {
  const top = values[0] || [];
  const sub = (values[1] || []).map(normalizeHeader);
  const department = top.findIndex(h => normalizeHeader(h).startsWith('departamento'));
  const collaborator = top.findIndex(h => normalizeHeader(h).startsWith('colaborador'));
  const pairs = [];
  let group = '';
  for (let col = 0; col < Math.max(top.length, sub.length); col++) {
    if (String(top[col] || '').trim()) group = String(top[col]).trim();
    if (sub[col] === 'bitrix') {
      pairs.push({ group: 'Bitrix', user: -1, password: col });
      continue;
    }
    if (!aliases.username.includes(sub[col])) continue;
    const password = col + 1;
    if (!aliases.password.includes(sub[password])) continue;
    pairs.push({ group: group.replace(/^cuenta\s+de\s+/i, '').replace(/Googlev$/i, 'Google'), user: col, password });
  }
  if (!pairs.length) throw new Error('No se encontraron pares de Correo/Usuario y Contraseña en la segunda fila.');
  let currentDepartment = '';
  return values.slice(2).flatMap((row, index) => {
    if (String(row[department] || '').trim()) currentDepartment = String(row[department]).trim();
    const person = String(row[collaborator] || '').trim();
    return pairs.flatMap(pair => {
      const username = String(row[pair.user] ?? '');
      const password = String(row[pair.password] ?? '');
      if (!username.trim() && !password) return [];
      return [{ id: `row-${index + 3}-col-${pair.user}`, service: pair.group || 'Cuenta', username, password, category: currentDepartment || 'Sin departamento', collaborator: person, notes: '', url: '' }];
    });
  });
}

export function sheetRange(tab) {
  return tab ? `'${tab.replaceAll("'", "''")}'!A1:ZZ10001` : 'A1:ZZ10001';
}

export const demoCredentials = [
  { id: 'demo-1', service: 'Google', username: 'ana.demo@example.com', password: 'Demo-Google-2026!', category: 'Administración', collaborator: 'Ana Rodríguez', notes: 'Cuenta de ejemplo. Todos los datos de esta vista son ficticios.', url: '' },
  { id: 'demo-2', service: 'Google', username: 'carlos.demo@example.com', password: 'Demo-Carlos-2026!', category: 'Tecnología', collaborator: 'Carlos Méndez', notes: '', url: '' },
  { id: 'demo-3', service: 'MOCHAHOST (995-465)', username: 'ana.demo@example.com', password: 'Demo-Hosting-2026!', category: 'Administración', collaborator: 'Ana Rodríguez', notes: '', url: '' },
  { id: 'demo-4', service: 'SIRETT', username: 'laura.demo', password: 'Demo-Sirett-2026!', category: 'Operaciones', collaborator: 'Laura Vargas', notes: '', url: '' },
  { id: 'demo-5', service: 'SERVIDOR', username: 'carlos.demo', password: 'Demo-Servidor-2026!', category: 'Tecnología', collaborator: 'Carlos Méndez', notes: '', url: '' },
  { id: 'demo-6', service: 'Apple ID', username: 'laura.demo@example.com', password: 'Demo-Apple-2026!', category: 'Operaciones', collaborator: 'Laura Vargas', notes: 'Cuenta de ejemplo para un dispositivo.', url: '' }
];
