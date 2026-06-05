import countries from './countries.json';

export function loadConfig(countryCode) {
  if (!countryCode) return null;
  const code = countryCode.toLowerCase();
  const config = countries[code];
  if (!config) return null;
  return { countryCode: code, ...config };
}

export function getAllCountryCodes() {
  return Object.keys(countries);
}
