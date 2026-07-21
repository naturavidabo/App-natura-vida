from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
index=(root/'index.html').read_text()
module=(root/'js/v8-financial-accounts.js').read_text()
core=(root/'js/v8-financial-core.js').read_text()
state=(root/'js/state.js').read_text()
db=(root/'js/db.js').read_text()
sync=(root/'js/supabase-sync.js').read_text()
version=json.loads((root/'app-version.json').read_text())
checks={
 'version 8.2.0':version.get('version')=='8.2.1',
 'core loaded':'js/v8-financial-core.js?v=8.2.1' in index,
 'module loaded':'js/v8-financial-accounts.js?v=8.2.1' in index,
 'account tab':'estado-cuenta' in (root/'js/v7-shell.js').read_text(),
 'client button':'accountClientBtnV820' in (root/'js/clients.js').read_text(),
 'historical state':'historicalReceivables' in state,
 'documents state':'financialDocuments' in state,
 'generic cloud sync':all(x in sync for x in ['historicalReceivables','financialDocuments','paymentPlans']),
 'payment allocations':'allocatePayment' in core and 'allocations' in module,
 'historical import':'openHistoricalImportV820' in module and 'inventoryImpact:false' in core.replace(' ',''),
 'consolidated receipt':'RECIBO CONSOLIDADO DE COBRO' in module,
 'pdf output':'downloadCanvasPagedPdfV820' in module,
 'whatsapp/share':'shareCanvasV820' in module,
 'audit':'receivable_payment_posted' in module and 'historical_receivables_imported' in module,
 'sql migration':(root/'supabase/migrations/20260721_v820_financial_accounts.sql').exists(),
 'gabriela fixture':(root/'data/imports/gabriela-espinoza-mi-negocio.json').exists(),
 'stores persisted':all(x in db for x in ['historicalReceivables','financialDocuments','paymentPlans']),
 'qr in financial documents':'QR DE PAGO' in module and 'commercial.qrUrl' in module,
 'summary and detailed modes':'openDocumentModePickerV820' in module and 'Versión resumida' in module and 'Versión detallada' in module,
 'payment plan schedule':'openPaymentPlanFormV820' in module and 'planSchedule' in module and 'CRONOGRAMA DEL PLAN DE PAGOS' in module,
 'csv exports':'exportReceivablesCsvV820' in module and 'exportClientFinancialCsvV820' in module,
}
failed=[k for k,v in checks.items() if not v]
if failed: raise SystemExit('FALLÓ: '+', '.join(failed))
print(f'Interfaz financiera V8.2.1: {len(checks)}/{len(checks)} controles OK')
