// Verificacion de guardado de precios, existencias y datos del producto.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const products=fs.readFileSync(path.join(root,'js/products.js'),'utf8');
const sync=fs.readFileSync(path.join(root,'js/supabase-sync.js'),'utf8');
const v=JSON.parse(fs.readFileSync(path.join(root,'app-version.json'),'utf8'));
assert.equal(v.version,'10.1.3');
assert(products.includes("id=\"nv1013ProductSaveError\""),'El formulario debe mostrar el error persistente');
assert(products.includes("errorBox.style.display = 'block'"),'El error no debe desaparecer tras el toast');
assert(products.includes("p ? productCost(p) : 0"),'Debe conservarse el costo de un producto legado');
assert(products.includes("await DB.put('products', data)"),'Los cambios deben guardarse primero en Supabase');
assert(products.includes("if (pPrice < rPrice || pPrice < mPrice)"),'Se preservan validaciones comerciales previas');

const found=sync.match(/async function upsertCloudProduct\(product\) \{[\s\S]*?\n\}\n\nasync function deleteCloudProduct/);
assert(found,'La operacion de productos debe existir');
const fn=found[0].replace(/\n\nasync function deleteCloudProduct$/, '');
const expected={id:'demo',cost:7,market_price:11,reseller_price:12,public_price:16,stock:40};
function makeUpdater(value,admin=true){
  const fake={
    from(table){
      assert.equal(table,'products');
      return {upsert(row,opts){
        assert.equal(opts.onConflict,'id');
        assert.deepEqual(row,expected);
        return {select(cols){
          assert(cols.includes('stock')&&cols.includes('reseller_price'));
          return {single:async()=>value};
        }};
      }};
    }
  };
  return new Function('isAdmin','requireClient','mapProductToCloud','messageFromError',
    fn+'\nreturn upsertCloudProduct;')(()=>admin,async()=>fake,async()=>expected,err=>err.message||String(err));
}
(async()=>{
  assert.equal((await makeUpdater({data:{...expected},error:null})(expected)).ok,true,'Guardado normal confirmado');
  const different=await makeUpdater({data:{...expected,stock:10},error:null})(expected);
  assert.equal(different.ok,false,'Cambios rechazados o modificados no pueden reportarse como guardados');
  assert.match(different.message,/stock/,'Debe identificar campo incorrecto');
  assert.equal((await makeUpdater({data:null,error:null})(expected)).ok,false,'No confirmar sin respuesta del servidor');
  assert.equal((await makeUpdater({data:null,error:{message:'Supabase sin conexion'}})(expected)).ok,false,'Errores remotos permanecen visibles');
  assert.equal((await makeUpdater({data:{...expected},error:null},false)(expected)).ok,false,'Respetar permisos de administrador');
  console.log('OK V10.1.3: guardado confirmado, cantidades, errores y roles protegidos.');
})().catch(e=>{console.error(e);process.exitCode=1;});
