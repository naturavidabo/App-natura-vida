const fs = require('fs');
const vm = require('vm');

const context = {
  console,
  window: {},
  AppState: {
    settings: {
      currency: 'Bs',
      commercialRules: {
        enabled: true,
        enforcementMode: 'block',
        marginBasis: 'sale',
        minimumMarginPercent: 20,
        globalMaximumDiscountPercent: 30,
        requireReasonFromPercent: 1,
        allowCentralOverride: true,
        promotionsCanStack: false,
        roleDiscountLimits: {
          central_admin: 30,
          regional_admin: 15,
          commercial_representative: 10,
          field_seller: 5
        }
      },
      commercialPromotions: []
    },
    session: { commercialRole: 'central_admin' },
    products: []
  },
  roundBs: n => Math.round((Number(n) || 0) * 100) / 100,
  fmtMoney: n => `Bs ${Math.round((Number(n) || 0) * 100) / 100}`,
  grossCost: p => Number(p.cost || 0),
  resellerEffectiveCost: p => Number(p.resellerAcquisitionCost || p.cost || 0) + Number(p.resellerAdditionalCost || 0),
  publicPrice: p => Number(p.publicPrice || 0),
  marketPrice: p => Number(p.marketPrice || 0),
  representativePrice: p => Number(p.resellerPrice || 0),
  saveSettings: async () => {},
  document: {},
  navigator: { onLine: true },
  setTimeout,
  clearTimeout
};
context.window = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/v8-commercial-rules.js', 'utf8'), context);

const product = { id: 'p1', name: 'Aceite 500 ml', cost: 100, publicPrice: 150, marketPrice: 140, resellerPrice: 130 };
context.AppState.products = [product];

const floor = context.minimumPriceForProductV807(product, { roleCode: 'central_admin' });
if (floor !== 125) throw new Error(`Precio mínimo incorrecto: ${floor}`);

const allowed = context.evaluateCommercialPriceV807(product, 140, 150, { roleCode: 'central_admin', reason: 'Campaña controlada' });
if (!allowed.allowed || allowed.marginPercent !== 28.57) throw new Error('Una venta con margen suficiente fue rechazada.');

const roleBlocked = context.evaluateCommercialPriceV807(product, 140, 150, { roleCode: 'field_seller', seller: false, reason: 'Negociación' });
if (roleBlocked.allowed || !roleBlocked.issues.some(x => x.code === 'discount_limit')) throw new Error('No bloqueó el descuento superior al rol.');

const floorBlocked = context.evaluateCommercialPriceV807(product, 120, 150, { roleCode: 'central_admin', reason: 'Liquidación' });
if (floorBlocked.allowed || !floorBlocked.issues.some(x => x.code === 'below_minimum')) throw new Error('No bloqueó un precio por debajo del margen mínimo.');

const overridden = context.evaluateCommercialPriceV807(product, 120, 150, { roleCode: 'central_admin', reason: 'Autorización excepcional documentada', override: true });
if (!overridden.allowed || !overridden.overrideAccepted) throw new Error('No aceptó la excepción documentada del administrador central.');

context.AppState.settings.commercialPromotions = [{ id: 'pr1', name: 'Julio', active: true, scope: 'product', targetId: 'p1', startsAt: '2026-07-01', endsAt: '2026-07-31', discountPercent: 5 }];
const promos = context.activePromotionsForProductV807(product, '2026-07-20');
if (promos.length !== 1 || context.promotionPriceV807(promos[0], 150) !== 142.5) throw new Error('La promoción controlada no se calculó correctamente.');

const groupItem = [{ productId: 'p1', productName: product.name, unitPrice: 145.5, originalUnitPrice: 150, unitCost: 100, priceSource: 'group', groupName: 'Mayoristas', manualPriceReason: '' }];
const groupValidation = context.validateSaleItemsV807(groupItem, { roleCode: 'field_seller', seller: false });
if (!groupValidation.allowed) throw new Error('Un grupo autorizado dentro del límite fue rechazado por falta de motivo.');

console.log('Reglas comerciales V8.0.7: 6/6 grupos de prueba OK');
