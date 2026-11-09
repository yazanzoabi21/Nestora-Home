const fs=require('fs'),path=require('path');
const parser=require(process.env.PHASE2_SQL_PARSER || 'libpg-query');
(async()=>{
 const report={scope:'Offline parsing only. No database connection or SQL execution.',parserPackage:'libpg-query',files:[],dynamicStatementTemplates:[]};
 for(const name of fs.readdirSync(__dirname).filter(n=>n.endsWith('.sql')).sort()){
  const sql=fs.readFileSync(path.join(__dirname,name),'utf8');const row={file:name,sqlLanguageBodies:0};
  try{
   const ast=await parser.parse(sql);row.sql='PASS';row.parserVersion=ast.version;row.statements=ast.stmts?.length;
   const pl=await parser.parsePlPgSQL(sql);row.plpgsql='PASS';row.plpgsqlBodies=pl.plpgsql_funcs?.length;
   for(const match of sql.matchAll(/create(?: or replace)? function[\s\S]*?as \$\$([\s\S]*?)\$\$;/gi)){
    if(/language sql\b/i.test(match[0].slice(0,match[0].indexOf('as $$')))){
     await parser.parse(match[1]);row.sqlLanguageBodies++;
    }
   }
  }catch(e){row.error=e.message;process.exitCode=1;}
  report.files.push(row);
 }
 for(const command of ['SELECT','INSERT','UPDATE','DELETE','ALL']){
  const predicate='((select nestora_phase2.active_actor_role()) is not null)';
  const sql='CREATE POLICY phase2_active_'+command.toLowerCase()+' ON public.profiles AS RESTRICTIVE FOR '+command+' TO authenticated '+
   (['SELECT','UPDATE','DELETE','ALL'].includes(command)?'USING ('+predicate+') ':'')+
   (['INSERT','UPDATE','ALL'].includes(command)?'WITH CHECK ('+predicate+')':'');
  await parser.parse(sql);report.dynamicStatementTemplates.push({command,parse:'PASS'});
 }
 for(const sql of [
  "ALTER ROLE authenticator IN DATABASE staging_review SET pgrst.db_pre_request='nestora_phase2.check_active_data_api_account'",
  'ALTER ROLE authenticator IN DATABASE staging_review RESET pgrst.db_pre_request',
  'GRANT nestora_phase2_access_manager TO postgres','REVOKE nestora_phase2_access_manager FROM postgres',
  'DROP POLICY phase2_active_select ON public.profiles']){
  await parser.parse(sql);report.dynamicStatementTemplates.push({sql,parse:'PASS'});
 }
 report.limitations=['PG18.4 grammar, target hosted version unknown','No existing-object/type/owner/ACL resolution','No execution or rollback test','No concurrency/load/cascade test','No live Supabase hook verification','Current deployed guard definition not available to validate its runtime restoration'];
 fs.writeFileSync(path.join(__dirname,'SQL_PARSE_REPORT.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
