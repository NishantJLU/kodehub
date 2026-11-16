import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
const version = packageJson.version || '1.0.0';
const zipName = `kodehub-v${version}.zip`;
const zipPath = path.join(rootDir, zipName);

if (!fs.existsSync(distDir)) {
  console.error('Error: dist directory does not exist. Run "npm run build" first.');
  process.exit(1);
}

// Ensure manifest.json exists in dist
if (!fs.existsSync(path.join(distDir, 'manifest.json'))) {
  console.error('Error: manifest.json is missing in dist directory.');
  process.exit(1);
}

console.log(`Packaging extension into ${zipName}...`);

// Remove existing zip if present
if (fs.existsSync(zipPath)) {
  fs.unlinkSync(zipPath);
}

let packed = false;

// 1. Try python3 / python zipfile
try {
  execSync(`python3 -c "import zipfile, os; z = zipfile.ZipFile('${zipPath}', 'w', zipfile.ZIP_DEFLATED); [z.write(os.path.join(r, f), os.path.relpath(os.path.join(r, f), '${distDir}')) for r, d, fs_ in os.walk('${distDir}') for f in fs_]; z.close()"`, { stdio: 'pipe' });
  packed = true;
} catch (e) {
  // Python 3 not available or failed
}

// 2. Fallback to native zip utility (macOS / Linux)
if (!packed) {
  try {
    execSync(`cd "${distDir}" && zip -r "${zipPath}" .`, { stdio: 'pipe' });
    packed = true;
  } catch (e) {
    // zip command not available
  }
}

// 3. Fallback to PowerShell (Windows)
if (!packed) {
  try {
    execSync(`powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}' -Force"`, { stdio: 'pipe' });
    packed = true;
  } catch (e) {
    // PowerShell not available
  }
}

if (packed && fs.existsSync(zipPath)) {
  const stats = fs.statSync(zipPath);
  console.log(`✓ Successfully created ${zipName} (${(stats.size / 1024).toFixed(1)} KB)`);
  console.log(`Ready for distribution: Upload ${zipName} as a release asset on GitHub!`);
} else {
  console.error('Failed to create zip file. Please ensure zip, python3, or powershell is available.');
  process.exit(1);
}
