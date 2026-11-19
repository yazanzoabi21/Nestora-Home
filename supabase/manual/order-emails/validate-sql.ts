// Offline PostgreSQL grammar checks only. No database/network credentials or SQL execution.
import { parse } from 'npm:libpg-query@17.8.3';
// The v17 JS wrapper does not expose PL/pgSQL parsing; v18 is used ONLY for body grammar.
import { parsePlPgSQL } from 'npm:libpg-query@18.2.4';
const names=['00_preflight.readonly.sql','05_extension_permissions.readonly.sql','06_conflicts.readonly.sql','07_install_extensions.proposed.sql','08_create_signing_key.proposed.sql','10_delivery-ledger.proposed.sql','20_webhook-recovery.proposed.sql','21_activate-hooks.proposed.sql',
  '30_sandbox-activation.proposed.sql','31_production-activation.proposed.sql','32_enroll-test-order.proposed.sql',
  '33_authorize-test-send.proposed.sql','40_postchecks.readonly.sql','41_stage1_postchecks.readonly.sql','50_operations.readonly.sql','60_rollback-validation.sql','80_pause.proposed.sql','81_suspend-recovery.proposed.sql','90_disable.rollback.sql','91_stage1_rollback.proposed.sql'];
let routines=0;
function record(value:unknown):Record<string,unknown>{
  return value!==null && typeof value==='object' && !Array.isArray(value)?value as Record<string,unknown>:{};
}
function assertStageOne(ast:unknown,functionsOnly:boolean):void{
  if(functionsOnly){
    const stmts=record(ast)['stmts'];
    if(!Array.isArray(stmts))throw new Error('Missing SQL statements');
    const allowed=new Set(['TransactionStmt','VariableSetStmt','DoStmt','CreateFunctionStmt','GrantStmt']);
    for(const stmt of stmts)for(const type of Object.keys(record(record(stmt)['stmt'])))
      if(!allowed.has(type))throw new Error(`Functions-only installation contains executable ${type}`);
  }
  const visit=(value:unknown):void=>{
    if(Array.isArray(value)){value.forEach(visit);return;}
    const o=record(value),constraint=record(o['Constraint']),target=record(constraint['pktable']);
    if(constraint['contype']==='CONSTR_FOREIGN' && target['schemaname']==='public' && target['relname']==='orders')
      throw new Error('Stage 1 must not attach a foreign-key trigger to public.orders');
    Object.values(o).forEach(v=>{if(v!==null && typeof v==='object')visit(v);});
  };
  visit(ast);
}
// Negative regression cases: the former activation/foreign-key patterns must be refused.
for(const sql of ['select cron.schedule(\'job\',\'* * * * *\',\'select 1\');',
  'create trigger unsafe after insert on public.orders execute function public.some_function();']){
  let refused=false;try{assertStageOne(await parse(sql),true);}catch{refused=true;}
  if(!refused)throw new Error('Activation guard failed');
}
let foreignKeyRefused=false;
try{assertStageOne(await parse('create table private_test(id uuid references public.orders(id));'),false);}catch{foreignKeyRefused=true;}
if(!foreignKeyRefused)throw new Error('Foreign-key guard failed');
for(const name of names){
  const sql=await Deno.readTextFile(new URL(name,import.meta.url));
  const ast=await parse(sql);
  if(name==='10_delivery-ledger.proposed.sql'||name==='20_webhook-recovery.proposed.sql')assertStageOne(ast,name.startsWith('20_'));
  // Validate complete PL/pgSQL CREATE FUNCTION statements, not only outer SQL grammar.
  const functions=sql.match(/create function[\s\S]*?\$\$;/gi)??[];
  for(const fn of functions)if(/language plpgsql/i.test(fn)){await parsePlPgSQL(fn);routines++;}
    else if(/language sql/i.test(fn)){await parse(fn.split('$$')[1]);routines++;}
  const blocks=sql.match(/do \$\$[\s\S]*?\$\$;/gi)??[];
  for(const block of blocks){
    const body=block.replace(/^do \$\$/i,'').replace(/\$\$;$/,'');
    await parsePlPgSQL(`create function offline_check() returns void language plpgsql as $$${body}$$;`);routines++;
  }
  console.log(`PASS ${name}`);
}
console.log(`Parsed ${names.length} proposals and ${routines} SQL/PLpgSQL bodies. No SQL executed.`);
console.log('PASS Stage 1 activation/FK guards and three negative regressions.');
