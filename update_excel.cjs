const xlsx = require('xlsx');

const workbook = xlsx.readFile('docs/MHEWS_Requirement List_Check.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

const headers = data[0];
const checkIdx = headers.indexOf('Check');
const reqIdIdx = headers.indexOf(' Req ID ');
const statementIdx = headers.indexOf(' Statement ');
const acIdx = headers.indexOf(' Acceptance Criteria ');

let newlyAdded = [];

const included = [
  'h3', 'hexagon', 'hexbin', 'heatmap', 'maplibre', 'realtime', 'websocket',
  'django', 'celery', 'node.js', 'supabase', 'magnitude', 'depth', 'time slider',
  'historical', 'i18n', 'offline cache', 'geolocation', 'aggregator', 'deduplication',
  'polling', 'severity toggle', 'layer toggle', 'basemap', 'dark mode', 'light mode',
  'satellite', 'p-wave', 'early warning', 'super_admin', 'country_admin', 'org_admin',
  'viewer', 'country_code', 'bbox', 'upsert', 'profiles', 'organizations'
];

const excluded = [
  'cap alert', 'authoring', 'email', 'whatsapp', 'sms', 'audit logging', 'incident tracking',
  'forecasting', 'risk modeling', 'dissemination', 'reporting', 'narrative', 'template',
  'drill mode', 'timeline playback'
];

for (let i = 1; i < data.length; i++) {
  const row = data[i];
  if (!row[reqIdIdx]) continue;
  
  if (row[checkIdx] === '+') continue;
  
  const text = `${row[statementIdx] || ''} ${row[acIdx] || ''}`.toLowerCase();
  
  let exclude = false;
  for (let ex of excluded) {
    if (text.includes(ex)) {
      exclude = true;
      break;
    }
  }
  if (exclude) {
    row[checkIdx] = 'x';
    continue;
  }
  
  let match = false;
  // Specific role / hierarchy checks
  if (text.includes('role') && (text.includes('profile') || text.includes('organization') || text.includes('hierarchy') || text.includes('permission'))) {
     match = true;
  }
  if (text.includes('filter') && (text.includes('severity') || text.includes('magnitude') || text.includes('depth') || text.includes('date'))) {
     match = true;
  }
  if (text.includes('map') && (text.includes('2d') || text.includes('3d') || text.includes('slider') || text.includes('toggle') || text.includes('layer'))) {
     match = true;
  }
  for (let inc of included) {
    if (text.includes(inc)) {
      match = true;
      break;
    }
  }
  
  if (match) {
    row[checkIdx] = '+';
    newlyAdded.push({ reqId: row[reqIdIdx].trim(), statement: row[statementIdx].trim() });
  } else {
    row[checkIdx] = 'x';
  }
}

const newWorksheet = xlsx.utils.aoa_to_sheet(data);
workbook.Sheets[sheetName] = newWorksheet;
xlsx.writeFile(workbook, 'docs/MHEWS_Requirement List_Check.xlsx');

console.log("Newly added count:", newlyAdded.length);
console.log(JSON.stringify(newlyAdded, null, 2));
