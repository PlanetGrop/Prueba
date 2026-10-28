import { readFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
import { createHash } from 'node:crypto';

// Explicit source-only allowlist: never export .env, sessions, dependencies or user data.
const projectFiles = [
  '.env.example', '.gitignore', 'README.md', 'package.json', 'package-lock.json',
  'server.js', 'lib/sheets.js', 'lib/download.js', 'lib/session-store.js',
  'public/index.html', 'public/style.css', 'public/app.js', 'test/app.test.js', 'test/session-store.test.js',
  '.env.production.example', 'Dockerfile', '.dockerignore', 'render.yaml'
];

export async function buildProjectArchive() {
  const files = await Promise.all(projectFiles.map(async path => [
    `clave/${path}`, await readFile(new URL(`../${path}`, import.meta.url))
  ]));
  return Buffer.from(zipSync(Object.fromEntries(files), { level: 6 }));
}

export async function buildWindowsInstaller() {
  const archive = await buildProjectArchive();
  const sha256 = createHash('sha256').update(archive).digest('hex');
  const base64 = archive.toString('base64').match(/.{1,76}/g).join('\n');
  const script = `& {
  # Clave: crea una carpeta nueva en el Escritorio. No descarga ni ejecuta codigo remoto.
  $claveBase64 = @'
${base64}
'@
  $claveBytes = [Convert]::FromBase64String($claveBase64)
  $claveHasher = [Security.Cryptography.SHA256]::Create()
  try {
    $claveHash = ([BitConverter]::ToString($claveHasher.ComputeHash($claveBytes))).Replace('-', '').ToLowerInvariant()
  } finally { $claveHasher.Dispose() }
  if ($claveHash -ne '${sha256}') { throw 'El bloque esta incompleto. Vuelve a copiarlo entero.' }
  $claveDesktop = [Environment]::GetFolderPath('Desktop')
  if (-not $claveDesktop) { $claveDesktop = [Environment]::GetFolderPath('UserProfile') }
  $claveFolder = Join-Path $claveDesktop ('Clave-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 6))
  New-Item -ItemType Directory -Path $claveFolder -ErrorAction Stop | Out-Null
  $claveZip = Join-Path $claveFolder 'clave-local.zip'
  [IO.File]::WriteAllBytes($claveZip, $claveBytes)
  Expand-Archive -LiteralPath $claveZip -DestinationPath $claveFolder -ErrorAction Stop
  Set-Location (Join-Path $claveFolder 'clave') -ErrorAction Stop
  Write-Host ('Proyecto creado en: ' + (Get-Location).Path) -ForegroundColor Green
  Write-Host 'Con Node.js 24 LTS instalado, ejecuta estos dos comandos:'
  Write-Host 'npm ci'
  Write-Host 'npm start'
  Write-Host 'Luego abre Chrome en http://localhost:3000'
}
`;
  return { script, sha256 };
}
