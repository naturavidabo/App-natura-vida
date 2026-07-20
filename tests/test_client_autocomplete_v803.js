const fs = require('fs');
const vm = require('vm');

const context = {
  console,
  window: {},
  AppState: {
    clients: [
      { id: '1', name: 'Dra Alejandra Biomujer', phone: '77699037', city: 'Santa Cruz', customerType: 'wholesale' },
      { id: '2', name: 'Comercial María', phone: '71234567', city: 'Warnes', customerType: 'wholesale' },
      { id: '3', name: 'Juan Pérez', phone: '70000000', city: 'Montero', customerType: 'unit' }
    ],
    sales: [], priceGroups: [], settings: {}, session: {}
  },
  normalizeSearch: value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
  escapeHtml: value => String(value || ''),
  $: () => null,
  $all: () => [],
  showToast: () => {},
  openSheet: () => {},
  DB: {},
  uid: () => '',
  readImageFile: () => {},
  setTimeout,
  clearTimeout,
  confirm: () => false,
  navigator: {},
  document: {}
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/clients.js', 'utf8'), context);

const similar = context.clientSuggestionsV802('Alejan').map(row => row.client.id);
const unrelated = context.clientSuggestionsV802('xyz').map(row => row.client.id);
const punctuationVariant = context.findLikelyDuplicateClientV802('Dra. Alejandra Biomujer', '');
const phoneMatch = context.findLikelyDuplicateClientV802('Nombre diferente', '71234567');

if (JSON.stringify(similar) !== '["1"]') throw new Error(`Sugerencia por similitud incorrecta: ${JSON.stringify(similar)}`);
if (unrelated.length) throw new Error(`Una consulta no relacionada devolvió: ${JSON.stringify(unrelated)}`);
if (!punctuationVariant || punctuationVariant.client.id !== '1') throw new Error('No detectó variación de puntuación en el nombre.');
if (!phoneMatch || phoneMatch.client.id !== '2' || phoneMatch.reason !== 'mismo teléfono') throw new Error('No detectó teléfono duplicado.');

console.log('Autocompletado de clientes V8.0.6: 4/4 controles OK');
