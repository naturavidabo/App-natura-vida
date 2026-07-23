#!/usr/bin/env python3
from pathlib import Path
import json, sys
ROOT=Path(__file__).resolve().parents[1]
read=lambda p:(ROOT/p).read_text(encoding='utf-8')
index=read('index.html'); state=read('js/state.js'); rules=read('js/v8-commercial-rules.js')
products=read('js/products.js'); prices=read('js/pricegroups.js'); sales=read('js/sales.js')
rep=read('js/v7-inventory-sales.js'); settings=read('js/settings.js'); app=read('js/app.js')
shell=read('js/v7-shell.js'); center=read('js/v7-management-center.js'); sw=read('service-worker.js'); css=read('css/v8.css')
version=json.loads(read('app-version.json'))
checks={
 'versión 8.2.0':version.get('version')=='8.2.4',
 'módulo cargado':'js/v8-commercial-rules.js?v=8.2.4' in index,
 'orden de carga':index.index('v8-commercial-rules.js') < index.index('products.js') < index.index('sales.js'),
 'módulo en caché':"'./js/v8-commercial-rules.js'" in sw,
 'configuración persistente':'commercialRules' in state and 'commercialPromotions' in state,
 'costo y margen':'realCostForProductV807' in rules and 'minimumPriceForProductV807' in rules and 'marginPercentV807' in rules,
 'descuento por rol':'roleDiscountLimits' in rules and 'roleDiscountLimitV807' in rules,
 'promociones':'openPromotionFormV807' in rules and 'activePromotionsForProductV807' in rules,
 'simulador':'openUtilitySimulatorV807' in rules and 'Utilidad total' in rules,
 'precio mínimo por producto':'minimumAuthorizedPrice' in products and 'nv807MinimumField' in products,
 'grupos limitados por rol':'roleDiscountLimitV807' in prices,
 'venta central validada':'validateSaleItemsV807' in sales and "commercialRulesVersion: '8.0.7'" in sales,
 'venta representante validada':'validateSaleItemsV807' in rep and "commercialRulesVersion:'8.0.7'" in rep,
 'beneficio de cliente validado':'blockedMessages' in rep and 'evaluateCommercialPriceV807' in rep,
 'ruta administrativa':'reglas-comerciales' in app and 'renderCommercialRulesV807' in app and 'reglas-comerciales' in shell,
 'acceso configuración':'openCommercialRulesV807Btn' in settings,
 'acceso panel Más':'Reglas, márgenes y descuentos' in center,
 'estilos responsivos':'.nv807MetricGrid' in css and '.nv807RoleLimits' in css and '@media(max-width:640px)' in css,
 'sin IA automática':'La IA todavía no modifica precios' in rules,
}
failed=[name for name,ok in checks.items() if not ok]
print(f"Integración comercial V8.2.4: {len(checks)-len(failed)}/{len(checks)} controles OK")
if failed:
 for name in failed: print('ERROR:',name)
 sys.exit(1)
