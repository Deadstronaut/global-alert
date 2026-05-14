// ISO 3166-1 numeric code → [primary, secondary] flag colors
export const FLAG_COLORS = {
  '004': ['#000000', '#D32011'], // Afghanistan
  '008': ['#E41E20', '#000000'], // Albania
  '012': ['#006233', '#FFFFFF'], // Algeria
  '024': ['#CC0000', '#000000'], // Angola
  '032': ['#74ACDF', '#FFFFFF'], // Argentina
  '036': ['#00008B', '#FFCD00'], // Australia
  '040': ['#ED2939', '#FFFFFF'], // Austria
  '050': ['#006A4E', '#F42A41'], // Bangladesh
  '056': ['#000000', '#FFD90C'], // Belgium
  '068': ['#D52B1E', '#F9E300'], // Bolivia
  '076': ['#009C3B', '#FFDF00'], // Brazil
  '100': ['#FFFFFF', '#00966E'], // Bulgaria
  '116': ['#032EA1', '#E00025'], // Cambodia
  '120': ['#007A5E', '#CE1126'], // Cameroon
  '124': ['#FF0000', '#FFFFFF'], // Canada
  '152': ['#D52B1E', '#FFFFFF'], // Chile
  '156': ['#DE2910', '#FFDE00'], // China
  '170': ['#FCD116', '#003087'], // Colombia
  '180': ['#007FFF', '#F7D618'], // DRC
  '188': ['#002B7F', '#CF142B'], // Costa Rica
  '191': ['#FF0000', '#FFFFFF'], // Croatia
  '192': ['#002A8F', '#CC0001'], // Cuba
  '196': ['#003480', '#FFFFFF'], // Cyprus
  '203': ['#D7141A', '#FFFFFF'], // Czech Republic
  '208': ['#C60C30', '#FFFFFF'], // Denmark
  '218': ['#FFD100', '#003893'], // Ecuador
  '818': ['#CE1126', '#FFFFFF'], // Egypt
  '231': ['#078930', '#FCDD09'], // Ethiopia
  '246': ['#003580', '#FFFFFF'], // Finland
  '250': ['#002395', '#ED2939'], // France
  '276': ['#000000', '#DD0000'], // Germany
  '288': ['#006B3F', '#FCD116'], // Ghana
  '300': ['#0D5EAF', '#FFFFFF'], // Greece
  '320': ['#4997D0', '#FFFFFF'], // Guatemala
  '332': ['#00209F', '#D21034'], // Haiti
  '340': ['#0073CF', '#FFFFFF'], // Honduras
  '348': ['#CE2939', '#FFFFFF'], // Hungary
  '356': ['#FF9933', '#FFFFFF'], // India
  '360': ['#CE1126', '#FFFFFF'], // Indonesia
  '364': ['#239F40', '#DA0000'], // Iran
  '368': ['#CE1126', '#FFFFFF'], // Iraq
  '372': ['#169B62', '#FFFFFF'], // Ireland
  '376': ['#0038B8', '#FFFFFF'], // Israel
  '380': ['#009246', '#CE2B37'], // Italy
  '388': ['#000000', '#FFD700'], // Jamaica
  '392': ['#BC002D', '#FFFFFF'], // Japan
  '400': ['#007A3D', '#FFFFFF'], // Jordan
  '398': ['#00AFCA', '#FFCD00'], // Kazakhstan
  '404': ['#006600', '#BB0000'], // Kenya
  '410': ['#003478', '#CD2E3A'], // South Korea
  '414': ['#007A3D', '#FFFFFF'], // Kuwait
  '418': ['#CE1126', '#002868'], // Laos
  '422': ['#FFFFFF', '#00A650'], // Lebanon
  '434': ['#000000', '#239E46'], // Libya
  '458': ['#CC0001', '#FFFFFF'], // Malaysia
  '484': ['#006847', '#CE1126'], // Mexico
  '504': ['#C1272D', '#006233'], // Morocco
  '508': ['#009A44', '#FFFFFF'], // Mozambique
  '516': ['#003580', '#CF0921'], // Namibia
  '524': ['#003893', '#DC143C'], // Nepal
  '528': ['#AE1C28', '#FFFFFF'], // Netherlands
  '554': ['#00247D', '#CC142B'], // New Zealand
  '558': ['#3E6EC0', '#FFFFFF'], // Nicaragua
  '562': ['#E05206', '#FFFFFF'], // Niger
  '566': ['#008751', '#FFFFFF'], // Nigeria
  '578': ['#EF2B2D', '#FFFFFF'], // Norway
  '586': ['#01411C', '#FFFFFF'], // Pakistan
  '591': ['#DA121A', '#FFFFFF'], // Panama
  '600': ['#D52B1E', '#FFFFFF'], // Paraguay
  '604': ['#D91023', '#FFFFFF'], // Peru
  '608': ['#0038A8', '#CE1126'], // Philippines
  '616': ['#DC143C', '#FFFFFF'], // Poland
  '620': ['#006600', '#FF0000'], // Portugal
  '630': ['#ED0C27', '#FFFFFF'], // Puerto Rico
  '634': ['#8D1B3D', '#FFFFFF'], // Qatar
  '642': ['#002B7F', '#FCD116'], // Romania
  '643': ['#FFFFFF', '#D52B1E'], // Russia
  '682': ['#006C35', '#FFFFFF'], // Saudi Arabia
  '686': ['#00853F', '#FDEF42'], // Senegal
  '694': ['#1EB53A', '#FFFFFF'], // Sierra Leone
  '706': ['#4189DD', '#FFFFFF'], // Somalia
  '710': ['#007A4D', '#FFB612'], // South Africa
  '724': ['#AA151B', '#F1BF00'], // Spain
  '144': ['#8D153A', '#FFB300'], // Sri Lanka
  '729': ['#D21034', '#FFFFFF'], // Sudan
  '752': ['#006AA7', '#FECC02'], // Sweden
  '756': ['#D52B1E', '#FFFFFF'], // Switzerland
  '760': ['#CE1126', '#FFFFFF'], // Syria
  '158': ['#FE0000', '#FFFFFF'], // Taiwan
  '762': ['#CC0000', '#FFFFFF'], // Tajikistan
  '834': ['#1EB53A', '#FCD116'], // Tanzania
  '764': ['#A51931', '#FFFFFF'], // Thailand
  '788': ['#E70013', '#FFFFFF'], // Tunisia
  '792': ['#E30A17', '#FFFFFF'], // Turkiye
  '800': ['#000000', '#FCDC04'], // Uganda
  '804': ['#005BBB', '#FFD500'], // Ukraine
  '784': ['#00732F', '#FFFFFF'], // UAE
  '826': ['#CF142B', '#FFFFFF'], // UK
  '840': ['#3C3B6E', '#B22234'], // USA
  '858': ['#FFFFFF', '#0038A8'], // Uruguay
  '860': ['#1EB53A', '#FFFFFF'], // Uzbekistan
  '862': ['#CF142B', '#003893'], // Venezuela
  '704': ['#DA251D', '#FFCD00'], // Vietnam
  '887': ['#CE1126', '#FFFFFF'], // Yemen
  '894': ['#198A00', '#DE0000'], // Zambia
  '716': ['#006400', '#FFD200'], // Zimbabwe
};

export function getFlagColors(numericId) {
  return FLAG_COLORS[String(numericId).padStart(3, '0')] ?? ['#334155', '#475569'];
}
